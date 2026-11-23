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
  VideoProgressInfo,
  VideoProgressStage,
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
} from "../../common/video-upscayl-helpers";
import { checkFfmpegStatus, probeVideoMediaInfo } from "./video-info";

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

const videoUpscayl = async (_event, payload: VideoUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  const startedAt = Date.now();

  const sendError = (message: string) => {
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_ERROR, message);
    mainWindow.setProgressBar(-1);
  };

  if (!payload.videoPath || payload.videoPath.trim().length === 0) {
    sendError("Please select a video before starting a video upscale.");
    return;
  }

  if (!payload.outputPath || payload.outputPath.trim().length === 0) {
    sendError("Please choose an output folder before starting a video upscale.");
    return;
  }

  const inputVideo = decodePath(payload.videoPath);
  const outputBasePath = decodePath(payload.outputPath);

  try {
    if (!fs.statSync(inputVideo).isFile()) {
      sendError(`The input path is not a file: ${inputVideo}`);
      return;
    }
  } catch {
    sendError(`The video file does not exist or cannot be read: ${inputVideo}`);
    return;
  }

  try {
    if (!fs.statSync(outputBasePath).isDirectory()) {
      sendError(`The output path is not a folder: ${outputBasePath}`);
      return;
    }
  } catch {
    sendError(
      `The output folder does not exist or cannot be read: ${outputBasePath}`,
    );
    return;
  }

  const ffmpegStatus = checkFfmpegStatus();
  if (!ffmpegStatus.hasFfmpeg || !ffmpegStatus.ffmpegPath) {
    sendError(
      "FFmpeg was not found. Install FFmpeg and make sure it is available in your PATH to upscale videos.",
    );
    return;
  }
  if (!ffmpegStatus.hasFfprobe) {
    sendError(
      "FFprobe was not found. Install FFmpeg (including ffprobe) and make sure it is available in your PATH to upscale videos.",
    );
    return;
  }

  const mediaInfo = probeVideoMediaInfo(inputVideo);
  if (!mediaInfo) {
    sendError(
      "Could not read video metadata with FFprobe. Please check that the file is a valid, uncorrupted video.",
    );
    return;
  }

  const ffmpegBin = ffmpegStatus.ffmpegPath;
  const model = payload.model;
  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const initialTileSize = payload.tileSize;
  const ttaMode = payload.ttaMode;
  const gpuId = payload.gpuId;
  const keepAudio = payload.keepAudio !== false;
  const intermediateFormat: VideoIntermediateFormat =
    payload.intermediateFormat === "png" ? "png" : "jpg";
  const frameExt = intermediateFormat === "png" ? ".png" : ".jpg";
  const useHardwareEncoding = payload.useHardwareEncoding !== false;
  const deduplicateFrames = payload.deduplicateFrames !== false;

  const encodingProfile = resolveVideoEncodingProfile({
    codec: payload.videoCodec ?? "h264",
    container: payload.videoContainer ?? "mp4",
    quality: payload.videoQuality ?? "balanced",
  });

  const selectedHwEncoder = useHardwareEncoding
    ? resolveHardwareEncoder(encodingProfile.codec, ffmpegStatus.hwEncoders)
    : null;
  const usedEncoderLabel = selectedHwEncoder ?? encodingProfile.videoEncoder;

  const isDefaultModel = model in MODELS;
  const modelsDir = isDefaultModel
    ? modelsPath
    : (savedCustomModelsPath ?? modelsPath);

  const scaleLabel = useCustomWidth ? `${customWidth}px` : `${scale}x`;
  const inputParsed = path.parse(inputVideo);
  const outputFileName = buildVideoOutputFilename({
    inputName: inputParsed.name,
    model,
    scale,
    useCustomWidth,
    customWidth,
    codec: encodingProfile.codec,
    container: encodingProfile.container,
  });
  const outputFile = getUniqueOutputPath(outputBasePath, outputFileName);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-video-"));
  registerTempDir(tempRoot);
  const inputFramesDir = path.join(tempRoot, "input");
  fs.mkdirSync(inputFramesDir, { recursive: true });

  const cleanup = (removePartialOutput = false) => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      unregisterTempDir(tempRoot);
      logit("🧹 Removed video temporary folder");
    } catch (error) {
      logit("⚠️ Could not remove video temporary folder: ", error);
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const overallFraction = calculateVideoOverallProgress(stage, stageFraction);
    const percent = Math.round(overallFraction * 100);
    const stageIndex =
      stage === "preparing" || stage === "extracting"
        ? 1
        : stage === "upscaling"
          ? 2
          : 3;

    const info: VideoProgressInfo = {
      stage,
      stageIndex,
      totalStages: 3,
      percent,
      completedFrames: details.completedFrames ?? 0,
      totalFrames: details.totalFrames ?? mediaInfo.estimatedFrames,
      chunk: details.chunk ?? 0,
      totalChunks: details.totalChunks ?? 0,
      message: details.message,
    };

    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS_INFO,
      info,
    );
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS,
      details.message,
    );
    mainWindow.setProgressBar(Math.max(0, Math.min(1, overallFraction)));
  };

  setStopped(false);

  let activeTileSize = initialTileSize;
  let memoryRetries = 0;
  let vramConstrained = false;
  const cpuCount = os.cpus().length;

  const runExtractPass = (useHwDecode: boolean): Promise<string[]> =>
    new Promise((resolve, reject) => {
      logit(
        `🎞 Extracting video frames (${intermediateFormat.toUpperCase()}, ${
          useHwDecode ? "hwaccel auto" : "software decode"
        }) at CFR ${mediaInfo.fpsRational} (${mediaInfo.fps.toFixed(2)} fps)...`,
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
        if (timeMatch && mediaInfo.duration > 0) {
          const seconds = timeToSeconds(timeMatch[1]);
          const fraction = Math.min(0.99, seconds / mediaInfo.duration);
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
        resolve(frames);
      });
    });

  const extractFrames = async (): Promise<string[]> => {
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
          payload.threads?.trim() ||
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
            // Compression 0 = quality 100 (JPG) or fastest compression (PNG)
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
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.UPSCAYL_WARNING,
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

  let encoderProcess: ChildProcessWithoutNullStreams | null = null;
  let encoderTracked: TrackedChildProcess | null = null;

  try {
    // Stage 1: Extract CFR frames
    const frames = await extractFrames();
    if (stopped) {
      cleanup(true);
      mainWindow.setProgressBar(-1);
      return;
    }

    const totalFrames = frames.length;
    const chunkSize = computeOptimalChunkSize(totalFrames, intermediateFormat);
    const chunks = computeChunkRanges(totalFrames, chunkSize);

    // Start single streaming FFmpeg encoder (GPU HW accelerated when available)
    const encodeArgs = buildVideoEncodeArgs({
      fpsRational: mediaInfo.fpsRational,
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
    });

    logit(
      `🎬 Starting streaming FFmpeg encoder (${usedEncoderLabel}, pipe=${intermediateFormat}): `,
      JSON.stringify(encodeArgs),
    );
    const spawnedEncoder = spawn(ffmpegBin, encodeArgs, { windowsHide: true });
    encoderProcess = spawnedEncoder;
    const trackedEncoder: TrackedChildProcess = {
      process: spawnedEncoder,
      kill: () => spawnedEncoder.kill(),
    };
    encoderTracked = trackedEncoder;
    childProcesses.push(trackedEncoder);

    let encoderStderrTail = "";
    let encoderFailed: Error | null = null;

    const encoderClosePromise = new Promise<void>((resolve, reject) => {
      spawnedEncoder.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        encoderStderrTail = (encoderStderrTail + text).slice(-STDERR_TAIL_LIMIT);
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

    emitProgress("upscaling", 0, {
      message: `Upscaling frames... 0/${totalFrames}`,
      completedFrames: 0,
      totalFrames,
      chunk: 1,
      totalChunks: chunks.length,
    });

    // Stage 2: Double-buffered chunked upscaling + async FFmpeg piping.
    // While chunk N is piped asynchronously to FFmpeg in the background,
    // chunk N+1 immediately begins GPU upscaling, keeping GPU utilization high.
    let processedFrames = 0;
    let totalSkippedDuplicates = 0;
    let previousChunkLastHash: string | null = null;
    let lastPipedUpscaledBuffer: Buffer | null = null;
    let pendingPipePromise: Promise<void> = Promise.resolve();
    let pipeError: Error | null = null;

    const pipeChunkToEncoder = async (
      chunkOutDir: string,
      plan: ChunkDeduplicationPlan,
      chunkTotalFrames: number,
      chunkIndex: number,
      totalChunks: number,
      afterChunkCompletedFrames: number,
    ) => {
      try {
        const uniqueCache = new Map<string, Buffer>();

        for (const entry of plan.emitOrder) {
          if (stopped) break;
          if (encoderFailed) throw encoderFailed;

          let bufferToWrite: Buffer;

          if (entry.reusePreviousChunk) {
            if (!lastPipedUpscaledBuffer) {
              throw new Error(
                `Missing previous upscaled frame while reusing duplicate ${entry.name}`,
              );
            }
            bufferToWrite = lastPipedUpscaledBuffer;
          } else {
            const sourceName = entry.sourceFrame!;
            let cached = uniqueCache.get(sourceName);
            if (!cached) {
              const upscaledFramePath = path.join(chunkOutDir, sourceName);
              if (!fs.existsSync(upscaledFramePath)) {
                throw new Error(
                  `Expected upscaled frame was not produced: ${sourceName}`,
                );
              }
              cached = await fs.promises.readFile(upscaledFramePath);
              uniqueCache.set(sourceName, cached);
              // Delete frame on disk immediately once loaded into buffer
              await fs.promises.unlink(upscaledFramePath).catch(() => {});
            }
            bufferToWrite = cached;
            lastPipedUpscaledBuffer = cached;
          }

          await writeBufferToStream(spawnedEncoder.stdin, bufferToWrite);
        }

        // Release per-chunk memory buffers and remove chunk output directory
        uniqueCache.clear();
        await fs.promises
          .rm(chunkOutDir, { recursive: true, force: true })
          .catch(() => {});

        if (!stopped) {
          emitProgress("upscaling", afterChunkCompletedFrames / totalFrames, {
            message: `Upscaling frames... ${afterChunkCompletedFrames}/${totalFrames}`,
            completedFrames: afterChunkCompletedFrames,
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

      const chunkFrames = frames.slice(range.start, range.end);
      const chunkInDir = path.join(tempRoot, `chunk_in_${range.chunkIndex}`);
      const chunkOutDir = path.join(tempRoot, `chunk_out_${range.chunkIndex}`);
      fs.mkdirSync(chunkInDir, { recursive: true });
      fs.mkdirSync(chunkOutDir, { recursive: true });

      let plan: ChunkDeduplicationPlan;
      if (deduplicateFrames) {
        const fingerprints = await hashFrameBatch(inputFramesDir, chunkFrames);
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
      for (const frameName of chunkFrames) {
        const src = path.join(inputFramesDir, frameName);
        if (uniqueSet.has(frameName)) {
          fs.renameSync(src, path.join(chunkInDir, frameName));
        } else {
          // Duplicate frame doesn't need GPU upscaling; delete its input file
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

      // Discard input frames for this chunk immediately
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
      const completedAfterChunk = processedFrames;

      // Wait ONLY for the previous chunk's pipe to finish before starting this
      // chunk's pipe, guaranteeing strict sequential frame order while
      // overlapping GPU inference of chunk N+1 with piping of chunk N.
      await pendingPipePromise;
      if (pipeError) throw pipeError;
      if (encoderFailed) throw encoderFailed;

      pendingPipePromise = pipeChunkToEncoder(
        chunkOutDir,
        plan,
        chunkFrames.length,
        range.chunkIndex,
        range.totalChunks,
        completedAfterChunk,
      );
      pendingPipePromise.catch(() => {});
    }

    // Wait for the final chunk to finish piping into FFmpeg
    await pendingPipePromise;
    if (pipeError) throw pipeError;

    if (stopped) {
      try {
        spawnedEncoder.stdin.destroy();
        spawnedEncoder.kill();
      } catch {}
      cleanup(true);
      mainWindow.setProgressBar(-1);
      return;
    }

    // Stage 3: Finalize container / moov atom / audio muxing
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
      cleanup(true);
      mainWindow.setProgressBar(-1);
      return;
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

    cleanup(false);
    mainWindow.setProgressBar(-1);

    const doneInfo: VideoDoneInfo = {
      outputPath: outputFile,
      inputPath: inputVideo,
      fileSize: outputFileSize,
      durationMs: Date.now() - startedAt,
      totalFrames,
      model,
      scaleLabel,
      codec: encodingProfile.codec,
      container: encodingProfile.container,
      usedEncoder: usedEncoderLabel,
      skippedDuplicateFrames: totalSkippedDuplicates,
    };

    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE, doneInfo);
    showNotification("Upscayl-Next", "Video upscaled successfully!");
    logit("💯 Video upscaling complete: ", JSON.stringify(doneInfo));
  } catch (error: any) {
    if (encoderProcess && !encoderProcess.killed) {
      try {
        encoderProcess.stdin.destroy();
        encoderProcess.kill();
      } catch {}
    }
    if (encoderTracked) {
      removeChildProcess(encoderTracked);
    }
    cleanup(true);
    mainWindow.setProgressBar(-1);

    if (stopped || error?.message === "__STOPPED__") {
      logit("🛑 Video upscaling stopped by user.");
      return;
    }

    const message =
      error instanceof Error ? error.message : `Video upscaling failed: ${error}`;
    logit("❌ Video upscaling failed: ", message);
    sendError(message);
  }
};

export default videoUpscayl;
