import fs from "fs";
import { parse } from "path";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import decodePath from "../../common/decode-path";
import getDirectoryFromPath from "../../common/get-directory-from-path";
import getFilenameFromPath from "../../common/get-file-name";
import { MODELS } from "../../common/models-list";
import {
  buildMultiModelOutputPath,
  calculateMultiModelProgress,
  normalizeModelSelection,
} from "../../common/multi-model-helpers";
import {
  MultiModelDonePayload,
  MultiModelProgressInfo,
  MultiModelResult,
  MultiModelUpscaylPayload,
} from "../../common/types/types";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";
import { getMainWindow } from "../main-window";
import {
  TrackedChildProcess,
  childProcesses,
  removeChildProcess,
  savedCustomModelsPath,
  setStopped,
  stopped,
} from "../utils/config-variables";
import { copyMetadata } from "../utils/copy-metadata";
import {
  getDoubleUpscaleArguments,
  getDoubleUpscaleSecondPassArguments,
  getSingleImageArguments,
} from "../utils/get-arguments";
import { getPlatform } from "../utils/get-device-specs";
import { modelsPath } from "../utils/get-resource-paths";
import logit from "../utils/logit";
import showNotification from "../utils/show-notification";
import slash from "../utils/slash";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { runFaceRestore } from "./face-restore";

const MAX_MEMORY_RETRIES = 6;
const STDERR_TAIL_LIMIT = 800;

const extractLastLine = (stderrTail: string): string => {
  const lines = stderrTail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-2).join(" | ");
};

const multiModelUpscayl = async (_event, payload: MultiModelUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    logit("No main window found");
    return;
  }

  const sendError = (message: string) => {
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_ERROR, message);
    mainWindow.setProgressBar(-1);
  };

  const models = normalizeModelSelection(payload.models ?? []);
  if (models.length === 0) {
    sendError("Please select at least one model to compare.");
    return;
  }

  const imagePath = decodePath(payload.imagePath);
  try {
    if (!fs.statSync(imagePath).isFile()) {
      throw new Error("not a file");
    }
  } catch {
    sendError(`The selected image path is not a valid file: ${imagePath}`);
    return;
  }

  const outputDir = decodePath(payload.outputPath);
  try {
    if (
      !payload.outputPath ||
      payload.outputPath.trim().length === 0 ||
      !fs.statSync(outputDir).isDirectory()
    ) {
      throw new Error("not a directory");
    }
  } catch {
    sendError(`The output path is not a valid folder: ${outputDir}`);
    return;
  }

  const inputDir = getDirectoryFromPath(imagePath);
  const fileNameWithExt = getFilenameFromPath(imagePath);
  const fileName = parse(fileNameWithExt).name;

  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const gpuId = payload.gpuId;
  const saveImageAs = payload.saveImageAs;
  const compression = payload.compression;
  const overwrite = payload.overwrite;
  const tileSize = payload.tileSize;
  const ttaMode = payload.ttaMode;
  const doubleUpscale = payload.doubleUpscale === true;
  const totalPasses = doubleUpscale ? 2 : 1;
  const threads = payload.threads?.trim() || undefined;

  setStopped(false);

  const results: MultiModelResult[] = [];

  const emitProgress = (
    modelIndex: number,
    modelId: string,
    pass: number,
    passPercent: number,
    completedModels: number,
  ) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const overallFraction = calculateMultiModelProgress({
      modelIndex,
      totalModels: models.length,
      pass,
      totalPasses,
      passPercent,
    });
    const modelPercent = Math.round(
      ((pass - 1 + Math.min(Math.max(passPercent, 0), 100) / 100) /
        totalPasses) *
        100,
    );
    const info: MultiModelProgressInfo = {
      modelIndex,
      totalModels: models.length,
      modelId,
      pass,
      totalPasses,
      modelPercent,
      overallPercent: Math.round(overallFraction * 100),
      completedModels,
    };

    mainWindow.webContents.send(
      ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_PROGRESS,
      info,
    );
    mainWindow.setProgressBar(overallFraction);
  };

  const runProcess = (
    args: string[],
    modelIndex: number,
    modelId: string,
    pass: number,
    completedModels: number,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      if (stopped) {
        reject(new Error("__STOPPED__"));
        return;
      }

      const upscayl = spawnUpscayl(args, logit);
      const tracked: TrackedChildProcess = upscayl;
      childProcesses.push(tracked);

      let stderrTail = "";
      let settled = false;

      upscayl.process.stderr.on("data", (data: Buffer) => {
        if (settled) return;
        const text = data.toString();
        stderrTail = (stderrTail + text).slice(-STDERR_TAIL_LIMIT);
        logit(`[${modelId}]`, text);

        const match = text.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = parseFloat(match[1]);
          if (Number.isFinite(pct)) {
            emitProgress(modelIndex, modelId, pass, pct, completedModels);
          }
        }

        if (isVulkanMemoryError(stderrTail)) {
          settled = true;
          removeChildProcess(tracked);
          upscayl.kill();
          reject(new Error("__VULKAN_OOM__"));
          return;
        }

        if (text.includes("Error") || text.includes("failed")) {
          settled = true;
          removeChildProcess(tracked);
          upscayl.kill();
          reject(new Error(extractLastLine(stderrTail) || text.trim()));
        }
      });

      upscayl.process.on("error", (err) => {
        if (settled) return;
        settled = true;
        removeChildProcess(tracked);
        if (isVulkanMemoryError(String(err))) {
          reject(new Error("__VULKAN_OOM__"));
        } else {
          reject(err);
        }
      });

      upscayl.process.on("close", (code) => {
        removeChildProcess(tracked);
        if (settled) return;
        settled = true;
        if (stopped) {
          reject(new Error("__STOPPED__"));
          return;
        }
        if (code !== 0) {
          if (isVulkanMemoryError(stderrTail)) {
            reject(new Error("__VULKAN_OOM__"));
          } else {
            const detail = extractLastLine(stderrTail);
            reject(
              new Error(
                `Model "${modelId}" failed (exit ${code}).${detail ? ` ${detail}` : ""}`,
              ),
            );
          }
          return;
        }
        resolve();
      });
    });

  const runModelWithRetry = async (
    modelIndex: number,
    modelId: string,
    outFile: string,
    completedModels: number,
  ): Promise<void> => {
    const isDefaultModel = modelId in MODELS;
    const resolvedModelsPath = isDefaultModel
      ? modelsPath
      : (savedCustomModelsPath ?? modelsPath);

    let currentTileSize = tileSize;
    let retries = 0;

    while (true) {
      if (stopped) {
        throw new Error("__STOPPED__");
      }

      try {
        emitProgress(modelIndex, modelId, 1, 0, completedModels);

        if (doubleUpscale) {
          await runProcess(
            getDoubleUpscaleArguments({
              inputDir,
              fullfileName: fileNameWithExt,
              outFile,
              modelsPath: resolvedModelsPath,
              model: modelId,
              scale,
              gpuId,
              saveImageAs,
              customWidth,
              tileSize: currentTileSize,
              threads,
            }),
            modelIndex,
            modelId,
            1,
            completedModels,
          );

          if (stopped) throw new Error("__STOPPED__");

          emitProgress(modelIndex, modelId, 2, 0, completedModels);
          await runProcess(
            getDoubleUpscaleSecondPassArguments({
              outFile,
              modelsPath: resolvedModelsPath,
              model: modelId,
              gpuId,
              saveImageAs,
              scale,
              customWidth,
              compression,
              tileSize: currentTileSize,
              ttaMode,
              threads,
            }),
            modelIndex,
            modelId,
            2,
            completedModels,
          );
        } else {
          await runProcess(
            getSingleImageArguments({
              inputDir,
              fileNameWithExt,
              outFile,
              modelsPath: resolvedModelsPath,
              model: modelId,
              scale,
              gpuId,
              saveImageAs,
              customWidth,
              compression,
              tileSize: currentTileSize,
              ttaMode,
              threads,
            }),
            modelIndex,
            modelId,
            1,
            completedModels,
          );
        }

        return;
      } catch (err: any) {
        if (err?.message === "__STOPPED__" || stopped) {
          throw new Error("__STOPPED__");
        }

        if (err?.message === "__VULKAN_OOM__") {
          const fallbackTileSize = getFallbackTileSize(currentTileSize);
          if (fallbackTileSize !== null && retries < MAX_MEMORY_RETRIES) {
            retries += 1;
            currentTileSize = fallbackTileSize;
            logit(
              `⚠️ Vulkan memory allocation failed for ${modelId}. Retrying with tile size ${fallbackTileSize}px...`,
            );
            mainWindow.webContents.send(
              ELECTRON_COMMANDS.UPSCAYL_WARNING,
              `The GPU ran out of memory on "${modelId}". Retrying with a smaller tile size (${fallbackTileSize}px)...`,
            );
            await new Promise((r) => setTimeout(r, 750));
            continue;
          }
          throw new Error(VULKAN_MEMORY_ERROR_MESSAGE);
        }

        throw err;
      }
    }
  };

  logit(
    `🚀 Starting Multi-Model Compare (${models.length} models): `,
    models.join(", "),
  );

  for (let i = 0; i < models.length; i += 1) {
    if (stopped) break;

    const modelId = models[i];
    const outFile = buildMultiModelOutputPath({
      outputDir,
      separator: slash,
      fileName,
      model: modelId,
      scale,
      useCustomWidth,
      customWidth,
      saveImageAs,
      doubleUpscale,
    });

    if (outFile.length >= 255 && getPlatform() === "win") {
      const result: MultiModelResult = {
        modelId,
        outputPath: "",
        durationMs: 0,
        status: "error",
        error:
          "Output path exceeds the Windows 255-character limit. Shorten the filename or choose a shorter output folder.",
      };
      results.push(result);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_RESULT,
        result,
      );
      continue;
    }

    if (fs.existsSync(outFile) && !overwrite) {
      logit(`✅ Reusing existing output for ${modelId}: `, outFile);
      emitProgress(i, modelId, totalPasses, 100, i + 1);
      const result: MultiModelResult = {
        modelId,
        outputPath: outFile,
        durationMs: 0,
        status: "done",
        cached: true,
      };
      results.push(result);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_RESULT,
        result,
      );
      continue;
    }

    const modelStart = Date.now();
    try {
      await runModelWithRetry(i, modelId, outFile, i);

      if (payload.faceRestore && fs.existsSync(outFile)) {
        const fr = await runFaceRestore(outFile, payload.faceRestoreStrength);
        if (!fr.applied && fr.warning) {
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.UPSCAYL_WARNING,
            fr.warning,
          );
        }
      }

      if (payload.copyMetadata && fs.existsSync(outFile)) {
        try {
          await copyMetadata(imagePath, outFile);
        } catch (metaError) {
          logit(`❌ Error copying metadata for ${modelId}: `, metaError);
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.METADATA_ERROR,
            String(metaError),
          );
        }
      }

      emitProgress(i, modelId, totalPasses, 100, i + 1);

      const result: MultiModelResult = {
        modelId,
        outputPath: outFile,
        durationMs: Date.now() - modelStart,
        status: "done",
      };
      results.push(result);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_RESULT,
        result,
      );
      logit(
        `✅ Finished model ${i + 1}/${models.length} (${modelId}) in ${result.durationMs}ms`,
      );
    } catch (err: any) {
      if (stopped || err?.message === "__STOPPED__") {
        logit(`🛑 Stopped during model ${modelId}`);
        break;
      }

      const errorMessage =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      logit(`❌ Model ${modelId} failed: `, errorMessage);

      const result: MultiModelResult = {
        modelId,
        outputPath: "",
        durationMs: Date.now() - modelStart,
        status: "error",
        error: errorMessage,
      };
      results.push(result);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_RESULT,
        result,
      );
    }
  }

  mainWindow.setProgressBar(-1);

  const succeededCount = results.filter((r) => r.status === "done").length;
  const donePayload: MultiModelDonePayload = {
    results,
    stopped,
  };

  mainWindow.webContents.send(
    ELECTRON_COMMANDS.MULTI_MODEL_UPSCAYL_DONE,
    donePayload,
  );

  if (!stopped) {
    if (succeededCount > 0) {
      showNotification(
        "Upscayl-Next",
        `Compared ${succeededCount}/${models.length} models successfully!`,
      );
    } else if (results.length > 0) {
      sendError(
        results[0].error ??
          "All selected models failed during multi-model comparison.",
      );
    }
  }
};

export default multiModelUpscayl;
