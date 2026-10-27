import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { getMainWindow } from "../main-window";
import {
  childProcesses,
  savedCustomModelsPath,
  setStopped,
  stopped,
} from "../utils/config-variables";
import logit from "../utils/logit";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { getBatchArguments } from "../utils/get-arguments";
import { modelsPath } from "../utils/get-resource-paths";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import { VideoUpscaylPayload } from "../../common/types/types";
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

type MediaInfo = {
  fps: number;
  duration: number;
};

const runProbe = (args: string[]) =>
  spawnSync("ffprobe", args, { encoding: "utf8", windowsHide: true });

const getMediaInfo = (inputPath: string): MediaInfo => {
  const fpsResult = runProbe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=r_frame_rate",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);

  let fps = 30;
  const fpsText = fpsResult.stdout?.trim();
  if (fpsText) {
    const [num, den] = fpsText.split("/").map(Number);
    if (num && den) {
      const parsed = num / den;
      if (Number.isFinite(parsed) && parsed > 0) fps = parsed;
    } else if (Number.isFinite(Number(fpsText)) && Number(fpsText) > 0) {
      fps = Number(fpsText);
    }
  }

  const durationResult = runProbe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);

  const duration = Number(durationResult.stdout?.trim());
  return {
    fps,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
};

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

const videoUpscayl = async (event, payload: VideoUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

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
  } catch (error) {
    sendError(`The video file does not exist or cannot be read: ${inputVideo}`);
    return;
  }

  try {
    if (!fs.statSync(outputBasePath).isDirectory()) {
      sendError(`The output path is not a folder: ${outputBasePath}`);
      return;
    }
  } catch (error) {
    sendError(
      `The output folder does not exist or cannot be read: ${outputBasePath}`,
    );
    return;
  }

  const ffmpegCheck = spawnSync("ffmpeg", ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (ffmpegCheck.error) {
    sendError(
      "FFmpeg was not found. Install FFmpeg and make sure it is available in your PATH to upscale videos.",
    );
    return;
  }

  const model = payload.model;
  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const compression = payload.compression;
  const tileSize = payload.tileSize;
  const ttaMode = payload.ttaMode;
  const gpuId = payload.gpuId;
  const isDefaultModel = model in MODELS;
  const modelsDir = isDefaultModel
    ? modelsPath
    : (savedCustomModelsPath ?? modelsPath);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-video-"));
  const inputFramesDir = path.join(tempRoot, "input");
  const outputFramesDir = path.join(tempRoot, "upscaled");
  fs.mkdirSync(inputFramesDir, { recursive: true });
  fs.mkdirSync(outputFramesDir, { recursive: true });

  const cleanup = () => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      logit("🧹 Removed video temporary folder");
    } catch (error) {
      logit("⚠️ Could not remove video temporary folder: ", error);
    }
  };

  const { fps, duration } = getMediaInfo(inputVideo);
  const scaleLabel = useCustomWidth ? `${customWidth}px` : `${scale}x`;
  const inputParsed = path.parse(inputVideo);
  const outputFileName = `${inputParsed.name}_upscayl_${model}_${scaleLabel}.mp4`;
  const outputFile = getUniqueOutputPath(outputBasePath, outputFileName);

  setStopped(false);
  let failed = false;
  let memoryRetries = 0;
  const MAX_MEMORY_RETRIES = 6;
  let activeChild: ReturnType<typeof spawn> | null = null;

  const stopChild = () => {
    if (activeChild && !activeChild.killed) {
      activeChild.kill();
    }
  };

  const handleChildError = (error: any) => {
    failed = true;
    sendError(`Error upscaling video! ${error}`);
  };

  const runFfmpeg = (
    args: string[],
    onStderr: (text: string) => void,
    onClose: (code: number | null) => void,
  ) => {
    const child = spawn("ffmpeg", args, { windowsHide: true });
    activeChild = child;
    childProcesses.push({ process: child as any, kill: () => child.kill() });
    child.stderr.on("data", (data) => onStderr(data.toString()));
    child.on("error", handleChildError);
    child.on("close", (code) => {
      activeChild = null;
      onClose(code);
    });
  };

  const sendProgress = (text: string, fraction: number) => {
    if (!mainWindow) return;
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS, text);
    if (fraction >= 0) {
      mainWindow.setProgressBar(Math.max(0, Math.min(1, fraction)));
    }
  };


  const extractFrames = () => {
    logit("🎞 Extracting video frames...");
    sendProgress("Extracting frames...", 0);

    runFfmpeg(
      [
        "-y",
        "-i",
        inputVideo,
        "-vsync",
        "0",
        path.join(inputFramesDir, "frame_%08d.png"),
      ],
      (text) => {
        const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
        if (timeMatch && duration > 0) {
          const seconds = timeToSeconds(timeMatch[1]);
          const percent = Math.min(99, Math.round((seconds / duration) * 100));
          sendProgress(
            `Extracting frames... ${percent}%`,
            0.2 * (percent / 100),
          );
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.FFMPEG_VIDEO_PROGRESS,
            text,
          );
        }
      },
      (code) => {
        if (failed || stopped) {
          cleanup();
          return;
        }
        if (code !== 0) {
          failed = true;
          sendError("FFmpeg failed while extracting video frames.");
          cleanup();
          return;
        }
        upscaleFrames();
      },
    );
  };


  const upscaleFrames = (currentTileSize: number = tileSize, isRetry = false) => {
    if (!mainWindow || stopped) return;
    let totalFrames = 0;
    try {
      totalFrames = fs
        .readdirSync(inputFramesDir)
        .filter((file) => file.toLowerCase().endsWith(".png")).length;
    } catch (error) {
      totalFrames = 0;
    }

    if (totalFrames === 0) {
      failed = true;
      sendError("No frames were extracted from the video.");
      cleanup();
      return;
    }

    const threads =
      payload.threads?.trim() ||
      getThreadCount({ totalImages: totalFrames, cpuCount: os.cpus().length });

    logit(
      `🚀 Upscaling ${totalFrames} video frames...` +
        (isRetry ? ` (tile size ${currentTileSize}px)` : ""),
    );
    sendProgress(`Upscaling frames... 0/${totalFrames}`, 0.2);

    const upscayl = spawnUpscayl(
      getBatchArguments({
        inputDir: inputFramesDir,
        outputDir: outputFramesDir,
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
    childProcesses.push(upscayl);

    let completed = 0;
    let retrying = false;
    // stderr chunks can split a single error line; keep a short tail so the
    // "vkAllocateMemory failed" message is still recognised across chunks.
    let stderrTail = "";

    const retryWithSmallerTile = (text: string): boolean => {
      if (!isVulkanMemoryError(text)) return false;
      // A failed run may print the same error on several lines.
      if (retrying) return true;
      const fallbackTileSize = getFallbackTileSize(currentTileSize);
      if (fallbackTileSize === null || memoryRetries >= MAX_MEMORY_RETRIES) {
        return false;
      }

      memoryRetries += 1;
      retrying = true;
      upscayl.kill();
      mainWindow?.setProgressBar(-1);
      logit(
        `⚠️ Vulkan memory allocation failed while upscaling video frames. Retrying with tile size ${fallbackTileSize}px...`,
      );
      mainWindow?.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_WARNING,
        `The GPU ran out of memory (vk AllocateMemory failed). Retrying video frames with a smaller tile size (${fallbackTileSize}px)...`,
      );
      // The extracted frames are reused, only the upscale pass is repeated.
      setTimeout(() => {
        if (stopped) {
          cleanup();
          return;
        }
        upscaleFrames(fallbackTileSize, true);
      }, 750);
      return true;
    };

    upscayl.process.stderr.on("data", (data: any) => {
      if (!mainWindow || retrying) return;
      const text = data.toString();
      const memoryText = stderrTail + text;
      stderrTail = memoryText.slice(-200);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS,
        text,
      );
      const successCount = countOccurrences(text, "Successful");
      if (successCount > 0) {
        completed += successCount;
        const safeCompleted = Math.min(completed, totalFrames);
        sendProgress(
          `Upscaling frames... ${safeCompleted}/${totalFrames}`,
          0.2 + 0.7 * (safeCompleted / totalFrames),
        );
      }
      if (retryWithSmallerTile(memoryText)) return;
      if (text.includes("Error") || text.includes("failed")) {
        failed = true;
        sendError(
          isVulkanMemoryError(memoryText)
            ? VULKAN_MEMORY_ERROR_MESSAGE
            : `Error upscaling video frames! ${text}`,
        );
        upscayl.kill();
      }
    });

    upscayl.process.on("error", (error) => {
      if (retrying) return;
      if (retryWithSmallerTile(String(error))) return;
      handleChildError(error);
    });

    upscayl.process.on("close", () => {
      // A retried pass is handled by the new process, not this one.
      if (retrying) return;
      if (failed || stopped || upscayl.process.killed) {
        cleanup();
        return;
      }
      encodeVideo();
    });
  };


  const encodeVideo = () => {
    logit("🎬 Encoding upscaled frames into a video...");
    sendProgress("Encoding video...", 0.9);

    runFfmpeg(
      [
        "-y",
        "-framerate",
        fps.toString(),
        "-i",
        path.join(outputFramesDir, "frame_%08d.png"),
        "-i",
        inputVideo,
        "-map",
        "0:v:0",
        "-map",
        "1:a?",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        outputFile,
      ],
      (text) => {
        const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
        if (timeMatch && duration > 0) {
          const seconds = timeToSeconds(timeMatch[1]);
          const percent = Math.min(99, Math.round((seconds / duration) * 100));
          sendProgress(
            `Encoding video... ${percent}%`,
            0.9 + 0.1 * (percent / 100),
          );
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.FFMPEG_VIDEO_PROGRESS,
            text,
          );
        }
      },
      (code) => {
        if (failed || stopped) {
          cleanup();
          return;
        }
        if (code !== 0) {
          failed = true;
          sendError("FFmpeg failed while encoding the upscaled video.");
          cleanup();
          return;
        }
        cleanup();
        mainWindow.setProgressBar(-1);
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE,
          outputFile,
        );
        showNotification("Upscayled", "Video upscaled successfully!");
      },
    );
  };

  try {
    extractFrames();
  } catch (error) {
    failed = true;
    sendError(`Video upscaling failed: ${error}`);
    stopChild();
    cleanup();
  }
};

export default videoUpscayl;

