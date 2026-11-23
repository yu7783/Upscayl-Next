import {
  HardwareVideoEncoder,
  VideoCodec,
  VideoContainerFormat,
  VideoIntermediateFormat,
  VideoProgressStage,
  VideoQualityPreset,
} from "./types/types";

export const DEFAULT_VIDEO_CHUNK_SIZE = 60;
export const FAST_JPG_CHUNK_SIZE = 150;
const MAX_SENSIBLE_FPS = 240;
const MIN_SENSIBLE_FPS = 1;

export type ParsedFrameRate = {
  fps: number;
  rational: string;
};

const parseRationalValue = (raw?: string | null): ParsedFrameRate | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0/0" || trimmed === "N/A") return null;

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) return null;
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
      return null;
    }
    const fps = num / den;
    if (
      !Number.isFinite(fps) ||
      fps < MIN_SENSIBLE_FPS ||
      fps > MAX_SENSIBLE_FPS
    ) {
      return null;
    }
    return { fps, rational: `${Math.round(num)}/${Math.round(den)}` };
  }

  const numeric = Number(trimmed);
  if (
    !Number.isFinite(numeric) ||
    numeric < MIN_SENSIBLE_FPS ||
    numeric > MAX_SENSIBLE_FPS
  ) {
    return null;
  }

  return {
    fps: numeric,
    rational: Number.isInteger(numeric)
      ? `${numeric}/1`
      : numeric.toFixed(3).replace(/\.?0+$/, ""),
  };
};

/**
 * Determine a reliable constant frame rate for frame extraction and re-encoding.
 *
 * `avg_frame_rate` is preferred over `r_frame_rate` because VFR containers
 * (smartphones, OBS, WebM) frequently report container timebases such as
 * `90000/1` or `1000/1` in `r_frame_rate`, which would otherwise produce a
 * corrupted, sped-up output video.
 */
export function parseFrameRate({
  avgFrameRate,
  rFrameRate,
  nbFrames,
  duration,
}: {
  avgFrameRate?: string | null;
  rFrameRate?: string | null;
  nbFrames?: number | null;
  duration?: number | null;
}): ParsedFrameRate {
  const fromAvg = parseRationalValue(avgFrameRate);
  if (fromAvg) return fromAvg;

  const fromR = parseRationalValue(rFrameRate);
  if (fromR) return fromR;

  if (
    typeof nbFrames === "number" &&
    typeof duration === "number" &&
    Number.isFinite(nbFrames) &&
    Number.isFinite(duration) &&
    nbFrames > 0 &&
    duration > 0
  ) {
    const computed = nbFrames / duration;
    if (computed >= MIN_SENSIBLE_FPS && computed <= MAX_SENSIBLE_FPS) {
      const rounded = Math.round(computed * 1000) / 1000;
      return {
        fps: rounded,
        rational: rounded.toString(),
      };
    }
  }

  return { fps: 30, rational: "30/1" };
}

/**
 * Pick a GPU-friendly "load:proc:save" thread split specifically for video frame
 * batches.
 *
 * Keeping `proc` at 2 (or 1 after a VRAM fallback) saturates a single Vulkan
 * GPU without multiplying per-thread tile VRAM buffers, while scaling `load`
 * and `save` CPU threads prevents disk/codec I/O from starving the GPU.
 */
export function getVideoThreadCount({
  cpuCount,
  vramConstrained = false,
}: {
  cpuCount: number;
  vramConstrained?: boolean;
}): string {
  const cores = Math.max(1, Math.floor(cpuCount) || 1);
  const load = Math.max(1, Math.min(4, Math.floor(cores / 2) || 1));
  const proc = vramConstrained ? 1 : Math.min(2, cores);
  const save = Math.max(2, Math.min(6, Math.ceil(cores / 2)));
  return `${load}:${proc}:${save}`;
}

/**
 * Choose chunk size based on intermediate frame format.
 *
 * Near-lossless JPEG frames are ~8-10x smaller than PNG, so larger chunks
 * reduce Vulkan/model startup reloads without risking temp-drive exhaustion.
 */
export function computeOptimalChunkSize(
  totalFrames: number,
  intermediateFormat: VideoIntermediateFormat = "jpg",
): number {
  const base =
    intermediateFormat === "jpg"
      ? FAST_JPG_CHUNK_SIZE
      : DEFAULT_VIDEO_CHUNK_SIZE;
  if (totalFrames <= 0) return base;
  return Math.min(totalFrames, base);
}

const HW_ENCODER_PRIORITY: Record<VideoCodec, HardwareVideoEncoder[]> = {
  h264: ["h264_nvenc", "h264_amf", "h264_qsv", "h264_videotoolbox"],
  h265: ["hevc_nvenc", "hevc_amf", "hevc_qsv", "hevc_videotoolbox"],
  vp9: [],
};

/**
 * Pick the fastest working hardware encoder for the requested codec, or null
 * to use optimized CPU software encoding.
 */
export function resolveHardwareEncoder(
  codec: VideoCodec,
  availableHwEncoders: readonly HardwareVideoEncoder[],
): HardwareVideoEncoder | null {
  const candidates = HW_ENCODER_PRIORITY[codec] ?? [];
  for (const candidate of candidates) {
    if (availableHwEncoders.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Normalize container/codec pairings so FFmpeg never receives an incompatible
 * combination (e.g. VP9 inside MP4 or H.265 inside WebM).
 */
export function resolveVideoEncodingProfile({
  codec = "h264",
  container = "mp4",
  quality = "balanced",
}: {
  codec?: VideoCodec;
  container?: VideoContainerFormat;
  quality?: VideoQualityPreset;
}): {
  codec: VideoCodec;
  container: VideoContainerFormat;
  quality: VideoQualityPreset;
  videoEncoder: string;
  crf: string;
  audioEncoder: string;
  audioBitrate: string;
} {
  let resolvedContainer: VideoContainerFormat = container;
  let resolvedCodec: VideoCodec = codec;

  if (resolvedCodec === "vp9" && resolvedContainer === "mp4") {
    resolvedContainer = "webm";
  }
  if (resolvedContainer === "webm" && resolvedCodec !== "vp9") {
    resolvedCodec = "vp9";
  }

  if (resolvedCodec === "h265") {
    const crfMap: Record<VideoQualityPreset, string> = {
      high: "18",
      balanced: "22",
      compact: "27",
    };
    return {
      codec: resolvedCodec,
      container: resolvedContainer,
      quality,
      videoEncoder: "libx265",
      crf: crfMap[quality] ?? "22",
      audioEncoder: "aac",
      audioBitrate: "192k",
    };
  }

  if (resolvedCodec === "vp9") {
    const crfMap: Record<VideoQualityPreset, string> = {
      high: "24",
      balanced: "30",
      compact: "36",
    };
    return {
      codec: resolvedCodec,
      container: resolvedContainer,
      quality,
      videoEncoder: "libvpx-vp9",
      crf: crfMap[quality] ?? "30",
      audioEncoder: "libopus",
      audioBitrate: "160k",
    };
  }

  const crfMap: Record<VideoQualityPreset, string> = {
    high: "16",
    balanced: "18",
    compact: "23",
  };
  return {
    codec: "h264",
    container: resolvedContainer,
    quality,
    videoEncoder: "libx264",
    crf: crfMap[quality] ?? "18",
    audioEncoder: "aac",
    audioBitrate: "192k",
  };
}

/**
 * Build FFmpeg arguments to extract CFR frames matching the target rational
 * framerate so VFR inputs remain synchronized with their audio track.
 *
 * Uses multi-threaded decoding (`-threads 0`), optional hardware decoding
 * (`-hwaccel auto`), and fast intermediate compression (`-q:v 1` for JPEG or
 * `-compression_level 1` for PNG).
 */
export function buildVideoExtractArgs({
  inputVideo,
  outputPattern,
  fpsRational,
  intermediateFormat = "jpg",
  useHwDecode = true,
}: {
  inputVideo: string;
  outputPattern: string;
  fpsRational: string;
  intermediateFormat?: VideoIntermediateFormat;
  useHwDecode?: boolean;
}): string[] {
  const args: string[] = ["-y", "-threads", "0"];

  if (useHwDecode) {
    args.push("-hwaccel", "auto");
  }

  args.push("-i", inputVideo, "-vf", `fps=${fpsRational}`, "-start_number", "1");

  if (intermediateFormat === "jpg") {
    // Near-lossless JPEG: ~5-10x faster than PNG with ~8x smaller temp files
    args.push("-q:v", "1", "-qmin", "1");
  } else {
    // Fast zlib level 1 for lossless PNG (~3-4x faster than default level 6)
    args.push("-compression_level", "1");
  }

  args.push(outputPattern);
  return args;
}

const getHardwareEncoderArgs = (
  hwEncoder: HardwareVideoEncoder,
  quality: VideoQualityPreset,
): string[] => {
  if (hwEncoder === "h264_nvenc" || hwEncoder === "hevc_nvenc") {
    const cqMap: Record<VideoQualityPreset, string> =
      hwEncoder === "hevc_nvenc"
        ? { high: "18", balanced: "22", compact: "27" }
        : { high: "16", balanced: "19", compact: "24" };
    const args = [
      "-c:v",
      hwEncoder,
      "-preset",
      "p4",
      "-rc",
      "vbr",
      "-cq",
      cqMap[quality] ?? "19",
      "-b:v",
      "0",
    ];
    if (hwEncoder === "hevc_nvenc") {
      args.push("-tag:v", "hvc1");
    }
    return args;
  }

  if (hwEncoder === "h264_amf" || hwEncoder === "hevc_amf") {
    const qpMap: Record<VideoQualityPreset, string> =
      hwEncoder === "hevc_amf"
        ? { high: "18", balanced: "22", compact: "27" }
        : { high: "16", balanced: "19", compact: "24" };
    const qp = qpMap[quality] ?? "19";
    const args = [
      "-c:v",
      hwEncoder,
      "-quality",
      "balanced",
      "-rc",
      "cqp",
      "-qp_i",
      qp,
      "-qp_p",
      qp,
    ];
    if (hwEncoder === "hevc_amf") {
      args.push("-tag:v", "hvc1");
    }
    return args;
  }

  if (hwEncoder === "h264_qsv" || hwEncoder === "hevc_qsv") {
    const qMap: Record<VideoQualityPreset, string> =
      hwEncoder === "hevc_qsv"
        ? { high: "19", balanced: "23", compact: "28" }
        : { high: "17", balanced: "20", compact: "25" };
    const args = [
      "-c:v",
      hwEncoder,
      "-preset",
      "faster",
      "-global_quality",
      qMap[quality] ?? "20",
    ];
    if (hwEncoder === "hevc_qsv") {
      args.push("-tag:v", "hvc1");
    }
    return args;
  }

  // macOS VideoToolbox
  const qMap: Record<VideoQualityPreset, string> = {
    high: "75",
    balanced: "65",
    compact: "50",
  };
  const args = ["-c:v", hwEncoder, "-q:v", qMap[quality] ?? "65"];
  if (hwEncoder === "hevc_videotoolbox") {
    args.push("-tag:v", "hvc1");
  }
  return args;
};

/**
 * Build FFmpeg arguments to encode upscaled frames (either from stdin
 * `image2pipe` or from a filename pattern) into the final video file.
 *
 * - Supports GPU hardware encoding (NVENC / AMF / QSV / VideoToolbox) when
 *   available, falling back to fast multi-threaded software presets.
 * - Pads odd dimensions (`pad=ceil(iw/2)*2:ceil(ih/2)*2`) so `yuv420p`
 *   encoders never fail on odd-sized frames or custom widths.
 */
export function buildVideoEncodeArgs({
  fpsRational,
  inputVideo,
  outputFile,
  codec = "h264",
  container = "mp4",
  quality = "balanced",
  keepAudio = true,
  hasAudio = true,
  usePipe = true,
  framesPattern,
  intermediateFormat = "jpg",
  hardwareEncoder = null,
}: {
  fpsRational: string;
  inputVideo: string;
  outputFile: string;
  codec?: VideoCodec;
  container?: VideoContainerFormat;
  quality?: VideoQualityPreset;
  keepAudio?: boolean;
  hasAudio?: boolean;
  usePipe?: boolean;
  framesPattern?: string;
  intermediateFormat?: VideoIntermediateFormat;
  hardwareEncoder?: HardwareVideoEncoder | null;
}): string[] {
  const profile = resolveVideoEncodingProfile({ codec, container, quality });
  const pipeCodec = intermediateFormat === "jpg" ? "mjpeg" : "png";
  const args: string[] = ["-y", "-threads", "0"];

  if (usePipe) {
    args.push(
      "-f",
      "image2pipe",
      "-vcodec",
      pipeCodec,
      "-framerate",
      fpsRational,
      "-i",
      "pipe:0",
    );
  } else {
    args.push(
      "-framerate",
      fpsRational,
      "-i",
      framesPattern ??
        (intermediateFormat === "jpg" ? "frame_%08d.jpg" : "frame_%08d.png"),
    );
  }

  const shouldIncludeAudio = keepAudio && hasAudio;
  if (shouldIncludeAudio) {
    args.push("-i", inputVideo, "-map", "0:v:0", "-map", "1:a?");
  } else {
    args.push("-map", "0:v:0", "-an");
  }

  args.push("-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2");

  if (hardwareEncoder && profile.codec !== "vp9") {
    args.push(...getHardwareEncoderArgs(hardwareEncoder, profile.quality));
  } else if (profile.codec === "vp9") {
    args.push(
      "-c:v",
      profile.videoEncoder,
      "-b:v",
      "0",
      "-crf",
      profile.crf,
      "-deadline",
      "good",
      "-cpu-used",
      "4",
      "-row-mt",
      "1",
    );
  } else {
    args.push(
      "-c:v",
      profile.videoEncoder,
      "-preset",
      "fast",
      "-crf",
      profile.crf,
    );
    if (profile.codec === "h265") {
      args.push("-tag:v", "hvc1");
    }
  }

  args.push("-pix_fmt", "yuv420p");

  if (profile.container === "mp4") {
    args.push("-movflags", "+faststart");
  }

  if (shouldIncludeAudio) {
    args.push("-c:a", profile.audioEncoder, "-b:a", profile.audioBitrate);
  }

  args.push(outputFile);
  return args;
}

export type FrameFingerprint = {
  name: string;
  hash: string;
};

export type ChunkDeduplicationPlan = {
  /** Frame names that must actually be sent to the GPU upscaler. */
  uniqueFrames: string[];
  /**
   * Ordered emission entries for piping to FFmpeg. Each entry either points to
   * a unique frame upscaled in this chunk (`sourceFrame`) or reuses the last
   * upscaled frame carried over from the previous chunk (`reusePreviousChunk`).
   */
  emitOrder: Array<{
    name: string;
    sourceFrame: string | null;
    reusePreviousChunk: boolean;
  }>;
  skippedCount: number;
  lastHash: string | null;
};

/**
 * Identify byte-identical consecutive frames within a chunk (including across
 * chunk boundaries) so the GPU upscaler only processes unique frames.
 */
export function planDeduplicatedChunk(
  frames: readonly FrameFingerprint[],
  previousChunkLastHash: string | null = null,
): ChunkDeduplicationPlan {
  const uniqueFrames: string[] = [];
  const emitOrder: ChunkDeduplicationPlan["emitOrder"] = [];
  let skippedCount = 0;
  let lastHash: string | null = previousChunkLastHash;
  let lastUniqueInChunk: string | null = null;

  for (const frame of frames) {
    if (lastHash !== null && frame.hash === lastHash) {
      skippedCount += 1;
      emitOrder.push({
        name: frame.name,
        sourceFrame: lastUniqueInChunk,
        reusePreviousChunk: lastUniqueInChunk === null,
      });
    } else {
      uniqueFrames.push(frame.name);
      lastUniqueInChunk = frame.name;
      lastHash = frame.hash;
      emitOrder.push({
        name: frame.name,
        sourceFrame: frame.name,
        reusePreviousChunk: false,
      });
    }
  }

  return {
    uniqueFrames,
    emitOrder,
    skippedCount,
    lastHash,
  };
}

export type ChunkRange = {
  start: number;
  end: number;
  chunkIndex: number;
  totalChunks: number;
};

/**
 * Split `totalItems` frames into bounded chunks so peak temporary disk usage
 * stays predictable even for long videos.
 */
export function computeChunkRanges(
  totalItems: number,
  chunkSize: number = DEFAULT_VIDEO_CHUNK_SIZE,
): ChunkRange[] {
  if (totalItems <= 0) return [];
  const safeSize = Math.max(1, Math.floor(chunkSize));
  const totalChunks = Math.ceil(totalItems / safeSize);
  const ranges: ChunkRange[] = [];

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * safeSize;
    const end = Math.min(start + safeSize, totalItems);
    ranges.push({
      start,
      end,
      chunkIndex: i + 1,
      totalChunks,
    });
  }

  return ranges;
}

/**
 * Map a video pipeline stage and its local progress (0..1) into an overall
 * 0..1 fraction for the taskbar and UI progress bar.
 */
export function calculateVideoOverallProgress(
  stage: VideoProgressStage,
  stageFraction: number,
): number {
  const clamped = Math.min(Math.max(stageFraction, 0), 1);
  switch (stage) {
    case "preparing":
      return 0.02 * clamped;
    case "extracting":
      return 0.02 + 0.13 * clamped;
    case "upscaling":
      return 0.15 + 0.8 * clamped;
    case "encoding":
      return 0.95 + 0.05 * clamped;
    default:
      return clamped;
  }
}

export function buildVideoOutputFilename({
  inputName,
  model,
  scale,
  useCustomWidth,
  customWidth,
  container = "mp4",
  codec = "h264",
}: {
  inputName: string;
  model: string;
  scale: string;
  useCustomWidth: boolean;
  customWidth: string;
  container?: VideoContainerFormat;
  codec?: VideoCodec;
}): string {
  const profile = resolveVideoEncodingProfile({ codec, container });
  const scaleLabel = useCustomWidth ? `${customWidth}px` : `${scale}x`;
  return `${inputName}_upscayl_${model}_${scaleLabel}.${profile.container}`;
}

export function estimateVideoOutputDimensions({
  width,
  height,
  scale,
  useCustomWidth,
  customWidth,
}: {
  width: number;
  height: number;
  scale: string;
  useCustomWidth: boolean;
  customWidth: number;
}): { width: number; height: number } | null {
  if (width <= 0 || height <= 0) return null;

  let outWidth: number;
  let outHeight: number;

  if (useCustomWidth && customWidth > 0) {
    outWidth = Math.round(customWidth);
    outHeight = Math.round((customWidth * height) / width);
  } else {
    const factor = Number(scale);
    if (!Number.isFinite(factor) || factor <= 0) return null;
    outWidth = Math.round(width * factor);
    outHeight = Math.round(height * factor);
  }

  // Matches the even-dimension padding filter used during encoding.
  return {
    width: Math.ceil(outWidth / 2) * 2,
    height: Math.ceil(outHeight / 2) * 2,
  };
}

export function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}
