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
import slash from "../utils/slash";
import { modelsPath } from "../utils/get-resource-paths";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import { BatchUpscaylPayload } from "../../common/types/types";
import showNotification from "../utils/show-notification";
import { MODELS } from "../../common/models-list";
import { copyMetadata } from "../utils/copy-metadata";
import { imageFormats } from "../../common/image-formats";
import decodePath from "../../common/decode-path";
import getThreadCount from "../../common/thread-count";
import countOccurrences from "../../common/count-occurrences";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";

const countImages = (dir: string): number => {
  try {
    // withFileTypes returns Dirent objects straight from the directory read.
    // Using dirent.isFile() avoids one statSync syscall per entry, which is a
    // measurable win on Windows and network drives with large folders.
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => {
      if (!entry.isFile()) return false;
      // Avoid split(".") here: it allocates an array per entry. A single
      // lastIndexOf gives the same extension for the "a.b.c" case.
      const dot = entry.name.lastIndexOf(".");
      if (dot < 0 || dot === entry.name.length - 1) return false;
      const extension = entry.name.slice(dot + 1).toLowerCase();
      return (imageFormats as readonly string[]).includes(extension);
    }).length;
  } catch {
    return 0;
  }
};

const batchUpscayl = async (event, payload: BatchUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  // decodePath("") normalises to ".", which would silently write into the
  // process working directory. Fail loudly instead so the user picks a folder.
  if (!payload.outputPath || payload.outputPath.trim().length === 0) {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      "Please choose an output folder before starting a batch upscale.",
    );
    return;
  }

  const tileSize = payload.tileSize;
  const compression = payload.compression;
  const ttaMode = payload.ttaMode;
  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const model = payload.model;
  const gpuId = payload.gpuId;
  const saveImageAs = payload.saveImageAs;
  // GET THE IMAGE DIRECTORY
  const originalInputDir = decodePath(payload.batchFolderPath);
  // GET THE OUTPUT DIRECTORY
  const outputBasePath = decodePath(payload.outputPath);
  const outputFolderName = `upscayl_${saveImageAs}_${model}_${
    useCustomWidth ? `${customWidth}px` : `${scale}x`
  }`;
  const outputFolderPath = outputBasePath + slash + outputFolderName;
  const doubleUpscale = payload.doubleUpscale === true;
  const totalPasses = doubleUpscale ? 2 : 1;

  // VALIDATE THE INPUT DIRECTORY BEFORE SPAWNING THE BINARY.
  // Without this, a stale/incorrect payload reaches upscayl-bin and produces
  // the cryptic "Input path and Output path both must be either a file or a
  // directory!" error from issue #1405.
  try {
    if (!fs.statSync(originalInputDir).isDirectory()) {
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        `The input path is not a folder: ${originalInputDir}`,
      );
      return;
    }
  } catch (error) {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      `The input folder does not exist or cannot be read: ${originalInputDir}`,
    );
    return;
  }

  // VALIDATE THE OUTPUT DIRECTORY AS WELL. An empty/removed output path used to
  // fall through to "." and write into the process working directory.
  try {
    if (!fs.statSync(outputBasePath).isDirectory()) {
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        `The output path is not a folder: ${outputBasePath}`,
      );
      return;
    }
  } catch (error) {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      `The output folder does not exist or cannot be read: ${outputBasePath}`,
    );
    return;
  }

  const totalImages = countImages(originalInputDir);

  // upscayl-bin accepts "load:proc:save" thread counts (-j). An explicit value
  // from the settings always wins; otherwise scale the split with the real CPU
  // core count so weak machines are not oversubscribed and large ones are not
  // left idle.
  const threads =
    payload.threads?.trim() ||
    getThreadCount({
      totalImages,
      cpuCount: os.cpus().length,
    });

  // CREATE THE OUTPUT DIRECTORY.
  // mkdirSync with recursive:true is already a no-op when the folder exists,
  // so the extra existsSync stat call is redundant.
  fs.mkdirSync(outputFolderPath, { recursive: true });

  // TEMPORARY FOLDER FOR THE FIRST PASS OF A DOUBLE UPSCALE.
  // Prefer a hidden folder next to the output so both passes read and write on
  // the same volume. Copying every intermediate image to the system temp drive
  // and back doubles the disk I/O and slows large batches down.
  let intermediateDir = "";
  if (doubleUpscale) {
    try {
      const tempBase = path.join(outputBasePath, ".upscayl-tmp");
      fs.mkdirSync(tempBase, { recursive: true });
      intermediateDir = fs.mkdtempSync(path.join(tempBase, "batch-double-"));
      logit("🗂 Using temporary folder for double pass: ", intermediateDir);
    } catch (error) {
      // Fall back to the system temp folder if the output volume is read-only.
      intermediateDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "upscayl-batch-double-"),
      );
      logit(
        "🗂 Output volume is not writable, using system temporary folder: ",
        intermediateDir,
      );
    }
  }

  const isDefaultModel = model in MODELS;

  setStopped(false);
  let failed = false;
  let encounteredError = false;
  let pass = 0;
  let memoryRetries = 0;
  const MAX_MEMORY_RETRIES = 6;

  const cleanupIntermediate = () => {
    if (!intermediateDir) return;
    try {
      fs.rmSync(intermediateDir, { recursive: true, force: true });
      logit("🧹 Removed temporary folder");
    } catch (error) {
      logit("⚠️ Could not remove temporary folder: ", error);
    }
  };

  const sendProgress = (completed: number) => {
    if (!mainWindow) return;
    const safeCompleted =
      totalImages > 0 ? Math.min(completed, totalImages) : completed;
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS_INFO,
      {
        pass,
        totalPasses,
        completed: safeCompleted,
        total: totalImages,
      },
    );
    if (totalImages > 0) {
      const overall = (pass - 1 + safeCompleted / totalImages) / totalPasses;
      mainWindow.setProgressBar(Math.max(0, Math.min(1, overall)));
    }
    // A new pass starts at 0 completed. Clear the previous pass' percentage so
    // the text under the bar does not keep showing "100.00%" during pass 2.
    if (completed === 0) {
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS,
        "0.00%",
      );
    }
  };

  const copyBatchMetadata = async () => {
    if (!payload.copyMetadata || !mainWindow) return;
    logit("🏷️ Copying metadata...");
    try {
      // withFileTypes avoids one statSync per entry. Copy in small chunks so a
      // folder with thousands of images still finishes quickly without opening
      // thousands of handles at once.
      const files = fs
        .readdirSync(outputFolderPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);

      const CONCURRENCY = 8;
      for (let i = 0; i < files.length; i += CONCURRENCY) {
        const chunk = files.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (file) => {
            const outFile = outputFolderPath + slash + file;
            const originalFile = originalInputDir + slash + file;
            if (!fs.existsSync(originalFile)) return;
            try {
              await copyMetadata(originalFile, outFile);
              logit("✅ Metadata copied to: ", outFile);
            } catch (error) {
              logit("❌ Error copying metadata: ", error);
              mainWindow.webContents.send(
                ELECTRON_COMMANDS.METADATA_ERROR,
                error,
              );
            }
          }),
        );
      }
    } catch (err) {
      logit("❌ Error in batch metadata copy: ", err);
    }
  };

  const runPass = (currentTileSize: number = tileSize, isRetry = false) => {
    if (!mainWindow || stopped) return;
    if (!isRetry) pass += 1;

    const passInputDir = pass === 1 ? originalInputDir : intermediateDir;
    const passOutputDir =
      pass === totalPasses ? outputFolderPath : intermediateDir;

    logit(
      `🚀 Starting batch pass ${pass}/${totalPasses}` +
        (isRetry ? ` (tile size ${currentTileSize}px)` : ""),
    );
    sendProgress(0);

    const upscayl = spawnUpscayl(
      getBatchArguments({
        inputDir: passInputDir,
        outputDir: passOutputDir,
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

    childProcesses.push(upscayl);

    let completed = 0;
    let passFailed = false;
    let retrying = false;

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
        `⚠️ Vulkan memory allocation failed during batch pass ${pass}. Retrying with tile size ${fallbackTileSize}px...`,
      );
      mainWindow?.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_WARNING,
        `The GPU ran out of memory (vk Allocated memory failed). Retrying batch pass ${pass}/${totalPasses} with a smaller tile size (${fallbackTileSize}px)...`,
      );
      // Give the driver a moment to release the failed allocation. Re-run the
      // same pass so already finished images in earlier passes are kept.
      setTimeout(() => {
        if (stopped) {
          cleanupIntermediate();
          return;
        }
        runPass(fallbackTileSize, true);
      }, 750);
      return true;
    };

    const onError = (data: any) => {
      if (!mainWindow || retrying) return;
      const text = data.toString();
      mainWindow.setProgressBar(-1);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS,
        text,
      );
      if (retryWithSmallerTile(text)) return;
      failed = true;
      passFailed = true;
      upscayl.kill();
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        isVulkanMemoryError(text)
          ? VULKAN_MEMORY_ERROR_MESSAGE
          : `Error upscaling images! ${text}`,
      );
    };

    const onData = (data: any) => {
      if (!mainWindow || retrying) return;
      const text = data.toString();
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS,
        text,
      );
      const successCount = countOccurrences(text, "Successful");
      if (successCount > 0) {
        completed += successCount;
        sendProgress(completed);
      }
      if (retryWithSmallerTile(text)) return;
      if (text.includes("Error") || text.includes("failed")) {
        logit("❌ ", text);
        encounteredError = true;
        onError(text);
      } else if (text.includes("Resizing")) {
        mainWindow.webContents.send(ELECTRON_COMMANDS.SCALING_AND_CONVERTING);
      }
    };

    const onClose = async () => {
      if (!mainWindow) return;
      // A retried pass is handled by the new process, not this one.
      if (retrying) return;
      if (passFailed || failed || stopped || upscayl.process.killed) {
        cleanupIntermediate();
        return;
      }

      logit(`💯 Batch pass ${pass}/${totalPasses} done`);

      if (pass < totalPasses) {
        // Continue with the tile size that actually worked for this pass.
        runPass(currentTileSize);
        return;
      }

      await copyBatchMetadata();
      cleanupIntermediate();
      mainWindow.setProgressBar(-1);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.FOLDER_UPSCAYL_DONE,
        outputFolderPath,
      );
      if (!encounteredError) {
        showNotification("Upscayled", "Images upscayled successfully!");
      } else {
        showNotification(
          "Upscayled",
          "Images were upscayled but encountered some errors!",
        );
      }
    };

    upscayl.process.stderr.on("data", onData);
    upscayl.process.on("error", onError);
    upscayl.process.on("close", onClose);
  };

  runPass(tileSize);
};

export default batchUpscayl;
