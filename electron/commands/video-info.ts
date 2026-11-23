import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import decodePath from "../../common/decode-path";
import { FfmpegStatus, VideoMediaInfo } from "../../common/types/types";
import { parseFrameRate } from "../../common/video-upscayl-helpers";
import { getPlatform } from "../utils/get-device-specs";
import { execPath } from "../utils/get-resource-paths";

const binExt = () => (getPlatform() === "win" ? ".exe" : "");

/**
 * Resolve the executable path for `ffmpeg` or `ffprobe`.
 *
 * Resolution order:
 * 1. Explicit environment override (`UPSCAYL_FFMPEG_PATH` / `UPSCAYL_FFPROBE_PATH`)
 * 2. Bundled next to `upscayl-bin` inside `resources/bin`
 * 3. System `PATH`
 */
export function resolveMediaBinary(tool: "ffmpeg" | "ffprobe"): string {
  const envKey =
    tool === "ffmpeg" ? "UPSCAYL_FFMPEG_PATH" : "UPSCAYL_FFPROBE_PATH";
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const binDir = path.dirname(execPath);
  const bundled = path.join(binDir, `${tool}${binExt()}`);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  return tool;
}

const probeBinaryVersion = (binaryPath: string): string | null => {
  try {
    const result = spawnSync(binaryPath, ["-version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    if (result.error || result.status !== 0) {
      return null;
    }
    const firstLine = result.stdout?.split(/\r?\n/)[0]?.trim() ?? "";
    const match = firstLine.match(/version\s+([^\s]+)/i);
    return match ? match[1] : firstLine || "detected";
  } catch {
    return null;
  }
};

export function checkFfmpegStatus(): FfmpegStatus {
  const ffmpegBin = resolveMediaBinary("ffmpeg");
  const ffprobeBin = resolveMediaBinary("ffprobe");
  const ffmpegVersion = probeBinaryVersion(ffmpegBin);
  const ffprobeVersion = probeBinaryVersion(ffprobeBin);

  const hasFfmpeg = ffmpegVersion !== null;
  const hasFfprobe = ffprobeVersion !== null;

  return {
    available: hasFfmpeg && hasFfprobe,
    hasFfmpeg,
    hasFfprobe,
    ffmpegPath: hasFfmpeg ? ffmpegBin : null,
    ffprobePath: hasFfprobe ? ffprobeBin : null,
    version: ffmpegVersion,
  };
}

export function probeVideoMediaInfo(rawVideoPath: string): VideoMediaInfo | null {
  if (!rawVideoPath || rawVideoPath.trim().length === 0) return null;
  const inputPath = decodePath(rawVideoPath);

  let fileSize = 0;
  try {
    const stat = fs.statSync(inputPath);
    if (!stat.isFile()) return null;
    fileSize = stat.size;
  } catch {
    return null;
  }

  const ffprobeBin = resolveMediaBinary("ffprobe");
  const result = spawnSync(
    ffprobeBin,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    },
  );

  if (result.error || result.status !== 0 || !result.stdout) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const streams: any[] = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find((s) => s.codec_type === "video");
    const audioStream = streams.find((s) => s.codec_type === "audio");

    if (!videoStream) return null;

    const rawWidth = Number(videoStream.width) || 0;
    const rawHeight = Number(videoStream.height) || 0;

    // Account for 90°/270° display rotation metadata (common on phone videos)
    // because FFmpeg auto-rotates frames during extraction.
    let rotation = 0;
    if (videoStream.tags?.rotate) {
      rotation = Math.abs(Number(videoStream.tags.rotate)) % 360;
    } else if (Array.isArray(videoStream.side_data_list)) {
      const displayMatrix = videoStream.side_data_list.find(
        (item: any) => typeof item.rotation === "number",
      );
      if (displayMatrix) {
        rotation = Math.abs(Math.round(displayMatrix.rotation)) % 360;
      }
    }
    const isRotated = rotation === 90 || rotation === 270;
    const width = isRotated ? rawHeight : rawWidth;
    const height = isRotated ? rawWidth : rawHeight;

    const formatDuration = Number(parsed.format?.duration);
    const streamDuration = Number(videoStream.duration);
    const duration =
      Number.isFinite(formatDuration) && formatDuration > 0
        ? formatDuration
        : Number.isFinite(streamDuration) && streamDuration > 0
          ? streamDuration
          : 0;

    const nbFrames = Number(videoStream.nb_frames);
    const { fps, rational } = parseFrameRate({
      avgFrameRate: videoStream.avg_frame_rate,
      rFrameRate: videoStream.r_frame_rate,
      nbFrames: Number.isFinite(nbFrames) && nbFrames > 0 ? nbFrames : null,
      duration: duration > 0 ? duration : null,
    });

    const estimatedFrames =
      duration > 0
        ? Math.max(1, Math.round(duration * fps))
        : Number.isFinite(nbFrames) && nbFrames > 0
          ? Math.round(nbFrames)
          : 0;

    return {
      path: inputPath,
      width,
      height,
      fps,
      fpsRational: rational,
      duration,
      estimatedFrames,
      hasAudio: Boolean(audioStream),
      videoCodec: videoStream.codec_name ?? null,
      audioCodec: audioStream?.codec_name ?? null,
      fileSize,
    };
  } catch {
    return null;
  }
}

export const handleCheckFfmpeg = async (): Promise<FfmpegStatus> =>
  checkFfmpegStatus();

export const handleGetVideoInfo = async (
  _event: any,
  videoPath: string,
): Promise<VideoMediaInfo | null> => probeVideoMediaInfo(videoPath);
