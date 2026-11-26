import fs from "fs";
import os from "os";
import path, { parse } from "path";
import decodePath from "../../common/decode-path";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import getDirectoryFromPath from "../../common/get-directory-from-path";
import getFilenameFromPath from "../../common/get-file-name";
import {
  clearFinishedJobs,
  createQueueJob,
  enqueueJob,
  moveQueueJob,
  pickNextPendingJob,
  QueueJob,
  QueueJobPayload,
  QueueJobType,
  QueueSnapshot,
  removeQueueJob,
  updateQueueJob,
} from "../../common/job-queue-helpers";
import { MODELS } from "../../common/models-list";
import {
  buildMultiModelOutputPath,
  normalizeModelSelection,
} from "../../common/multi-model-helpers";
import getThreadCount from "../../common/thread-count";
import {
  BatchUpscaylPayload,
  DoubleUpscaylPayload,
  ImageUpscaylPayload,
  MultiModelUpscaylPayload,
  VideoUpscaylPayload,
} from "../../common/types/types";
import {
  getFallbackTileSize,
  isVulkanMemoryError,
  VULKAN_MEMORY_ERROR_MESSAGE,
} from "../../common/vulkan-memory";
import { getMainWindow } from "../main-window";
import {
  childProcesses,
  removeChildProcess,
  savedCustomModelsPath,
  setStopped,
  stopped,
} from "../utils/config-variables";
import { copyMetadata } from "../utils/copy-metadata";
import {
  getBatchArguments,
  getDoubleUpscaleArguments,
  getDoubleUpscaleSecondPassArguments,
  getSingleImageArguments,
} from "../utils/get-arguments";
import { modelsPath } from "../utils/get-resource-paths";
import logit from "../utils/logit";
import showNotification from "../utils/show-notification";
import slash from "../utils/slash";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { runFaceRestore } from "./face-restore";
import { runVideoUpscaylJob } from "./video-upscayl";

let queueJobs: QueueJob[] = [];
let queueRunning = false;
let queuePaused = false;

const getSnapshot = (): QueueSnapshot => ({
  jobs: queueJobs,
  isRunning: queueRunning,
  isPaused: queuePaused,
});

const broadcastQueue = () => {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(ELECTRON_COMMANDS.QUEUE_UPDATE, getSnapshot());
};

const runBinaryPromise = (
  args: string[],
  onPercent: (pct: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (stopped) {
      reject(new Error("__STOPPED__"));
      return;
    }
    const tracked = spawnUpscayl(args, logit);
    childProcesses.push(tracked);
    let stderrTail = "";
    let settled = false;

    tracked.process.stderr.on("data", (buf: Buffer) => {
      if (settled) return;
      const text = buf.toString();
      stderrTail = (stderrTail + text).slice(-800);
      const match = text.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        const pct = parseFloat(match[1]);
        if (Number.isFinite(pct)) onPercent(pct);
      }
      if (isVulkanMemoryError(stderrTail)) {
        settled = true;
        removeChildProcess(tracked);
        tracked.kill();
        reject(new Error("__VULKAN_OOM__"));
      }
    });

    tracked.process.on("error", (err) => {
      if (settled) return;
      settled = true;
      removeChildProcess(tracked);
      reject(err);
    });

    tracked.process.on("close", (code) => {
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

async function runWithTileRetry(
  initialTileSize: number,
  runner: (tileSize: number) => Promise<void>,
): Promise<void> {
  let tile = initialTileSize;
  let retries = 0;
  while (true) {
    try {
      await runner(tile);
      return;
    } catch (err: any) {
      if (err?.message === "__VULKAN_OOM__") {
        const next = getFallbackTileSize(tile);
        if (next !== null && retries < 6) {
          retries += 1;
          tile = next;
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        throw new Error(VULKAN_MEMORY_ERROR_MESSAGE);
      }
      throw err;
    }
  }
}

async function executeJob(job: QueueJob): Promise<string> {
  const updateProgress = (percent: number) => {
    queueJobs = updateQueueJob(queueJobs, job.id, {
      progress: Math.max(0, Math.min(100, Math.round(percent))),
    });
    broadcastQueue();
  };

  if (job.type === "video") {
    const payload = job.payload as VideoUpscaylPayload;
    const doneInfo = await runVideoUpscaylJob(payload, {
      onProgress: (info) => updateProgress(info.percent),
    });
    if (!doneInfo) {
      throw new Error(stopped ? "__STOPPED__" : "Video upscale did not produce output.");
    }
    return doneInfo.outputPath;
  }

  if (job.type === "image" || job.type === "double") {
    const payload = job.payload as ImageUpscaylPayload | DoubleUpscaylPayload;
    const imagePath = decodePath(payload.imagePath);
    const inputDir = getDirectoryFromPath(imagePath);
    const outputDir = decodePath(payload.outputPath);
    const fileNameWithExt = getFilenameFromPath(imagePath);
    const fileName = parse(fileNameWithExt).name;
    const useCustomWidth = payload.useCustomWidth;
    const customWidth = useCustomWidth ? payload.customWidth : "";
    const outFile = `${outputDir}${slash}${fileName}_upscayl_${
      useCustomWidth ? `${customWidth}px_` : `${payload.scale}x_`
    }${payload.model}.${payload.saveImageAs}`;
    const resolvedModels =
      payload.model in MODELS
        ? modelsPath
        : (savedCustomModelsPath ?? modelsPath);

    await runWithTileRetry(payload.tileSize, async (tileSize) => {
      if (job.type === "double") {
        await runBinaryPromise(
          getDoubleUpscaleArguments({
            inputDir,
            fullfileName: fileNameWithExt,
            outFile,
            modelsPath: resolvedModels,
            model: payload.model,
            scale: payload.scale,
            customWidth,
            gpuId: payload.gpuId,
            saveImageAs: payload.saveImageAs,
            tileSize,
            threads: payload.threads?.trim() || "2:2:2",
          }),
          (pct) => updateProgress(pct * 0.5),
        );
        await runBinaryPromise(
          getDoubleUpscaleSecondPassArguments({
            outFile,
            modelsPath: resolvedModels,
            model: payload.model,
            gpuId: payload.gpuId,
            saveImageAs: payload.saveImageAs,
            scale: payload.scale,
            customWidth,
            compression: payload.compression,
            tileSize,
            ttaMode: payload.ttaMode,
            threads: payload.threads?.trim() || "2:2:2",
          }),
          (pct) => updateProgress(50 + pct * 0.5),
        );
      } else {
        await runBinaryPromise(
          getSingleImageArguments({
            inputDir,
            fileNameWithExt,
            outFile,
            modelsPath: resolvedModels,
            model: payload.model,
            scale: payload.scale,
            gpuId: payload.gpuId,
            saveImageAs: payload.saveImageAs,
            customWidth,
            compression: payload.compression,
            tileSize,
            ttaMode: payload.ttaMode,
            threads: payload.threads?.trim() || undefined,
          }),
          updateProgress,
        );
      }
    });

    if (payload.faceRestore && fs.existsSync(outFile)) {
      await runFaceRestore(outFile, payload.faceRestoreStrength);
    }
    if (payload.copyMetadata && fs.existsSync(outFile)) {
      try {
        await copyMetadata(imagePath, outFile);
      } catch {}
    }
    return outFile;
  }

  if (job.type === "multi-model") {
    const payload = job.payload as MultiModelUpscaylPayload;
    const models = normalizeModelSelection(payload.models ?? []);
    const imagePath = decodePath(payload.imagePath);
    const inputDir = getDirectoryFromPath(imagePath);
    const outputDir = decodePath(payload.outputPath);
    const fileNameWithExt = getFilenameFromPath(imagePath);
    const fileName = parse(fileNameWithExt).name;
    const useCustomWidth = payload.useCustomWidth;
    const customWidth = useCustomWidth ? payload.customWidth : "";

    for (let i = 0; i < models.length; i += 1) {
      if (stopped) throw new Error("__STOPPED__");
      const modelId = models[i];
      const outFile = buildMultiModelOutputPath({
        outputDir,
        separator: slash,
        fileName,
        model: modelId,
        scale: payload.scale,
        useCustomWidth,
        customWidth,
        saveImageAs: payload.saveImageAs,
        doubleUpscale: payload.doubleUpscale === true,
      });
      const resolvedModels =
        modelId in MODELS ? modelsPath : (savedCustomModelsPath ?? modelsPath);

      await runWithTileRetry(payload.tileSize, async (tileSize) => {
        if (payload.doubleUpscale) {
          await runBinaryPromise(
            getDoubleUpscaleArguments({
              inputDir,
              fullfileName: fileNameWithExt,
              outFile,
              modelsPath: resolvedModels,
              model: modelId,
              scale: payload.scale,
              customWidth,
              gpuId: payload.gpuId,
              saveImageAs: payload.saveImageAs,
              tileSize,
              threads: payload.threads?.trim() || "2:2:2",
            }),
            (pct) =>
              updateProgress(((i + (pct / 100) * 0.5) / models.length) * 100),
          );
          await runBinaryPromise(
            getDoubleUpscaleSecondPassArguments({
              outFile,
              modelsPath: resolvedModels,
              model: modelId,
              gpuId: payload.gpuId,
              saveImageAs: payload.saveImageAs,
              scale: payload.scale,
              customWidth,
              compression: payload.compression,
              tileSize,
              ttaMode: payload.ttaMode,
              threads: payload.threads?.trim() || "2:2:2",
            }),
            (pct) =>
              updateProgress(
                ((i + 0.5 + (pct / 100) * 0.5) / models.length) * 100,
              ),
          );
        } else {
          await runBinaryPromise(
            getSingleImageArguments({
              inputDir,
              fileNameWithExt,
              outFile,
              modelsPath: resolvedModels,
              model: modelId,
              scale: payload.scale,
              gpuId: payload.gpuId,
              saveImageAs: payload.saveImageAs,
              customWidth,
              compression: payload.compression,
              tileSize,
              ttaMode: payload.ttaMode,
              threads: payload.threads?.trim() || undefined,
            }),
            (pct) => updateProgress(((i + pct / 100) / models.length) * 100),
          );
        }
      });

      if (payload.faceRestore && fs.existsSync(outFile)) {
        await runFaceRestore(outFile, payload.faceRestoreStrength);
      }
      if (payload.copyMetadata && fs.existsSync(outFile)) {
        try {
          await copyMetadata(imagePath, outFile);
        } catch {}
      }
    }
    return outputDir;
  }

  // Batch folder upscale
  const payload = job.payload as BatchUpscaylPayload;
  const inputDir = decodePath(payload.batchFolderPath);
  const outputBase = decodePath(payload.outputPath);
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const outputFolderPath = path.join(
    outputBase,
    `upscayl_${payload.saveImageAs}_${payload.model}_${
      useCustomWidth ? `${customWidth}px` : `${payload.scale}x`
    }`,
  );
  fs.mkdirSync(outputFolderPath, { recursive: true });
  const resolvedModels =
    payload.model in MODELS ? modelsPath : (savedCustomModelsPath ?? modelsPath);
  const threads =
    payload.threads?.trim() ||
    getThreadCount({ totalImages: 10, cpuCount: os.cpus().length });

  await runWithTileRetry(payload.tileSize, async (tileSize) => {
    await runBinaryPromise(
      getBatchArguments({
        inputDir,
        outputDir: outputFolderPath,
        modelsPath: resolvedModels,
        model: payload.model,
        gpuId: payload.gpuId,
        saveImageAs: payload.saveImageAs,
        scale: payload.scale,
        customWidth,
        compression: payload.compression,
        tileSize,
        ttaMode: payload.ttaMode,
        threads,
      }),
      updateProgress,
    );
  });

  if (payload.faceRestore || payload.copyMetadata) {
    try {
      const files = fs
        .readdirSync(outputFolderPath, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name);
      for (const file of files) {
        if (stopped) break;
        const outFile = path.join(outputFolderPath, file);
        if (payload.faceRestore) {
          await runFaceRestore(outFile, payload.faceRestoreStrength);
        }
        if (payload.copyMetadata) {
          const orig = path.join(inputDir, file);
          if (fs.existsSync(orig)) {
            try {
              await copyMetadata(orig, outFile);
            } catch {}
          }
        }
      }
    } catch (err) {
      logit("⚠️ Post-processing warning in queued batch job: ", err);
    }
  }

  return outputFolderPath;
}

async function processQueueLoop(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  queuePaused = false;
  setStopped(false);
  broadcastQueue();

  let completedInRun = 0;

  try {
    while (!queuePaused) {
      const next = pickNextPendingJob(queueJobs);
      if (!next) break;

      queueJobs = updateQueueJob(queueJobs, next.id, {
        status: "running",
        startedAt: Date.now(),
        progress: 0,
      });
      broadcastQueue();
      logit(`📋 Queue starting [${next.type}]: ${next.label}`);

      try {
        const outputPath = await executeJob(next);
        queueJobs = updateQueueJob(queueJobs, next.id, {
          status: "done",
          progress: 100,
          finishedAt: Date.now(),
          outputPath,
        });
        completedInRun += 1;
        logit(`✅ Queue finished: ${next.label}`);
      } catch (err: any) {
        const isStopped = stopped || err?.message === "__STOPPED__";
        queueJobs = updateQueueJob(queueJobs, next.id, {
          status: isStopped ? "cancelled" : "error",
          finishedAt: Date.now(),
          error: isStopped
            ? "Cancelled by user"
            : err?.message ?? String(err),
        });
        logit(`❌ Queue job failed (${next.label}): `, err?.message ?? err);
        if (isStopped) {
          queuePaused = true;
          break;
        }
      }

      broadcastQueue();
    }
  } finally {
    queueRunning = false;
    broadcastQueue();
    if (completedInRun > 0 && !queuePaused) {
      showNotification(
        "Upscayl-Next Queue",
        `Finished ${completedInRun} queued job(s)!`,
      );
    }
  }
}

export async function handleQueueGet(): Promise<QueueSnapshot> {
  return getSnapshot();
}

export async function handleQueueAdd(
  _event: unknown,
  input: {
    type: QueueJobType;
    label: string;
    detail?: string;
    payload: QueueJobPayload;
    autoStart?: boolean;
  },
): Promise<QueueSnapshot> {
  const job = createQueueJob({
    type: input.type,
    label: input.label,
    detail: input.detail,
    payload: input.payload,
  });
  queueJobs = enqueueJob(queueJobs, job);
  broadcastQueue();
  if (input.autoStart && !queueRunning && !queuePaused) {
    processQueueLoop();
  }
  return getSnapshot();
}

export async function handleQueueRemove(
  _event: unknown,
  jobId: string,
): Promise<QueueSnapshot> {
  queueJobs = removeQueueJob(queueJobs, jobId);
  broadcastQueue();
  return getSnapshot();
}

export async function handleQueueReorder(
  _event: unknown,
  payload: { jobId: string; direction: "up" | "down" },
): Promise<QueueSnapshot> {
  queueJobs = moveQueueJob(queueJobs, payload.jobId, payload.direction);
  broadcastQueue();
  return getSnapshot();
}

export async function handleQueueClear(): Promise<QueueSnapshot> {
  queueJobs = clearFinishedJobs(queueJobs);
  broadcastQueue();
  return getSnapshot();
}

export async function handleQueueStart(): Promise<QueueSnapshot> {
  queuePaused = false;
  processQueueLoop();
  return getSnapshot();
}

export async function handleQueuePause(): Promise<QueueSnapshot> {
  queuePaused = true;
  broadcastQueue();
  return getSnapshot();
}
