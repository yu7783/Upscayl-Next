import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import decodePath from "../../common/decode-path";
import { MODELS } from "../../common/models-list";
import {
  calculateMultiModelProgress,
  normalizeModelSelection,
} from "../../common/multi-model-helpers";
import { clampRoiRect } from "../../common/roi-helpers";
import {
  MultiModelProgressInfo,
  MultiModelResult,
  RoiUpscaylDonePayload,
  RoiUpscaylPayload,
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
  registerTempDir,
  removeChildProcess,
  savedCustomModelsPath,
  setStopped,
  stopped,
} from "../utils/config-variables";
import {
  getDoubleUpscaleArguments,
  getDoubleUpscaleSecondPassArguments,
  getSingleImageArguments,
} from "../utils/get-arguments";
import { modelsPath } from "../utils/get-resource-paths";
import logit from "../utils/logit";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { runFaceRestore } from "./face-restore";

const MAX_MEMORY_RETRIES = 6;

const roiUpscayl = async (_event: unknown, payload: RoiUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  const sendError = (msg: string) => {
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_ERROR, msg);
    mainWindow.setProgressBar(-1);
  };

  const models = normalizeModelSelection(payload.models ?? []);
  if (models.length === 0) {
    sendError("Please select at least one model for ROI preview.");
    return;
  }

  const imagePath = decodePath(payload.imagePath);
  if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
    sendError(`The selected image path is not a valid file: ${imagePath}`);
    return;
  }

  let clamped: ReturnType<typeof clampRoiRect> = null;
  let tempDir = "";
  let cropInputPath = "";

  try {
    const meta = await sharp(imagePath).metadata();
    clamped = clampRoiRect(payload.roi, meta.width ?? 0, meta.height ?? 0);
    if (!clamped) {
      sendError(
        "Selected ROI region is too small (minimum 16×16 px). Draw a larger area.",
      );
      return;
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-roi-"));
    registerTempDir(tempDir);
    cropInputPath = path.join(tempDir, "roi_crop.png");

    await sharp(imagePath)
      .extract({
        left: clamped.x,
        top: clamped.y,
        width: clamped.width,
        height: clamped.height,
      })
      .png()
      .toFile(cropInputPath);
  } catch (err: any) {
    sendError(`Failed to crop ROI region: ${err?.message ?? err}`);
    return;
  }

  setStopped(false);

  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const gpuId = payload.gpuId;
  const saveImageAs = payload.saveImageAs;
  const compression = payload.compression;
  const tileSize = payload.tileSize;
  const ttaMode = payload.ttaMode;
  const doubleUpscale = payload.doubleUpscale === true;
  const totalPasses = doubleUpscale ? 2 : 1;
  const threads = payload.threads?.trim() || undefined;

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
    const info: MultiModelProgressInfo = {
      modelIndex,
      totalModels: models.length,
      modelId,
      pass,
      totalPasses,
      modelPercent: Math.round(
        ((pass - 1 + Math.min(Math.max(passPercent, 0), 100) / 100) /
          totalPasses) *
          100,
      ),
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
        stderrTail = (stderrTail + text).slice(-800);
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
        }
      });

      upscayl.process.on("error", (err) => {
        if (settled) return;
        settled = true;
        removeChildProcess(tracked);
        reject(err);
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
            reject(new Error(stderrTail.trim() || `Exit code ${code}`));
          }
          return;
        }
        resolve();
      });
    });

  for (let i = 0; i < models.length; i += 1) {
    if (stopped) break;
    const modelId = models[i];
    const isDefaultModel = modelId in MODELS;
    const resolvedModelsPath = isDefaultModel
      ? modelsPath
      : (savedCustomModelsPath ?? modelsPath);
    const outFile = path.join(tempDir, `roi_${i}_${modelId}.${saveImageAs}`);

    let currentTileSize = tileSize;
    let retries = 0;
    const startMs = Date.now();

    try {
      while (true) {
        try {
          emitProgress(i, modelId, 1, 0, i);
          if (doubleUpscale) {
            await runProcess(
              getDoubleUpscaleArguments({
                inputDir: tempDir,
                fullfileName: "roi_crop.png",
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
              i,
              modelId,
              1,
              i,
            );
            emitProgress(i, modelId, 2, 0, i);
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
              i,
              modelId,
              2,
              i,
            );
          } else {
            await runProcess(
              getSingleImageArguments({
                inputDir: tempDir,
                fileNameWithExt: "roi_crop.png",
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
              i,
              modelId,
              1,
              i,
            );
          }
          break;
        } catch (err: any) {
          if (err?.message === "__VULKAN_OOM__") {
            const fallback = getFallbackTileSize(currentTileSize);
            if (fallback !== null && retries < MAX_MEMORY_RETRIES) {
              retries += 1;
              currentTileSize = fallback;
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            throw new Error(VULKAN_MEMORY_ERROR_MESSAGE);
          }
          throw err;
        }
      }

      if (payload.faceRestore && fs.existsSync(outFile)) {
        const fr = await runFaceRestore(outFile, payload.faceRestoreStrength);
        if (!fr.applied && fr.warning) {
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.UPSCAYL_WARNING,
            fr.warning,
          );
        }
      }

      emitProgress(i, modelId, totalPasses, 100, i + 1);
      results.push({
        modelId,
        outputPath: outFile,
        durationMs: Date.now() - startMs,
        status: "done",
      });
    } catch (err: any) {
      if (stopped || err?.message === "__STOPPED__") break;
      results.push({
        modelId,
        outputPath: "",
        durationMs: Date.now() - startMs,
        status: "error",
        error: err?.message ?? String(err),
      });
    }
  }

  mainWindow.setProgressBar(-1);
  const donePayload: RoiUpscaylDonePayload = {
    cropInputPath,
    roi: clamped,
    results,
    stopped,
  };
  mainWindow.webContents.send(ELECTRON_COMMANDS.ROI_UPSCAYL_DONE, donePayload);
};

export default roiUpscayl;
