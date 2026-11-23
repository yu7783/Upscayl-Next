import { ChildProcessWithoutNullStreams, spawn } from "child_process";
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
  VideoProgressInfo,
  VideoProgressStage,
  VideoUpscaylPayload,
} from "../../common/types/types";
import showNotification from "../utils/show-notification";
import { MODELS } from "../../common/models-list";
import decodePath from "../../common/decode-path";
import getThreadCount from "../../common/thread-count";
import countOccurrences from "../../common/count-occurrences";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";
import {
  DEFAULT_VIDEO_CHUNK_SIZE,
  buildVideoEncodeArgs,
  buildVideoExtractArgs,
  buildVideoOutputFilename,
  calculateVideoOverallProgress,
  computeChunkRanges,
  resolveVideoEncodingProfile,
} from "../../common/video-upscayl-helpers";
import { checkFfmpegStatus, probeVideoMediaInfo } from "./video-info";

const MAX_MEMORY_RETRIES = 6;
const STDERR_TAIL_LIMIT = 800;

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
  const compression = payload.compression;
  const initialTileSize = payload.tileSize;
  const ttaMode = payload.ttaMode;
  const gpuId = payload.gpuId;
  const keepAudio = payload.keepAudio !== false;

  const encodingProfile = resolveVideoEncodingProfile({
    codec: payload.videoCodec ?? "h264",
    container: payload.videoContainer ?? "mp4",
    quality: payload.videoQuality ?? "balanced",
  });

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
      stage === "preparing"
        ? 1
        : stage === "extracting"
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

  const extractFrames = (): Promise<string[]> =>
    new Promise((resolve, reject) => {
      logit(
        `🎞 Extracting video frames at CFR ${mediaInfo.fpsRational} (${mediaInfo.fps.toFixed(2)} fps)...`,
      );
      emitProgress("extracting", 0, {
        message: "Extracting frames... 0%",
      });

      const extractArgs = buildVideoExtractArgs({
        inputVideo,
        outputPattern: path.join(inputFramesDir, "frame_%08d.png"),
        fpsRational: mediaInfo.fpsRational,
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
          .filter((file) => file.toLowerCase().endsWith(".png"))
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

  const upscaleChunkDirectory = (
    chunkInputDir: string,
    chunkOutputDir: string,
    chunkFrameCount: number,
    baseCompletedFrames: number,
    totalFrames: number,
    chunkIndex: number,
    totalChunks: number,
    threads: string,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const attempt = (currentTileSize: number, isRetry: boolean) => {
        if (stopped) {
          reject(new Error("__STOPPED__"));
          return;
        }

        // Clean any partial output from a failed retry attempt
        if (isRetry) {
          fs.rmSync(chunkOutputDir, { recursive: true, force: true });
          fs.mkdirSync(chunkOutputDir, { recursive: true });
        }

        logit(
          `🚀 Upscaling chunk ${chunkIndex}/${totalChunks} (${chunkFrameCount} frames)` +
            (isRetry ? ` [retry tile ${currentTileSize}px]` : ""),
        );

        const upscayl = spawnUpscayl(
          getBatchArguments({
            inputDir: chunkInputDir,
            outputDir: chunkOutputDir,
            modelsPath: modelsDir,
            model,
            gpuId,
            saveImageAs: "png",
            scale,
            customWidth,
            compression,
            tileSize: currentTileSize,
            ttaMode,
            threads,
          }),
          logit,
        );

        const tracked: TrackedChildProcess = upscayl;
        childProcesses.push(tracked);

        let chunkCompleted = 0;
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
            chunkCompleted = Math.min(
              chunkCompleted + successCount,
              chunkFrameCount,
            );
            const totalDone = Math.min(
              baseCompletedFrames + chunkCompleted,
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
    const chunks = computeChunkRanges(totalFrames, DEFAULT_VIDEO_CHUNK_SIZE);
    const threads =
      payload.threads?.trim() ||
      getThreadCount({
        totalImages: Math.min(totalFrames, DEFAULT_VIDEO_CHUNK_SIZE),
        cpuCount: os.cpus().length,
      });

    // Start single streaming FFmpeg encoder for Stage 2 + 3 so peak disk usage
    // stays bounded to a single chunk of upscaled frames.
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
    });

    logit("🎬 Starting streaming FFmpeg encoder: ", JSON.stringify(encodeArgs));
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
      encoderProcess!.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        encoderStderrTail = (encoderStderrTail + text).slice(-STDERR_TAIL_LIMIT);
      });

      encoderProcess!.on("error", (err) => {
        encoderFailed = new Error(`Failed to run FFmpeg encoder: ${err.message}`);
        reject(encoderFailed);
      });

      encoderProcess!.on("close", (code) => {
        if (encoderTracked) {
          removeChildProcess(encoderTracked);
        }
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

    // Attach catch handler early so an unexpected early encoder exit does not
    // cause an unhandled rejection while chunk upscaling is awaiting.
    encoderClosePromise.catch(() => {});

    emitProgress("upscaling", 0, {
      message: `Upscaling frames... 0/${totalFrames}`,
      completedFrames: 0,
      totalFrames,
      chunk: 1,
      totalChunks: chunks.length,
    });

    // Stage 2: Upscale chunk-by-chunk and stream upscaled PNGs into FFmpeg
    let processedFrames = 0;

    for (const range of chunks) {
      if (stopped) break;
      if (encoderFailed) throw encoderFailed;

      const chunkFrames = frames.slice(range.start, range.end);
      const chunkInDir = path.join(tempRoot, `chunk_in_${range.chunkIndex}`);
      const chunkOutDir = path.join(tempRoot, `chunk_out_${range.chunkIndex}`);
      fs.mkdirSync(chunkInDir, { recursive: true });
      fs.mkdirSync(chunkOutDir, { recursive: true });

      for (const frameName of chunkFrames) {
        fs.renameSync(
          path.join(inputFramesDir, frameName),
          path.join(chunkInDir, frameName),
        );
      }

      await upscaleChunkDirectory(
        chunkInDir,
        chunkOutDir,
        chunkFrames.length,
        processedFrames,
        totalFrames,
        range.chunkIndex,
        range.totalChunks,
        threads,
      );

      // Immediately discard input frames for this chunk to minimize disk usage
      fs.rmSync(chunkInDir, { recursive: true, force: true });

      if (stopped) {
        fs.rmSync(chunkOutDir, { recursive: true, force: true });
        break;
      }

      // Stream upscaled PNGs into FFmpeg in strict frame order and delete each
      // frame immediately after piping it.
      for (const frameName of chunkFrames) {
        if (stopped) break;
        if (encoderFailed) throw encoderFailed;

        const upscaledFramePath = path.join(chunkOutDir, frameName);
        if (!fs.existsSync(upscaledFramePath)) {
          throw new Error(
            `Expected upscaled frame was not produced: ${frameName}`,
          );
        }

        const frameBuffer = fs.readFileSync(upscaledFramePath);
        await writeBufferToStream(encoderProcess.stdin, frameBuffer);
        fs.unlinkSync(upscaledFramePath);
      }

      fs.rmSync(chunkOutDir, { recursive: true, force: true });
      processedFrames += chunkFrames.length;

      emitProgress("upscaling", processedFrames / totalFrames, {
        message: `Upscaling frames... ${processedFrames}/${totalFrames}`,
        completedFrames: processedFrames,
        totalFrames,
        chunk: range.chunkIndex,
        totalChunks: range.totalChunks,
      });
    }

    if (stopped) {
      try {
        encoderProcess.stdin.destroy();
        encoderProcess.kill();
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

    encoderProcess.stdin.end();
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
