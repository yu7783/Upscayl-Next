/**
 * This file contains all the global local storage variables that need to be accessed on startup or during the app lifecycle. These are the variables that are not sent by the renderer process but are the localstorage variables used by the main process.
 * Our goal is to send as many variables as possible from the renderer process to the main process to avoid using local storage variables.
 */

import fs from "fs";
import { ChildProcessWithoutNullStreams } from "child_process";
import { getMainWindow } from "../main-window";
import logit from "./logit";

/**
 * The saved image path so that the select image dialog can open to the last used path.
 */
export let savedImagePath: string | undefined = "";
export function setSavedImagePath(value: string | undefined): void {
  savedImagePath = value;
  logit("🖼️ Updating Image Path: ", savedImagePath);
}

/**
 * The saved folder path so that the select folder to upscayl dialog can open to the last used path.
 */
export let savedBatchUpscaylFolderPath: string | undefined = undefined;
export function setSavedBatchUpscaylFolderPath(
  value: string | undefined,
): void {
  savedBatchUpscaylFolderPath = value;
  logit("📁 Updating Folder Path: ", savedBatchUpscaylFolderPath);
}

/**
 * The saved custom models folder path so that we can load the list of custom models from that folder on startup.
 */
export let savedCustomModelsPath: string | undefined = undefined;
export function setSavedCustomModelsPath(value: string | undefined): void {
  savedCustomModelsPath = value;
  logit("📁 Updating Custom Models Folder Path: ", savedCustomModelsPath);
}

/**
 * The stopped variable to stop the batch upscayl process.
 */
export let stopped = false;

/**
 * The child processes array to store the spawned upscayl processes.
 */
export type TrackedChildProcess = {
  process: ChildProcessWithoutNullStreams;
  kill: () => boolean;
};

export let childProcesses: TrackedChildProcess[] = [];

/**
 * Temporary working directories created by active pipelines (e.g. video frames)
 * so they can be cleaned up automatically if the app quits mid-run.
 */
const activeTempDirs = new Set<string>();

export function registerTempDir(dirPath: string): void {
  activeTempDirs.add(dirPath);
}

export function unregisterTempDir(dirPath: string): void {
  activeTempDirs.delete(dirPath);
}

export function cleanupAllTempDirs(): void {
  for (const dirPath of Array.from(activeTempDirs)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      activeTempDirs.delete(dirPath);
      logit("🧹 Cleaned up temp dir on exit: ", dirPath);
    } catch (error) {
      logit("⚠️ Failed to clean up temp dir on exit: ", dirPath, error);
    }
  }
}

/**
 * The turn off notifications variable, so that we can load this value on startup.
 */
export let turnOffNotifications: boolean = false;
export function setTurnOffNotifications(value: boolean): void {
  turnOffNotifications = value;
  logit("🔕 Updating Turn Off Notifications: ", turnOffNotifications);
}

// SETTERS
export function setStopped(value: boolean): void {
  stopped = value;
  logit("🛑 Updating Stopped: ", stopped);
}

export function setChildProcesses(value: TrackedChildProcess): void {
  childProcesses.push(value);
  logit(
    "👶 Updating Child Processes: ",
    JSON.stringify({
      binary: value.process.spawnfile,
      args: value.process.spawnargs,
    }),
  );
}

export function removeChildProcess(value: TrackedChildProcess): void {
  const idx = childProcesses.indexOf(value);
  if (idx >= 0) {
    childProcesses.splice(idx, 1);
  }
}

export function clearChildProcesses(): void {
  childProcesses.length = 0;
}

// LOCAL STORAGE
export function fetchLocalStorage(): void {
  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  // GET LAST IMAGE PATH TO LOCAL STORAGE
  mainWindow.webContents
    .executeJavaScript('localStorage.getItem("lastImagePath");', true)
    .then((lastImagePath: string | null) => {
      if (lastImagePath && lastImagePath.length > 0) {
        setSavedImagePath(lastImagePath);
      }
    });
  // GET LAST FOLDER PATH TO LOCAL STORAGE
  mainWindow.webContents
    .executeJavaScript(
      'localStorage.getItem("lastSavedBatchUpscaylFolderPath");',
      true,
    )
    .then((lastSavedBatchUpscaylFolderPath: string | null) => {
      if (
        lastSavedBatchUpscaylFolderPath &&
        lastSavedBatchUpscaylFolderPath.length > 0
      ) {
        setSavedBatchUpscaylFolderPath(lastSavedBatchUpscaylFolderPath);
      }
    });
  // GET LAST CUSTOM MODELS FOLDER PATH TO LOCAL STORAGE
  mainWindow.webContents
    .executeJavaScript('localStorage.getItem("customModelsFolderPath");', true)
    .then((value: string | null) => {
      if (value && value.length > 0) {
        setSavedCustomModelsPath(value);
      }
    });

  // GET TURN OFF NOTIFICATIONS (BOOLEAN) FROM LOCAL STORAGE
  mainWindow.webContents
    .executeJavaScript('localStorage.getItem("turnOffNotifications");', true)
    .then((lastSaved: string | null) => {
      if (lastSaved !== null) {
        setTurnOffNotifications(lastSaved === "true");
      }
    });
}
