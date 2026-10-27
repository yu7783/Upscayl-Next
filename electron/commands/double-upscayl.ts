import fs from "fs";
import { parse } from "path";
import { getMainWindow } from "../main-window";
import {
  childProcesses,
  savedCustomModelsPath,
  setStopped,
  stopped,
} from "../utils/config-variables";
import slash from "../utils/slash";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import {
  getDoubleUpscaleArguments,
  getDoubleUpscaleSecondPassArguments,
} from "../utils/get-arguments";
import { modelsPath } from "../utils/get-resource-paths";
import logit from "../utils/logit";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import { DoubleUpscaylPayload } from "../../common/types/types";
import { ImageFormat } from "../types/types";
import showNotification from "../utils/show-notification";
import getFilenameFromPath from "../../common/get-file-name";
import decodePath from "../../common/decode-path";
import getDirectoryFromPath from "../../common/get-directory-from-path";
import { MODELS } from "../../common/models-list";
import { copyMetadata } from "../utils/copy-metadata";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";

const doubleUpscayl = async (event, payload: DoubleUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  const tileSize = payload.tileSize;
  const compression = payload.compression;
  const ttaMode = payload.ttaMode;
  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const model = payload.model;
  const gpuId = payload.gpuId as string;
  const saveImageAs = payload.saveImageAs as ImageFormat;
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
  const fullfileName = getFilenameFromPath(imagePath);
  const fileName = parse(fullfileName).name;

  const totalPasses = 2;
  // The image is decoded/encoded twice here. Giving the load/save stages an
  // extra worker reduces wall-clock time without inflating GPU memory.
  // An explicit value from the settings overrides this default.
  const threads = payload.threads?.trim() || "2:2:2";
  const updateProgressBar = (passNumber: number, data: string) => {
    if (!mainWindow) return;
    const match = data.match(/(\d+(?:\.\d+)?)%/);
    if (!match) return;
    const percent = Math.min(Math.max(parseFloat(match[1]), 0), 100);
    const overall = ((passNumber - 1) + percent / 100) / totalPasses;
    mainWindow.setProgressBar(Math.max(0, Math.min(1, overall)));
  };
  mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_PASS_INFO, {
    pass: 1,
    totalPasses,
  });

  const isDefaultModel = model in MODELS;

  // COPY IMAGE TO TMP FOLDER

  const outFile =
    outputDir +
    slash +
    fileName +
    "_upscayl_" +
    (useCustomWidth ? `${customWidth}px_` : `${scale}x_`) +
    model +
    "." +
    saveImageAs;

  // UPSCALE
  setStopped(false);
  let memoryRetries = 0;
  const MAX_MEMORY_RETRIES = 6;

  /**
   * Runs the two-pass upscale. A Vulkan/VRAM allocation failure aborts the
   * whole flow and retries both passes with a smaller tile size, so a partial
   * second pass is never upscaled again from a corrupt intermediate file.
   */
  const startFlow = (currentTileSize: number) => {
    if (stopped || !mainWindow) return;
    let failed = false;
    let failed2 = false;
    let retrying = false;

    const upscayl = spawnUpscayl(
      getDoubleUpscaleArguments({
        inputDir,
        // decodePath already decoded imagePath above. Decoding the filename a
        // second time throws on literal "%" characters in Windows file names.
        fullfileName,
        outFile,
        modelsPath: isDefaultModel
          ? modelsPath
          : (savedCustomModelsPath ?? modelsPath),
        model,
        scale,
        customWidth,
        gpuId,
        saveImageAs,
        tileSize: currentTileSize,
        threads,
      }),
      logit,
    );

    let upscayl2: ReturnType<typeof spawnUpscayl> | undefined;

    childProcesses.push(upscayl);

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
      upscayl2?.kill();
      mainWindow?.setProgressBar(-1);
      logit(
        `⚠️ Vulkan memory allocation failed. Retrying with tile size ${fallbackTileSize}px...`,
      );
      mainWindow?.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_WARNING,
        `The GPU ran out of memory (vk Allocated memory failed). Retrying with a smaller tile size (${fallbackTileSize}px)...`,
      );
      // Give the driver a moment to release the failed allocation.
      setTimeout(() => startFlow(fallbackTileSize), 750);
      return true;
    };

    // SECOND PASS FUNCTIONS
    const onError2 = (data: string | Buffer) => {
      if (!mainWindow || retrying) return;
      const text = data.toString();
      mainWindow.setProgressBar(-1);
      // SEND UPSCAYL PROGRESS TO RENDERER
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
        text,
      );
      if (retryWithSmallerTile(text)) return;
      // SET FAILED TO TRUE
      failed2 = true;
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        isVulkanMemoryError(text)
          ? VULKAN_MEMORY_ERROR_MESSAGE
          : "Error upscaling image. Error: " + text,
      );
      showNotification("Upscayl Failure", "Failed to upscale image!");
      upscayl2?.kill();
      return;
    };

    const onData2 = (data: string | Buffer) => {
      if (!mainWindow || retrying) return;
      // CONVERT DATA TO STRING
      const text = data.toString();
      updateProgressBar(2, text);
      // SEND UPSCAYL PROGRESS TO RENDERER
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
        text,
      );
      // IF PROGRESS HAS ERROR, UPSCAYL FAILED
      if (retryWithSmallerTile(text)) return;
      if (text.includes("Error") || text.includes("failed")) {
        upscayl2?.kill();
        failed2 = true;
        onError2(text);
      } else if (text.includes("Resizing")) {
        mainWindow.webContents.send(ELECTRON_COMMANDS.SCALING_AND_CONVERTING);
      }
    };

    const onClose2 = async () => {
      if (!mainWindow) return;
      // A retried flow is handled by the new process, not this one.
      if (retrying) return;
      if (!failed2 && !stopped) {
        logit("💯 Done upscaling");

        mainWindow.setProgressBar(-1);
        if (payload.copyMetadata) {
          logit("🏷️ Copying metadata...");
          try {
            await copyMetadata(imagePath, outFile);
            logit("✅ Metadata copied to: ", outFile);
          } catch (error) {
            logit("❌ Error copying metadata: ", error);
            mainWindow.webContents.send(
              ELECTRON_COMMANDS.METADATA_ERROR,
              error,
            );
          }
        }
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.DOUBLE_UPSCAYL_DONE,
          outFile,
        );
        showNotification("Upscayled", "Image upscayled successfully!");
      }
    };

    // FIRST PASS FUNCTIONS
    const onError = (data: string | Buffer) => {
      if (!mainWindow || retrying) return;
      const text = data.toString();
      mainWindow.setProgressBar(-1);
      // SEND UPSCAYL PROGRESS TO RENDERER
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
        text,
      );
      if (retryWithSmallerTile(text)) return;
      // SET FAILED TO TRUE
      failed = true;
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        isVulkanMemoryError(text)
          ? VULKAN_MEMORY_ERROR_MESSAGE
          : "Error upscaling image. Error: " + text,
      );
      showNotification("Upscayl Failure", "Failed to upscale image!");
      upscayl.kill();
      return;
    };

    const onData = (data: string | Buffer) => {
      if (!mainWindow || retrying) return;
      // CONVERT DATA TO STRING
      const text = data.toString();
      updateProgressBar(1, text);
      // SEND UPSCAYL PROGRESS TO RENDERER
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
        text,
      );
      // IF PROGRESS HAS ERROR, UPSCAYL FAILED
      if (retryWithSmallerTile(text)) return;
      if (text.includes("Error") || text.includes("failed")) {
        upscayl.kill();
        failed = true;
        onError(text);
      } else if (text.includes("Resizing")) {
        mainWindow.webContents.send(ELECTRON_COMMANDS.SCALING_AND_CONVERTING);
      }
    };

    const onClose = () => {
      // A retried flow is handled by the new process, not this one.
      if (retrying) return;
      // IF NOT FAILED
      if (!failed && !stopped) {
        mainWindow.setProgressBar(0.5);
        mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_PASS_INFO, {
          pass: 2,
          totalPasses,
        });
        // Reset the percentage text so the second pass does not appear to start
        // at 100% while the first pass result is being re-upscaled.
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
          "0.00%",
        );
        // SPAWN A SECOND PASS
        const secondPass = spawnUpscayl(
          getDoubleUpscaleSecondPassArguments({
            outFile,
            modelsPath: isDefaultModel
              ? modelsPath
              : (savedCustomModelsPath ?? modelsPath),
            model,
            gpuId,
            saveImageAs,
            scale,
            customWidth,
            compression,
            tileSize: currentTileSize,
            ttaMode,
            threads,
          }),
          logit,
        );
        upscayl2 = secondPass;
        logit("🚀 Upscaling Second Pass");
        childProcesses.push(secondPass);
        secondPass.process.stderr.on("data", onData2);
        secondPass.process.on("error", onError2);
        secondPass.process.on("close", onClose2);
      }
    };

    upscayl.process.stderr.on("data", onData);
    upscayl.process.on("error", onError);
    upscayl.process.on("close", onClose);
  };

  startFlow(tileSize);
};

export default doubleUpscayl;
