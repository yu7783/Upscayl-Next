import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getMainWindow } from "../main-window";
import {
  TrackedChildProcess,
  childProcesses,
  registerTempDir,
  removeChildProcess,
  savedCustomModelsPath,
  setStopped,
  stopped,
  unregisterTempDir,
} from "../utils/config-variables";
import logit from "../utils/logit";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { getBatchArguments } from "../utils/get-arguments";
import { modelsPath } from "../utils/get-resource-paths";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import {
  VideoDoneInfo,
  VideoIntermediateFormat,
  VideoInterpolationEngine,
  VideoInterpolationFactor,
  VideoProgressInfo,
  VideoProgressStage,
  VideoSessionManifest,
  VideoUpscaylPayload,
} from "../../common/types/types";
import showNotification from "../utils/show-notification";
import { MODELS } from "../../common/models-list";
import decodePath from "../../common/decode-path";
import countOccurrences from "../../common/count-occurrences";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";
import {
  ChunkDeduplicationPlan,
  FrameFingerprint,
  ResolvedTrimRange,
  buildRifeArgs,
  buildVideoConcatArgs,
  buildVideoEncodeArgs,
  buildVideoExtractArgs,
  buildVideoOutputFilename,
  calculateVideoOverallProgress,
  computeChunkRanges,
  computeOptimalChunkSize,
  getVideoThreadCount,
  planDeduplicatedChunk,
  resolveHardwareEncoder,
  resolveVideoEncodingProfile,
  resolveVideoTrimRange,
  scaleRationalFps,
} from "../../common/video-upscayl-helpers";
import { checkFfmpegStatus, probeVideoMediaInfo } from "./video-info";
import {
  discardVideoSession,
  getVideoSessionDir,
  loadVideoSessionManifest,
  saveVideoSessionManifest,
} from "./video-sessions";

const MAX_MEMORY_RETRIES = 6;
const STDERR_TAIL_LIMIT = 800;
const HASH_CONCURRENCY = 16;

const timeToSeconds = (timeText: string): number => {
  const [hours, minutes, seconds] = timeText.split(":").map(Number);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;
  return hours * 3600 + minutes * 60 + seconds;
};

const getUniqueOutputPath = (folder: string, fileName: string) => {
  const parsed = path.parse(fileName);
  let candidate = path.join(folder, fileName);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(folder, `${parsed.name}_${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
};

const extractLastErrorLine = (stderrTail: string): string => {
  const lines = stderrTail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(" | ");
};

const frameFileName = (oneBasedIndex: number, ext: string): string =>
  `frame_${String(oneBasedIndex).padStart(8, "0")}${ext}`;

const segmentFileName = (chunkIndex: number, ext: string): string =>
  `seg_${String(chunkIndex).padStart(5, "0")}.${ext}`;

const escapeConcatPath = (filePath: string): string =>
  filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");

const linkOrCopySync = (src: string, dst: string) => {
  try {
    fs.linkSync(src, dst);
  } catch {
    fs.copyFileSync(src, dst);
  }
};

const writeBufferToStream = (
  stream: NodeJS.WritableStream,
  buffer: Buffer,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      stream.removeListener("error", onError);
      stream.removeListener("drain", onDrain);
    };

    stream.once("error", onError);
    const canContinue = stream.write(buffer);
    if (canContinue) {
      cleanup();
      resolve();
    } else {
      stream.once("drain", onDrain);
    }
  });

const hashFrameBatch = async (
  dir: string,
  frameNames: readonly string[],
): Promise<FrameFingerprint[]> => {
  const results: FrameFingerprint[] = new Array(frameNames.length);
  for (let i = 0; i < frameNames.length; i += HASH_CONCURRENCY) {
    const slice = frameNames.slice(i, i + HASH_CONCURRENCY);
    await Promise.all(
      slice.map(async (name, offset) => {
        const data = await fs.promises.readFile(path.join(dir, name));
        const hash = crypto.createHash("sha1").update(data).digest("hex");
        results[i + offset] = { name, hash };
      }),
    );
  }
  return results;
};

export type VideoJobCallbacks = {
  onProgress?: (info: VideoProgressInfo, overallFraction: number) => void;
  onWarning?: (message: string) => void;
};

/**
 * Core reusable video upscaling engine supporting:
 * - Optional trim range (start/end seconds) with synced audio slicing
 * - Resumable chunk-segment persistence across stop/restart
 * - GPU hardware video encoding (NVENC/AMF/QSV/VideoToolbox) + fast CPU fallback
 * - Fast JPEG / lossless PNG intermediate frame pipelines
 * - Exact consecutive-frame deduplication
 * - AI frame interpolation (2x/4x via RIFE Vulkan or FFmpeg optical-flow MCI)
 * - Double-buffered asynchronous chunk upscaling & encoding
 */
export async function runVideoUpscaylJob(
  payload: VideoUpscaylPayload,
  callbacks: VideoJobCallbacks = {},
): Promise<VideoDoneInfo | null> {
  const startedAt = Date.now();

  const ffmpegStatus = checkFfmpegStatus();
  if (!ffmpegStatus.hasFfmpeg || !ffmpegStatus.ffmpegPath) {
    throw new Error(
      "FFmpeg was not found. Install FFmpeg and make sure it is available in your PATH to upscale videos.",
    );
  }
  if (!ffmpegStatus.hasFfprobe) {
    throw new Error(
      "FFprobe was not found. Install FFmpeg (including ffprobe) and make sure it is available in your PATH to upscale videos.",
    );
  }

  const ffmpegBin = ffmpegStatus.ffmpegPath;

  // Load existing manifest when resuming a previously interrupted session
  let manifest: VideoSessionManifest | null = null;
  if (payload.resumeSessionId) {
    manifest = loadVideoSessionManifest(payload.resumeSessionId);
    if (!manifest) {
      throw new Error(
        `Could not find resumable video session: ${payload.resumeSessionId}`,
      );
    }
  }

  const inputVideo = manifest
    ? manifest.inputVideo
    : decodePath(payload.videoPath ?? "");
  const outputBasePath = manifest
    ? manifest.outputBasePath
    : decodePath(payload.outputPath ?? "");

  if (!inputVideo || !fs.existsSync(inputVideo) || !fs.statSync(inputVideo).isFile()) {
    throw new Error(
      `The video file does not exist or cannot be read: ${inputVideo}`,
    );
  }
  if (
    !outputBasePath ||
    !fs.existsSync(outputBasePath) ||
    !fs.statSync(outputBasePath).isDirectory()
  ) {
    throw new Error(
      `The output folder does not exist or cannot be read: ${outputBasePath}`,
    );
  }

  const mediaInfo = manifest
    ? {
        path: manifest.inputVideo,
        width: 0,
        height: 0,
        fps: manifest.fps,
        fpsRational: manifest.fpsRational,
        duration: manifest.duration,
        estimatedFrames: manifest.totalFrames,
        hasAudio: manifest.hasAudio,
        videoCodec: null,
        audioCodec: null,
        fileSize: 0,
      }
    : probeVideoMediaInfo(inputVideo);

  if (!mediaInfo) {
    throw new Error(
      "Could not read video metadata with FFprobe. Please check that the file is a valid, uncorrupted video.",
    );
  }

  const model = manifest ? manifest.model : payload.model;
  const scale = manifest ? manifest.scale : payload.scale;
  const useCustomWidth = manifest
    ? manifest.useCustomWidth
    : payload.useCustomWidth;
  const customWidth = manifest
    ? manifest.customWidth
    : useCustomWidth
      ? payload.customWidth
      : "";
  const initialTileSize = manifest ? manifest.tileSize : payload.tileSize;
  const ttaMode = manifest ? manifest.ttaMode : payload.ttaMode;
  const gpuId = manifest ? manifest.gpuId : payload.gpuId;
  const keepAudio = manifest ? manifest.keepAudio : payload.keepAudio !== false;
  const intermediateFormat: VideoIntermediateFormat = manifest
    ? manifest.intermediateFormat
    : payload.intermediateFormat === "png"
      ? "png"
      : "jpg";
  const frameExt = intermediateFormat === "png" ? ".png" : ".jpg";
  const useHardwareEncoding = manifest
    ? manifest.useHardwareEncoding
    : payload.useHardwareEncoding !== false;
  const deduplicateFrames = manifest
    ? manifest.deduplicateFrames
    : payload.deduplicateFrames !== false;
  const frameInterpolation: VideoInterpolationFactor = manifest
    ? manifest.frameInterpolation
    : payload.frameInterpolation === 2 || payload.frameInterpolation === 4
      ? payload.frameInterpolation
      : 1;
  const interpolationEnginePref: VideoInterpolationEngine = manifest
    ? manifest.interpolationEngine
    : payload.interpolationEngine ?? "auto";
  const resumable = manifest ? true : payload.resumable !== false;

  const trimRange: ResolvedTrimRange | null = resolveVideoTrimRange({
    startSeconds: manifest
      ? manifest.trimStartSeconds
      : payload.trimStartSeconds,
    endSeconds: manifest ? manifest.trimEndSeconds : payload.trimEndSeconds,
    duration: mediaInfo.duration,
  });

  const encodingProfile = resolveVideoEncodingProfile({
    codec: manifest ? manifest.videoCodec : (payload.videoCodec ?? "h264"),
    container: manifest
      ? manifest.videoContainer
      : (payload.videoContainer ?? "mp4"),
    quality: manifest
      ? manifest.videoQuality
      : (payload.videoQuality ?? "balanced"),
  });

  const selectedHwEncoder = useHardwareEncoding
    ? resolveHardwareEncoder(encodingProfile.codec, ffmpegStatus.hwEncoders)
    : null;
  const usedEncoderLabel = selectedHwEncoder ?? encodingProfile.videoEncoder;

  // Decide active interpolation engine when frameInterpolation > 1
  const useRife =
    frameInterpolation > 1 &&
    ffmpegStatus.hasRife &&
    ffmpegStatus.rifePath !== null &&
    interpolationEnginePref !== "ffmpeg";
  const useFfmpegMci = frameInterpolation > 1 && !useRife;
  const interpolationEngineUsed =
    frameInterpolation > 1 ? (useRife ? "rife" : "ffmpeg-mci") : null;
  const targetOutputFpsRational = scaleRationalFps(
    mediaInfo.fpsRational,
    frameInterpolation,
  );

  const isDefaultModel = model in MODELS;
  const modelsDir = isDefaultModel
    ? modelsPath
    : (savedCustomModelsPath ?? modelsPath);

  const scaleLabel = useCustomWidth ? `${customWidth}px` : `${scale}x`;
  const inputParsed = path.parse(inputVideo);
  const outputFile = manifest
    ? manifest.outputFile
    : getUniqueOutputPath(
        outputBasePath,
        buildVideoOutputFilename({
          inputName: inputParsed.name,
          model,
          scale,
          useCustomWidth,
          customWidth,
          codec: encodingProfile.codec,
          container: encodingProfile.container,
          trimRange,
          interpolationFactor: frameInterpolation,
        }),
      );

  const sessionId = manifest
    ? manifest.sessionId
    : `vid_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const workRoot = resumable
    ? getVideoSessionDir(sessionId)
    : fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-video-"));

  if (!resumable) {
    registerTempDir(workRoot);
  }

  const inputFramesDir = path.join(workRoot, "input");
  const segmentsDir = path.join(workRoot, "segments");
  fs.mkdirSync(inputFramesDir, { recursive: true });
  if (resumable) {
    fs.mkdirSync(segmentsDir, { recursive: true });
  }

  const cleanupWorkRoot = (removePartialOutput = false) => {
    if (!resumable) {
      try {
        fs.rmSync(workRoot, { recursive: true, force: true });
        unregisterTempDir(workRoot);
        logit("🧹 Removed video temporary folder");
      } catch (error) {
        logit("⚠️ Could not remove video temporary folder: ", error);
      }
    }

    if (removePartialOutput && fs.existsSync(outputFile)) {
      try {
        fs.unlinkSync(outputFile);
        logit("🧹 Removed incomplete output video: ", outputFile);
      } catch (error) {
        logit("⚠️ Could not remove incomplete output video: ", error);
      }
    }
  };

  const emitProgress = (
    stage: VideoProgressStage,
    stageFraction: number,
    details: {
      message: string;
      completedFrames?: number;
      totalFrames?: number;
      chunk?: number;
      totalChunks?: number;
    },
  ) => {
    const overallFraction = calculateVideoOverallProgress(stage, stageFraction);
    const percent = Math.round(overallFraction * 100);
    const totalStages = frameInterpolation > 1 ? 4 : 3;
    const stageIndex =
      stage === "preparing" || stage === "extracting"
        ? 1
        : stage === "upscaling"
          ? 2
          : stage === "interpolating"
            ? 3
            : totalStages;

    const info: VideoProgressInfo = {
      stage,
      stageIndex,
      totalStages,
      percent,
      completedFrames: details.completedFrames ?? 0,
      totalFrames: details.totalFrames ?? mediaInfo.estimatedFrames,
      chunk: details.chunk ?? 0,
      totalChunks: details.totalChunks ?? 0,
      message: details.message,
      sessionId: resumable ? sessionId : undefined,
    };

    callbacks.onProgress?.(info, overallFraction);
  };

  let activeTileSize = initialTileSize;
  let memoryRetries = 0;
  let vramConstrained = false;
  const cpuCount = os.cpus().length;
  const effectiveDuration = trimRange ? trimRange.duration : mediaInfo.duration;

  const runExtractPass = (useHwDecode: boolean): Promise<number> =>
    new Promise((resolve, reject) => {
      logit(
        `🎞 Extracting video frames (${intermediateFormat.toUpperCase()}, ${
          useHwDecode ? "hwaccel auto" : "software decode"
        }${trimRange ? `, trim ${trimRange.start.toFixed(1)}s–${trimRange.end.toFixed(1)}s` : ""}) at CFR ${mediaInfo.fpsRational}...`,
      );
      emitProgress("extracting", 0, {
        message: "Extracting frames... 0%",
      });

      const extractArgs = buildVideoExtractArgs({
        inputVideo,
        outputPattern: path.join(inputFramesDir, `frame_%08d${frameExt}`),
        fpsRational: mediaInfo.fpsRational,
        intermediateFormat,
        useHwDecode,
        trimStartSeconds: trimRange?.start ?? null,
        trimDurationSeconds: trimRange?.duration ?? null,
      });

      const child = spawn(ffmpegBin, extractArgs, { windowsHide: true });
      const tracked: TrackedChildProcess = {
        process: child,
        kill: () => child.kill(),
      };
      childProcesses.push(tracked);

      let stderrTail = "";

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LIMIT);

        const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
        if (timeMatch && effectiveDuration > 0) {
          const seconds = timeToSeconds(timeMatch[1]);
          const fraction = Math.min(0.99, seconds / effectiveDuration);
          const pct = Math.round(fraction * 100);
          emitProgress("extracting", fraction, {
            message: `Extracting frames... ${pct}%`,
          });
        }
      });

      child.on("error", (err) => {
        removeChildProcess(tracked);
        reject(new Error(`Failed to launch FFmpeg: ${err.message}`));
      });

      child.on("close", (code) => {
        removeChildProcess(tracked);
        if (stopped) {
          reject(new Error("__STOPPED__"));
          return;
        }
        if (code !== 0) {
          const detail = extractLastErrorLine(stderrTail);
          reject(
            new Error(
              `FFmpeg failed while extracting video frames (exit ${code}).${detail ? ` ${detail}` : ""}`,
            ),
          );
          return;
        }

        const frames = fs
          .readdirSync(inputFramesDir)
          .filter((file) => file.toLowerCase().endsWith(frameExt))
          .sort();

        if (frames.length === 0) {
          reject(
            new Error(
              "No frames were extracted from the video. Check that FFmpeg supports this video's codec.",
            ),
          );
          return;
        }

        emitProgress("extracting", 1, {
          message: `Extracted ${frames.length} frames`,
          totalFrames: frames.length,
        });
        resolve(frames.length);
      });
    });

  const extractFrames = async (): Promise<number> => {
    try {
      return await runExtractPass(true);
    } catch (err: any) {
      if (stopped || err?.message === "__STOPPED__") throw err;
      logit(
        "⚠️ Hardware-accelerated frame decode failed; falling back to software decode: ",
        err?.message ?? err,
      );
      fs.rmSync(inputFramesDir, { recursive: true, force: true });
      fs.mkdirSync(inputFramesDir, { recursive: true });
      return await runExtractPass(false);
    }
  };

  const upscaleChunkDirectory = (
    chunkInputDir: string,
    chunkOutputDir: string,
    uniqueFrameCount: number,
    chunkTotalFrames: number,
    baseCompletedFrames: number,
    totalFrames: number,
    chunkIndex: number,
    totalChunks: number,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      if (uniqueFrameCount === 0) {
        resolve();
        return;
      }

      const attempt = (currentTileSize: number, isRetry: boolean) => {
        if (stopped) {
          reject(new Error("__STOPPED__"));
          return;
        }

        if (isRetry) {
          fs.rmSync(chunkOutputDir, { recursive: true, force: true });
          fs.mkdirSync(chunkOutputDir, { recursive: true });
        }

        const threads =
          (manifest ? manifest.threads : payload.threads)?.trim() ||
          getVideoThreadCount({ cpuCount, vramConstrained });

        logit(
          `🚀 Upscaling chunk ${chunkIndex}/${totalChunks} (${uniqueFrameCount} unique / ${chunkTotalFrames} frames, -j ${threads}, ${intermediateFormat.toUpperCase()})` +
            (isRetry ? ` [retry tile ${currentTileSize}px]` : ""),
        );

        const upscayl = spawnUpscayl(
          getBatchArguments({
            inputDir: chunkInputDir,
            outputDir: chunkOutputDir,
            modelsPath: modelsDir,
            model,
            gpuId,
            saveImageAs: intermediateFormat,
            scale,
            customWidth,
            compression: "0",
            tileSize: currentTileSize,
            ttaMode,
            threads,
          }),
          logit,
        );

        const tracked: TrackedChildProcess = upscayl;
        childProcesses.push(tracked);

        let uniqueDone = 0;
        let retrying = false;
        let settled = false;
        let stderrTail = "";

        const retryWithSmallerTile = (text: string): boolean => {
          if (!isVulkanMemoryError(text)) return false;
          if (retrying) return true;
          const fallbackTileSize = getFallbackTileSize(currentTileSize);
          if (fallbackTileSize === null || memoryRetries >= MAX_MEMORY_RETRIES) {
            return false;
          }

          memoryRetries += 1;
          activeTileSize = fallbackTileSize;
          vramConstrained = true;
          retrying = true;
          removeChildProcess(tracked);
          upscayl.kill();
          logit(
            `⚠️ Vulkan memory allocation failed on video chunk ${chunkIndex}/${totalChunks}. Retrying with tile size ${fallbackTileSize}px...`,
          );
          callbacks.onWarning?.(
            `The GPU ran out of memory (vkAllocateMemory failed). Retrying video chunk ${chunkIndex}/${totalChunks} with tile size ${fallbackTileSize}px...`,
          );
          setTimeout(() => {
            if (stopped) {
              reject(new Error("__STOPPED__"));
              return;
            }
            attempt(fallbackTileSize, true);
          }, 750);
          return true;
        };

        upscayl.process.stderr.on("data", (chunk: Buffer) => {
          if (retrying || settled) return;
          const text = chunk.toString();
          stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LIMIT);

          const successCount = countOccurrences(text, "Successful");
          if (successCount > 0) {
            uniqueDone = Math.min(uniqueDone + successCount, uniqueFrameCount);
            const proportionalChunkFrames = Math.round(
              (uniqueDone / uniqueFrameCount) * chunkTotalFrames,
            );
            const totalDone = Math.min(
              baseCompletedFrames + proportionalChunkFrames,
              totalFrames,
            );
            emitProgress("upscaling", totalDone / totalFrames, {
              message: `Upscaling frames... ${totalDone}/${totalFrames}`,
              completedFrames: totalDone,
              totalFrames,
              chunk: chunkIndex,
              totalChunks,
            });
          }

          if (retryWithSmallerTile(stderrTail)) return;

          if (text.includes("Error") || text.includes("failed")) {
            settled = true;
            removeChildProcess(tracked);
            upscayl.kill();
            reject(
              new Error(
                isVulkanMemoryError(stderrTail)
                  ? VULKAN_MEMORY_ERROR_MESSAGE
                  : `Error upscaling video frames: ${extractLastErrorLine(stderrTail) || text.trim()}`,
              ),
            );
          }
        });

        upscayl.process.on("error", (err) => {
          if (retrying || settled) return;
          if (retryWithSmallerTile(String(err))) return;
          settled = true;
          removeChildProcess(tracked);
          reject(new Error(`Upscaler process error: ${err.message}`));
        });

        upscayl.process.on("close", (code) => {
          removeChildProcess(tracked);
          if (retrying || settled) return;
          if (stopped) {
            settled = true;
            reject(new Error("__STOPPED__"));
            return;
          }
          if (code !== 0) {
            settled = true;
            const detail = extractLastErrorLine(stderrTail);
            reject(
              new Error(
                isVulkanMemoryError(stderrTail)
                  ? VULKAN_MEMORY_ERROR_MESSAGE
                  : `Upscaler exited unexpectedly with code ${code}.${detail ? ` ${detail}` : ""}`,
              ),
            );
            return;
          }
          settled = true;
          resolve();
        });
      };

      attempt(activeTileSize, false);
    });

  const runRifeOnChunk = (
    sourceDir: string,
    destDir: string,
    sourceFrameCount: number,
  ): Promise<string[]> =>
    new Promise((resolve, reject) => {
      if (!ffmpegStatus.rifePath) {
        reject(new Error("RIFE binary is not available."));
        return;
      }
      fs.mkdirSync(destDir, { recursive: true });
      const targetFrames = Math.max(2, sourceFrameCount * frameInterpolation);
      const args = buildRifeArgs({
        inputDir: sourceDir,
        outputDir: destDir,
        targetFrameCount: targetFrames,
        gpuId,
        format: intermediateFormat,
      });

      logit("✨ Running RIFE AI frame interpolation:", JSON.stringify(args));
      const child = spawn(ffmpegStatus.rifePath, args, { windowsHide: true });
      const tracked: TrackedChildProcess = {
        process: child,
        kill: () => child.kill(),
      };
      childProcesses.push(tracked);

      let stderrTail = "";
      child.stderr.on("data", (d) => {
        stderrTail = (stderrTail + d.toString()).slice(-STDERR_TAIL_LIMIT);
      });
      child.on("error", (err) => {
        removeChildProcess(tracked);
        reject(new Error(`RIFE interpolation failed to start: ${err.message}`));
      });
      child.on("close", (code) => {
        removeChildProcess(tracked);
        if (stopped) {
          reject(new Error("__STOPPED__"));
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              `RIFE interpolation failed (exit ${code}). ${extractLastErrorLine(stderrTail)}`,
            ),
          );
          return;
        }
        const outFiles = fs
          .readdirSync(destDir)
          .filter((f) => f.toLowerCase().endsWith(frameExt))
          .sort();
        resolve(outFiles);
      });
    });

  const runFfmpegCommand = (
    args: string[],
    errorLabel: string,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = spawn(ffmpegBin, args, { windowsHide: true });
      const tracked: TrackedChildProcess = {
        process: child,
        kill: () => child.kill(),
      };
      childProcesses.push(tracked);

      let stderrTail = "";
      child.stderr.on("data", (d) => {
        stderrTail = (stderrTail + d.toString()).slice(-STDERR_TAIL_LIMIT);
      });
      child.on("error", (err) => {
        removeChildProcess(tracked);
        reject(new Error(`${errorLabel}: ${err.message}`));
      });
      child.on("close", (code) => {
        removeChildProcess(tracked);
        if (stopped) {
          reject(new Error("__STOPPED__"));
          return;
        }
        if (code !== 0) {
          const detail = extractLastErrorLine(stderrTail);
          reject(
            new Error(
              `${errorLabel} (exit ${code}).${detail ? ` ${detail}` : ""}`,
            ),
          );
          return;
        }
        resolve();
      });
    });

  let activeEncoder: ChildProcessWithoutNullStreams | null = null;
  let activeEncoderTracked: TrackedChildProcess | null = null;

  try {
    // Stage 1: Extract CFR frames (skipped if resuming an existing session)
    let totalFrames: number;
    let chunkSize: number;

    if (manifest) {
      totalFrames = manifest.totalFrames;
      chunkSize = manifest.chunkSize;
      logit(
        `♻️ Resuming video session ${sessionId}: ${manifest.completedChunks.length}/${manifest.totalChunks} chunks already done`,
      );
    } else {
      totalFrames = await extractFrames();
      if (stopped) {
        if (resumable) discardVideoSession(sessionId);
        cleanupWorkRoot(true);
        return null;
      }
      chunkSize = computeOptimalChunkSize(totalFrames, intermediateFormat);
      const initialChunks = computeChunkRanges(totalFrames, chunkSize);

      if (resumable) {
        manifest = {
          sessionId,
          inputVideo,
          outputBasePath,
          outputFile,
          model,
          scale,
          useCustomWidth,
          customWidth,
          gpuId,
          tileSize: initialTileSize,
          ttaMode,
          threads: payload.threads,
          videoCodec: encodingProfile.codec,
          videoContainer: encodingProfile.container,
          videoQuality: encodingProfile.quality,
          keepAudio,
          hasAudio: mediaInfo.hasAudio,
          intermediateFormat,
          useHardwareEncoding,
          deduplicateFrames,
          frameInterpolation,
          interpolationEngine: interpolationEnginePref,
          trimStartSeconds: trimRange?.start ?? null,
          trimEndSeconds: trimRange?.end ?? null,
          fps: mediaInfo.fps,
          fpsRational: mediaInfo.fpsRational,
          duration: mediaInfo.duration,
          totalFrames,
          chunkSize,
          totalChunks: initialChunks.length,
          completedChunks: [],
          skippedDuplicateFrames: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        saveVideoSessionManifest(manifest);
      }
    }

    const chunks = computeChunkRanges(totalFrames, chunkSize);
    const completedSet = new Set<number>(manifest?.completedChunks ?? []);
    let totalSkippedDuplicates = manifest?.skippedDuplicateFrames ?? 0;

    // -------------------------------------------------------------------------
    // MODE A: Resumable Chunk-Segment Pipeline (default)
    // Each chunk encodes asynchronously into segments/seg_XXXXX.<container>
    // while chunk N+1 upscales on GPU. Completed chunks are saved to manifest.
    // -------------------------------------------------------------------------
    if (resumable && manifest) {
      let completedFramesCount = 0;
      for (const r of chunks) {
        if (completedSet.has(r.chunkIndex)) {
          completedFramesCount += r.end - r.start;
        }
      }

      let pendingSegmentPromise: Promise<void> = Promise.resolve();
      let segmentError: Error | null = null;

      const encodeChunkSegment = async (
        chunkOutDir: string,
        plan: ChunkDeduplicationPlan,
        chunkFrames: string[],
        chunkIndex: number,
        totalChunks: number,
        afterCompletedFrames: number,
      ) => {
        const segmentPath = path.join(
          segmentsDir,
          segmentFileName(chunkIndex, encodingProfile.container),
        );
        const tmpSegmentPath = `${segmentPath}.part.${encodingProfile.container}`;

        try {
          // Materialize full ordered frames for RIFE if RIFE interpolation is active
          let framesToPipeDir = chunkOutDir;
          let pipeSequence: string[] | null = null;
          const materializedDir = path.join(
            workRoot,
            `chunk_mat_${chunkIndex}`,
          );
          const rifeOutDir = path.join(workRoot, `chunk_rife_${chunkIndex}`);

          if (useRife) {
            emitProgress("interpolating", chunkIndex / totalChunks, {
              message: `AI interpolating chunk ${chunkIndex}/${totalChunks} (${frameInterpolation}x FPS)...`,
              completedFrames: afterCompletedFrames,
              totalFrames,
              chunk: chunkIndex,
              totalChunks,
            });
            fs.mkdirSync(materializedDir, { recursive: true });
            let idx = 1;
            for (const entry of plan.emitOrder) {
              const srcName = entry.sourceFrame!;
              linkOrCopySync(
                path.join(chunkOutDir, srcName),
                path.join(materializedDir, frameFileName(idx, frameExt)),
              );
              idx += 1;
            }
            pipeSequence = await runRifeOnChunk(
              materializedDir,
              rifeOutDir,
              plan.emitOrder.length,
            );
            framesToPipeDir = rifeOutDir;
            await fs.promises
              .rm(materializedDir, { recursive: true, force: true })
              .catch(() => {});
          }

          const segEncodeArgs = buildVideoEncodeArgs({
            fpsRational: useRife
              ? targetOutputFpsRational
              : mediaInfo.fpsRational,
            inputVideo,
            outputFile: tmpSegmentPath,
            codec: encodingProfile.codec,
            container: encodingProfile.container,
            quality: encodingProfile.quality,
            keepAudio: false,
            hasAudio: false,
            usePipe: true,
            intermediateFormat,
            hardwareEncoder: selectedHwEncoder,
            ffmpegInterpolateFps: useFfmpegMci ? targetOutputFpsRational : null,
            segmentOnly: true,
          });

          const segEncoder = spawn(ffmpegBin, segEncodeArgs, {
            windowsHide: true,
          });
          activeEncoder = segEncoder;
          const trackedSeg: TrackedChildProcess = {
            process: segEncoder,
            kill: () => segEncoder.kill(),
          };
          activeEncoderTracked = trackedSeg;
          childProcesses.push(trackedSeg);

          let segStderr = "";
          const segClosePromise = new Promise<void>((resolve, reject) => {
            segEncoder.stderr.on("data", (d) => {
              segStderr = (segStderr + d.toString()).slice(-STDERR_TAIL_LIMIT);
            });
            segEncoder.on("error", (err) => reject(err));
            segEncoder.on("close", (code) => {
              removeChildProcess(trackedSeg);
              if (stopped) {
                resolve();
                return;
              }
              if (code !== 0) {
                reject(
                  new Error(
                    `FFmpeg segment encode failed (exit ${code}). ${extractLastErrorLine(segStderr)}`,
                  ),
                );
                return;
              }
              resolve();
            });
          });
          segClosePromise.catch(() => {});

          if (pipeSequence) {
            for (const fName of pipeSequence) {
              if (stopped) break;
              const buf = await fs.promises.readFile(
                path.join(framesToPipeDir, fName),
              );
              await writeBufferToStream(segEncoder.stdin, buf);
            }
          } else {
            const uniqueCache = new Map<string, Buffer>();
            for (const entry of plan.emitOrder) {
              if (stopped) break;
              const srcName = entry.sourceFrame!;
              let buf = uniqueCache.get(srcName);
              if (!buf) {
                const filePath = path.join(chunkOutDir, srcName);
                if (!fs.existsSync(filePath)) {
                  throw new Error(
                    `Expected upscaled frame was not produced: ${srcName}`,
                  );
                }
                buf = await fs.promises.readFile(filePath);
                uniqueCache.set(srcName, buf);
              }
              await writeBufferToStream(segEncoder.stdin, buf);
            }
            uniqueCache.clear();
          }

          if (stopped) {
            try {
              segEncoder.stdin.destroy();
              segEncoder.kill();
            } catch {}
            await fs.promises.rm(tmpSegmentPath, { force: true }).catch(() => {});
          } else {
            segEncoder.stdin.end();
            await segClosePromise;
            fs.renameSync(tmpSegmentPath, segmentPath);

            // Only delete source input frames for this chunk AFTER segment succeeds
            for (const fName of chunkFrames) {
              await fs.promises
                .unlink(path.join(inputFramesDir, fName))
                .catch(() => {});
            }

            completedSet.add(chunkIndex);
            manifest!.completedChunks = Array.from(completedSet).sort(
              (a, b) => a - b,
            );
            manifest!.skippedDuplicateFrames = totalSkippedDuplicates;
            manifest!.updatedAt = Date.now();
            saveVideoSessionManifest(manifest!);

            emitProgress("upscaling", afterCompletedFrames / totalFrames, {
              message: `Upscaling frames... ${afterCompletedFrames}/${totalFrames}`,
              completedFrames: afterCompletedFrames,
              totalFrames,
              chunk: chunkIndex,
              totalChunks,
            });
          }

          await fs.promises
            .rm(chunkOutDir, { recursive: true, force: true })
            .catch(() => {});
          await fs.promises
            .rm(rifeOutDir, { recursive: true, force: true })
            .catch(() => {});
        } catch (err: any) {
          await fs.promises
            .rm(chunkOutDir, { recursive: true, force: true })
            .catch(() => {});
          await fs.promises.rm(tmpSegmentPath, { force: true }).catch(() => {});
          segmentError = err instanceof Error ? err : new Error(String(err));
          throw segmentError;
        }
      };

      for (const range of chunks) {
        if (stopped) break;
        if (segmentError) throw segmentError;

        // Skip chunks already completed in a previous run
        if (completedSet.has(range.chunkIndex)) {
          const existingSeg = path.join(
            segmentsDir,
            segmentFileName(range.chunkIndex, encodingProfile.container),
          );
          if (fs.existsSync(existingSeg) && fs.statSync(existingSeg).size > 0) {
            continue;
          }
          completedSet.delete(range.chunkIndex);
        }

        const chunkFrames: string[] = [];
        for (let idx = range.start + 1; idx <= range.end; idx += 1) {
          chunkFrames.push(frameFileName(idx, frameExt));
        }

        const chunkInDir = path.join(workRoot, `chunk_in_${range.chunkIndex}`);
        const chunkOutDir = path.join(
          workRoot,
          `chunk_out_${range.chunkIndex}`,
        );
        fs.rmSync(chunkInDir, { recursive: true, force: true });
        fs.rmSync(chunkOutDir, { recursive: true, force: true });
        fs.mkdirSync(chunkInDir, { recursive: true });
        fs.mkdirSync(chunkOutDir, { recursive: true });

        // Deduplicate within each resumable chunk (so every chunk is self-contained for resume)
        let plan: ChunkDeduplicationPlan;
        if (deduplicateFrames) {
          const fingerprints = await hashFrameBatch(
            inputFramesDir,
            chunkFrames,
          );
          plan = planDeduplicatedChunk(fingerprints, null);
          totalSkippedDuplicates += plan.skippedCount;
        } else {
          plan = {
            uniqueFrames: [...chunkFrames],
            emitOrder: chunkFrames.map((name) => ({
              name,
              sourceFrame: name,
              reusePreviousChunk: false,
            })),
            skippedCount: 0,
            lastHash: null,
          };
        }

        for (const uniqueName of plan.uniqueFrames) {
          linkOrCopySync(
            path.join(inputFramesDir, uniqueName),
            path.join(chunkInDir, uniqueName),
          );
        }

        await upscaleChunkDirectory(
          chunkInDir,
          chunkOutDir,
          plan.uniqueFrames.length,
          chunkFrames.length,
          completedFramesCount,
          totalFrames,
          range.chunkIndex,
          range.totalChunks,
        );

        await fs.promises
          .rm(chunkInDir, { recursive: true, force: true })
          .catch(() => {});

        if (stopped) {
          await fs.promises
            .rm(chunkOutDir, { recursive: true, force: true })
            .catch(() => {});
          break;
        }

        completedFramesCount += chunkFrames.length;
        const afterFrames = completedFramesCount;

        // Wait for previous chunk's segment encoder, then launch this chunk's encoder in background
        await pendingSegmentPromise;
        if (segmentError) throw segmentError;

        pendingSegmentPromise = encodeChunkSegment(
          chunkOutDir,
          plan,
          chunkFrames,
          range.chunkIndex,
          range.totalChunks,
          afterFrames,
        );
        pendingSegmentPromise.catch(() => {});
      }

      await pendingSegmentPromise;
      if (segmentError) throw segmentError;

      if (stopped) {
        logit(
          `⏸️ Video session ${sessionId} paused at ${manifest.completedChunks.length}/${manifest.totalChunks} chunks (resumable).`,
        );
        return null;
      }

      // Stage 3: Instant lossless stream-copy concat + audio muxing
      emitProgress("encoding", 0.5, {
        message: "Finalizing video...",
        completedFrames: totalFrames,
        totalFrames,
        chunk: chunks.length,
        totalChunks: chunks.length,
      });

      const concatListPath = path.join(workRoot, "concat.txt");
      const concatLines = chunks.map(
        (r) =>
          `file '${escapeConcatPath(
            path.join(
              segmentsDir,
              segmentFileName(r.chunkIndex, encodingProfile.container),
            ),
          )}'`,
      );
      fs.writeFileSync(concatListPath, concatLines.join("\n") + "\n", "utf8");

      const concatArgs = buildVideoConcatArgs({
        concatListPath,
        inputVideo,
        outputFile,
        codec: encodingProfile.codec,
        container: encodingProfile.container,
        keepAudio,
        hasAudio: mediaInfo.hasAudio,
        trimStartSeconds: trimRange?.start ?? null,
        trimDurationSeconds: trimRange?.duration ?? null,
      });

      await runFfmpegCommand(
        concatArgs,
        "FFmpeg failed while finalizing the upscaled video",
      );

      discardVideoSession(sessionId);
    } else {
      // -----------------------------------------------------------------------
      // MODE B: Direct Streaming Pipe Pipeline (non-resumable fast path)
      // -----------------------------------------------------------------------
      const encodeArgs = buildVideoEncodeArgs({
        fpsRational: useRife ? targetOutputFpsRational : mediaInfo.fpsRational,
        inputVideo,
        outputFile,
        codec: encodingProfile.codec,
        container: encodingProfile.container,
        quality: encodingProfile.quality,
        keepAudio,
        hasAudio: mediaInfo.hasAudio,
        usePipe: true,
        intermediateFormat,
        hardwareEncoder: selectedHwEncoder,
        trimStartSeconds: trimRange?.start ?? null,
        trimDurationSeconds: trimRange?.duration ?? null,
        ffmpegInterpolateFps: useFfmpegMci ? targetOutputFpsRational : null,
      });

      const spawnedEncoder = spawn(ffmpegBin, encodeArgs, {
        windowsHide: true,
      });
      activeEncoder = spawnedEncoder;
      const trackedEncoder: TrackedChildProcess = {
        process: spawnedEncoder,
        kill: () => spawnedEncoder.kill(),
      };
      activeEncoderTracked = trackedEncoder;
      childProcesses.push(trackedEncoder);

      let encoderStderrTail = "";
      let encoderFailed: Error | null = null;

      const encoderClosePromise = new Promise<void>((resolve, reject) => {
        spawnedEncoder.stderr.on("data", (chunk) => {
          encoderStderrTail = (encoderStderrTail + chunk.toString()).slice(
            -STDERR_TAIL_LIMIT,
          );
        });
        spawnedEncoder.on("error", (err) => {
          encoderFailed = new Error(
            `Failed to run FFmpeg encoder: ${err.message}`,
          );
          reject(encoderFailed);
        });
        spawnedEncoder.on("close", (code) => {
          removeChildProcess(trackedEncoder);
          if (stopped) {
            resolve();
            return;
          }
          if (code !== 0) {
            const detail = extractLastErrorLine(encoderStderrTail);
            encoderFailed = new Error(
              `FFmpeg failed while encoding the upscaled video (exit ${code}).${detail ? ` ${detail}` : ""}`,
            );
            reject(encoderFailed);
            return;
          }
          resolve();
        });
      });
      encoderClosePromise.catch(() => {});

      let processedFrames = 0;
      let previousChunkLastHash: string | null = null;
      let lastPipedUpscaledBuffer: Buffer | null = null;
      let pendingPipePromise: Promise<void> = Promise.resolve();
      let pipeError: Error | null = null;

      const pipeChunk = async (
        chunkOutDir: string,
        plan: ChunkDeduplicationPlan,
        chunkIndex: number,
        totalChunks: number,
        afterCompletedFrames: number,
      ) => {
        try {
          const uniqueCache = new Map<string, Buffer>();
          for (const entry of plan.emitOrder) {
            if (stopped) break;
            if (encoderFailed) throw encoderFailed;
            let buf: Buffer;
            if (entry.reusePreviousChunk) {
              if (!lastPipedUpscaledBuffer) {
                throw new Error(
                  `Missing previous upscaled frame for ${entry.name}`,
                );
              }
              buf = lastPipedUpscaledBuffer;
            } else {
              const srcName = entry.sourceFrame!;
              let cached = uniqueCache.get(srcName);
              if (!cached) {
                const fullPath = path.join(chunkOutDir, srcName);
                cached = await fs.promises.readFile(fullPath);
                uniqueCache.set(srcName, cached);
                await fs.promises.unlink(fullPath).catch(() => {});
              }
              buf = cached;
              lastPipedUpscaledBuffer = cached;
            }
            await writeBufferToStream(spawnedEncoder.stdin, buf);
          }
          uniqueCache.clear();
          await fs.promises
            .rm(chunkOutDir, { recursive: true, force: true })
            .catch(() => {});
          if (!stopped) {
            emitProgress("upscaling", afterCompletedFrames / totalFrames, {
              message: `Upscaling frames... ${afterCompletedFrames}/${totalFrames}`,
              completedFrames: afterCompletedFrames,
              totalFrames,
              chunk: chunkIndex,
              totalChunks,
            });
          }
        } catch (err: any) {
          await fs.promises
            .rm(chunkOutDir, { recursive: true, force: true })
            .catch(() => {});
          pipeError = err instanceof Error ? err : new Error(String(err));
          throw pipeError;
        }
      };

      for (const range of chunks) {
        if (stopped) break;
        if (encoderFailed) throw encoderFailed;
        if (pipeError) throw pipeError;

        const chunkFrames: string[] = [];
        for (let idx = range.start + 1; idx <= range.end; idx += 1) {
          chunkFrames.push(frameFileName(idx, frameExt));
        }

        const chunkInDir = path.join(workRoot, `chunk_in_${range.chunkIndex}`);
        const chunkOutDir = path.join(
          workRoot,
          `chunk_out_${range.chunkIndex}`,
        );
        fs.mkdirSync(chunkInDir, { recursive: true });
        fs.mkdirSync(chunkOutDir, { recursive: true });

        let plan: ChunkDeduplicationPlan;
        if (deduplicateFrames) {
          const fingerprints = await hashFrameBatch(
            inputFramesDir,
            chunkFrames,
          );
          plan = planDeduplicatedChunk(fingerprints, previousChunkLastHash);
          previousChunkLastHash = plan.lastHash;
          totalSkippedDuplicates += plan.skippedCount;
        } else {
          plan = {
            uniqueFrames: [...chunkFrames],
            emitOrder: chunkFrames.map((name) => ({
              name,
              sourceFrame: name,
              reusePreviousChunk: false,
            })),
            skippedCount: 0,
            lastHash: null,
          };
        }

        const uniqueSet = new Set(plan.uniqueFrames);
        for (const fName of chunkFrames) {
          const src = path.join(inputFramesDir, fName);
          if (uniqueSet.has(fName)) {
            fs.renameSync(src, path.join(chunkInDir, fName));
          } else {
            fs.unlinkSync(src);
          }
        }

        await upscaleChunkDirectory(
          chunkInDir,
          chunkOutDir,
          plan.uniqueFrames.length,
          chunkFrames.length,
          processedFrames,
          totalFrames,
          range.chunkIndex,
          range.totalChunks,
        );

        await fs.promises
          .rm(chunkInDir, { recursive: true, force: true })
          .catch(() => {});

        if (stopped) {
          await fs.promises
            .rm(chunkOutDir, { recursive: true, force: true })
            .catch(() => {});
          break;
        }

        processedFrames += chunkFrames.length;
        const completedAfter = processedFrames;

        await pendingPipePromise;
        if (pipeError) throw pipeError;
        if (encoderFailed) throw encoderFailed;

        pendingPipePromise = pipeChunk(
          chunkOutDir,
          plan,
          range.chunkIndex,
          range.totalChunks,
          completedAfter,
        );
        pendingPipePromise.catch(() => {});
      }

      await pendingPipePromise;
      if (pipeError) throw pipeError;

      if (stopped) {
        try {
          spawnedEncoder.stdin.destroy();
          spawnedEncoder.kill();
        } catch {}
        cleanupWorkRoot(true);
        return null;
      }

      emitProgress("encoding", 0.5, {
        message: "Finalizing video...",
        completedFrames: totalFrames,
        totalFrames,
        chunk: chunks.length,
        totalChunks: chunks.length,
      });

      spawnedEncoder.stdin.end();
      await encoderClosePromise;

      if (stopped) {
        cleanupWorkRoot(true);
        return null;
      }

      cleanupWorkRoot(false);
    }

    let outputFileSize = 0;
    try {
      const stat = fs.statSync(outputFile);
      outputFileSize = stat.size;
      if (outputFileSize === 0) {
        throw new Error("empty output file");
      }
    } catch {
      throw new Error(
        "FFmpeg completed, but the output video file was missing or empty.",
      );
    }

    emitProgress("encoding", 1, {
      message: "Video upscaled successfully!",
      completedFrames: totalFrames,
      totalFrames,
      chunk: chunks.length,
      totalChunks: chunks.length,
    });

    const doneInfo: VideoDoneInfo = {
      outputPath: outputFile,
      inputPath: inputVideo,
      fileSize: outputFileSize,
      durationMs: Date.now() - startedAt,
      totalFrames: totalFrames * frameInterpolation,
      model,
      scaleLabel,
      codec: encodingProfile.codec,
      container: encodingProfile.container,
      usedEncoder: usedEncoderLabel,
      skippedDuplicateFrames: totalSkippedDuplicates,
      interpolationFactor: frameInterpolation,
      interpolationEngineUsed,
      trimmedRange: trimRange
        ? { start: trimRange.start, end: trimRange.end }
        : null,
    };

    logit("💯 Video upscaling complete: ", JSON.stringify(doneInfo));
    return doneInfo;
  } catch (error: any) {
    if (activeEncoder && !activeEncoder.killed) {
      try {
        activeEncoder.stdin.destroy();
        activeEncoder.kill();
      } catch {}
    }
    if (activeEncoderTracked) {
      removeChildProcess(activeEncoderTracked);
    }
    if (!resumable) {
      cleanupWorkRoot(true);
    }
    if (stopped || error?.message === "__STOPPED__") {
      return null;
    }
    throw error;
  }
}

const videoUpscayl = async (_event, payload: VideoUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  setStopped(false);

  try {
    const doneInfo = await runVideoUpscaylJob(payload, {
      onProgress: (info, overallFraction) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS_INFO,
          info,
        );
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS,
          info.message,
        );
        mainWindow.setProgressBar(Math.max(0, Math.min(1, overallFraction)));
      },
      onWarning: (message) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_WARNING, message);
      },
    });

    mainWindow.setProgressBar(-1);
    if (!doneInfo) {
      return;
    }

    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE, doneInfo);
    showNotification("Upscayl-Next", "Video upscaled successfully!");
  } catch (error: any) {
    mainWindow.setProgressBar(-1);
    const message =
      error instanceof Error
        ? error.message
        : `Video upscaling failed: ${error}`;
    logit("❌ Video upscaling failed: ", message);
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_ERROR, message);
  }
};

export const resumeVideoSession = async (_event, sessionId: string) => {
  const manifest = loadVideoSessionManifest(sessionId);
  const mainWindow = getMainWindow();
  if (!mainWindow) return;
  if (!manifest) {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      `Video session not found: ${sessionId}`,
    );
    return;
  }

  await videoUpscayl(_event, {
    videoPath: manifest.inputVideo,
    outputPath: manifest.outputBasePath,
    model: manifest.model,
    scale: manifest.scale,
    gpuId: manifest.gpuId,
    saveImageAs: "png",
    compression: "0",
    customWidth: manifest.customWidth,
    useCustomWidth: manifest.useCustomWidth,
    tileSize: manifest.tileSize,
    ttaMode: manifest.ttaMode,
    threads: manifest.threads,
    videoCodec: manifest.videoCodec,
    videoContainer: manifest.videoContainer,
    videoQuality: manifest.videoQuality,
    keepAudio: manifest.keepAudio,
    intermediateFormat: manifest.intermediateFormat,
    useHardwareEncoding: manifest.useHardwareEncoding,
    deduplicateFrames: manifest.deduplicateFrames,
    frameInterpolation: manifest.frameInterpolation,
    interpolationEngine: manifest.interpolationEngine,
    trimStartSeconds: manifest.trimStartSeconds,
    trimEndSeconds: manifest.trimEndSeconds,
    resumable: true,
    resumeSessionId: manifest.sessionId,
  });
};

export default videoUpscayl;
