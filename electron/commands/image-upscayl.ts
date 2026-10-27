import fs from "fs";
import { modelsPath } from "../utils/get-resource-paths";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import {
  savedCustomModelsPath,
  setChildProcesses,
  setStopped,
  stopped,
} from "../utils/config-variables";
import { getSingleImageArguments } from "../utils/get-arguments";
import logit from "../utils/logit";
import slash from "../utils/slash";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { parse } from "path";
import { getMainWindow } from "../main-window";
import { ImageUpscaylPayload } from "../../common/types/types";
import { ImageFormat } from "../types/types";
import showNotification from "../utils/show-notification";
import getFilenameFromPath from "../../common/get-file-name";
import decodePath from "../../common/decode-path";
import getDirectoryFromPath from "../../common/get-directory-from-path";
import { MODELS } from "../../common/models-list";
import { getPlatform } from "../utils/get-device-specs";
import { copyMetadata } from "../utils/copy-metadata";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";

const imageUpscayl = async (event, payload: ImageUpscaylPayload) => {
  const mainWindow = getMainWindow();

  if (!mainWindow) {
    logit("No main window found");
    return;
  }

  // GET VARIABLES
  const tileSize = payload.tileSize;
  const compression = payload.compression;
  const ttaMode = payload.ttaMode;
  const threads = payload.threads?.trim() || undefined;
  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const model = payload.model as string;
  const gpuId = payload.gpuId as string;
  const saveImageAs = payload.saveImageAs as ImageFormat;
  const overwrite = payload.overwrite as boolean;
  const imagePath = decodePath(payload.imagePath);
  try {
    if (!fs.statSync(imagePath).isFile()) {
      throw new Error("not a file");
    }
  } catch {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      `The selected image path is not a valid file: ${imagePath}`,
    );
    return;
  }
  let inputDir = getDirectoryFromPath(imagePath);
  let outputDir = decodePath(payload.outputPath);
  try {
    if (
      !payload.outputPath ||
      payload.outputPath.trim().length === 0 ||
      !fs.statSync(outputDir).isDirectory()
    ) {
      throw new Error("not a directory");
    }
  } catch {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      `The output path is not a valid folder: ${outputDir}`,
    );
    return;
  }
  const fileNameWithExt = getFilenameFromPath(imagePath);
  const fileName = parse(fileNameWithExt).name;

  const outFile =
    outputDir +
    slash +
    fileName +
    "_upscayl_" +
    (useCustomWidth ? `${customWidth}px_` : `${scale}x_`) +
    model +
    "." +
    saveImageAs;

  const isDefaultModel = model in MODELS;

  // Check if filename is too long
  if (outFile.length >= 255) {
    if (getPlatform() === "win") {
      logit("Filename too long for Windows.");
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        "The filename exceeds the maximum path length allowed by Windows. Please shorten the filename or choose a different save location.",
      );
    } else {
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_WARNING,
        "The output filename exceeds 255 characters, which is over the max path length allowed by Windows, though your OS supports it. Please consider shortening the filename next time.",
      );
    }
  }

  // UPSCALE
  if (fs.existsSync(outFile) && !overwrite) {
    // If already upscayled, just output that file
    logit("✅ Already upscayled at: ", outFile);
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_DONE, outFile);
  } else {
    logit(
      "✅ Upscayl Variables: ",
      JSON.stringify({
        model,
        gpuId,
        saveImageAs,
        inputDir,
        fileNameWithExt,
        outputDir,
        outFile,
        fileName,
        scale,
        compression,
        customWidth,
        useCustomWidth,
        tileSize,
      }),
    );
    setStopped(false);
    let failed = false;
    let memoryRetries = 0;
    const MAX_MEMORY_RETRIES = 6;

    /**
     * Runs one upscale attempt. If the GPU cannot allocate memory, the attempt
     * is killed and the same image is retried with a smaller tile size so the
     * upscale can still complete instead of failing outright.
     */
    const startAttempt = (currentTileSize: number) => {
      if (stopped || !mainWindow) return;
      let attemptFailed = false;
      let retrying = false;

      const upscayl = spawnUpscayl(
        getSingleImageArguments({
          // decodePath already decoded imagePath above. Decoding these values a
          // second time throws on literal "%" characters in Windows paths.
          inputDir,
          fileNameWithExt,
          outFile,
          modelsPath: isDefaultModel
            ? modelsPath
            : (savedCustomModelsPath ?? modelsPath),
          model,
          scale,
          gpuId,
          saveImageAs,
          customWidth,
          compression,
          tileSize: currentTileSize,
          ttaMode,
          threads,
        }),
        logit,
      );

      setChildProcesses(upscayl);

      const retryWithSmallerTile = (text: string): boolean => {
        if (!isVulkanMemoryError(text)) return false;
        // A single failed run can print the error more than once. Swallow the
        // follow-up lines while the retry timer is pending.
        if (retrying) return true;
        const fallbackTileSize = getFallbackTileSize(currentTileSize);
        if (fallbackTileSize === null || memoryRetries >= MAX_MEMORY_RETRIES) {
          return false;
        }

        memoryRetries += 1;
        retrying = true;
        attemptFailed = true;
        upscayl.kill();
        mainWindow?.setProgressBar(-1);
        logit(
          `⚠️ Vulkan memory allocation failed. Retrying with tile size ${fallbackTileSize}px...`,
        );
        mainWindow?.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_WARNING,
          `The GPU ran out of memory (vk Allocated memory failed). Retrying with a smaller tile size (${fallbackTileSize}px)...`,
        );
        // Give the driver a moment to release the failed allocation.
        setTimeout(() => startAttempt(fallbackTileSize), 750);
        return true;
      };

      const onData = (data: string | Buffer) => {
        // Ignore any remaining output from an attempt that is being retried.
        if (retrying) return;
        const text = data.toString();
        logit(text);
        const progress = parseFloat(text);
        if (!Number.isNaN(progress)) {
          mainWindow?.setProgressBar(progress / 100);
        }
        mainWindow?.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_PROGRESS,
          text,
        );
        if (retryWithSmallerTile(text)) return;
        if (text.includes("Error") || text.includes("failed")) {
          upscayl.kill();
          attemptFailed = true;
          onError(text);
        } else if (text.includes("Resizing")) {
          mainWindow?.webContents.send(
            ELECTRON_COMMANDS.SCALING_AND_CONVERTING,
          );
        }
      };
      const onError = (data: string | Buffer) => {
        if (!mainWindow || retrying) return;
        const text = data.toString();
        mainWindow.setProgressBar(-1);
        // Process-level errors can also report a Vulkan allocation failure.
        if (retryWithSmallerTile(text)) return;
        failed = true;
        attemptFailed = true;
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_ERROR,
          isVulkanMemoryError(text) ? VULKAN_MEMORY_ERROR_MESSAGE : text,
        );
        upscayl.kill();
        return;
      };
      const onClose = async () => {
        // A retried attempt is handled by the new process, not this one.
        if (retrying) return;
        if (!failed && !attemptFailed && !stopped) {
          logit("💯 Done upscaling");
          // Free up memory
          upscayl.kill();
          mainWindow?.setProgressBar(-1);
          if (payload.copyMetadata) {
            logit("🏷️ Copying metadata...");
            try {
              await copyMetadata(imagePath, outFile);
              logit("✅ Metadata copied to: ", outFile);
            } catch (error) {
              logit("❌ Error copying metadata: ", error);
              mainWindow?.webContents.send(
                ELECTRON_COMMANDS.METADATA_ERROR,
                error,
              );
            }
          }
          mainWindow?.webContents.send(
            ELECTRON_COMMANDS.UPSCAYL_DONE,
            outFile,
          );
          showNotification("Upscayl", "Image upscayled successfully!");
        }
      };

      upscayl.process.stderr.on("data", onData);
      upscayl.process.on("error", onError);
      upscayl.process.on("close", onClose);
    };

    startAttempt(tileSize);
  }
};

export default imageUpscayl;
