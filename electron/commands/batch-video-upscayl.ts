import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import {
  BatchVideoDonePayload,
  BatchVideoItemResult,
  BatchVideoProgressInfo,
  BatchVideoUpscaylPayload,
} from "../../common/types/types";
import { getMainWindow } from "../main-window";
import { setStopped, stopped } from "../utils/config-variables";
import logit from "../utils/logit";
import showNotification from "../utils/show-notification";
import { runVideoUpscaylJob } from "./video-upscayl";

const batchVideoUpscayl = async (_event, payload: BatchVideoUpscaylPayload) => {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  const videoPaths = Array.from(
    new Set(
      (payload.videoPaths ?? [])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (videoPaths.length === 0) {
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      "Please add at least one video to the batch queue.",
    );
    return;
  }

  setStopped(false);

  const results: BatchVideoItemResult[] = [];
  logit(`🎬 Starting Batch Video Upscale (${videoPaths.length} videos)`);

  for (let i = 0; i < videoPaths.length; i += 1) {
    if (stopped) break;
    const videoPath = videoPaths[i];

    const emitBatchProgress = (videoProgress: any, itemFraction: number) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const overallFraction = (i + itemFraction) / videoPaths.length;
      const info: BatchVideoProgressInfo = {
        videoIndex: i,
        totalVideos: videoPaths.length,
        currentVideoPath: videoPath,
        completedVideos: results.filter((r) => r.status === "done").length,
        videoProgress,
      };
      mainWindow.webContents.send(ELECTRON_COMMANDS.BATCH_VIDEO_PROGRESS, info);
      if (videoProgress) {
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS_INFO,
          {
            ...videoProgress,
            percent: Math.round(overallFraction * 100),
            message: `[${i + 1}/${videoPaths.length}] ${videoProgress.message}`,
          },
        );
      }
      mainWindow.setProgressBar(Math.max(0, Math.min(1, overallFraction)));
    };

    try {
      const doneInfo = await runVideoUpscaylJob(
        {
          ...payload,
          videoPath,
          trimStartSeconds: null,
          trimEndSeconds: null,
        },
        {
          onProgress: (info, fraction) => emitBatchProgress(info, fraction),
          onWarning: (msg) =>
            mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_WARNING, msg),
        },
      );

      if (stopped || !doneInfo) {
        break;
      }

      results.push({
        videoPath,
        status: "done",
        doneInfo,
      });
    } catch (error: any) {
      if (stopped) break;
      const errMsg = error instanceof Error ? error.message : String(error);
      logit(`❌ Batch video failed (${videoPath}): `, errMsg);
      results.push({
        videoPath,
        status: "error",
        error: errMsg,
      });
    }
  }

  mainWindow.setProgressBar(-1);

  const donePayload: BatchVideoDonePayload = {
    results,
    stopped,
  };
  mainWindow.webContents.send(ELECTRON_COMMANDS.BATCH_VIDEO_DONE, donePayload);

  if (!stopped) {
    const succeeded = results.filter((r) => r.status === "done").length;
    showNotification(
      "Upscayl-Next",
      `Batch video upscaling finished (${succeeded}/${videoPaths.length} succeeded).`,
    );
  }
};

export default batchVideoUpscayl;
