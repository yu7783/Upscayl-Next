import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { app } from "electron";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import {
  CatalogModelEntry,
  CatalogModelStatus,
  MODEL_CATALOG,
} from "../../common/model-catalog";
import {
  ModelManagerListResponse,
  ModelManagerProgressInfo,
} from "../../common/types/types";
import { getMainWindow } from "../main-window";
import {
  savedCustomModelsPath,
  setSavedCustomModelsPath,
} from "../utils/config-variables";
import getModels from "../utils/get-models";
import logit from "../utils/logit";

const MAX_REDIRECTS = 5;

export function resolveManagedModelsDir(): string {
  if (savedCustomModelsPath && savedCustomModelsPath.trim().length > 0) {
    fs.mkdirSync(savedCustomModelsPath, { recursive: true });
    return savedCustomModelsPath;
  }
  const fallbackDir = path.join(app.getPath("userData"), "custom-models");
  fs.mkdirSync(fallbackDir, { recursive: true });
  return fallbackDir;
}

function getCatalogWithStatus(modelsDir: string): CatalogModelStatus[] {
  return MODEL_CATALOG.map((entry) => {
    const installedFiles = entry.files
      .map((f) => path.join(modelsDir, f.filename))
      .filter((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
    const installed = installedFiles.length === entry.files.length;
    return {
      ...entry,
      installed,
      installedFiles,
    };
  });
}

async function refreshRendererCustomModels(modelsDir: string): Promise<void> {
  setSavedCustomModelsPath(modelsDir);
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const models = await getModels(modelsDir);
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.CUSTOM_MODEL_FILES_LIST,
      models,
    );
  } catch (err) {
    logit("⚠️ Failed to refresh custom models list: ", err);
  }
}

function downloadFileWithRedirects(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
  redirectsLeft = MAX_REDIRECTS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("http://") ? http : https;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "Upscayl-Next-ModelManager/1.0",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          downloadFileWithRedirects(
            nextUrl,
            destPath,
            onProgress,
            redirectsLeft - 1,
          )
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status} while downloading ${url}`));
          return;
        }

        const total = parseInt(res.headers["content-length"] || "0", 10) || 0;
        let downloaded = 0;
        const tmpPath = `${destPath}.download.tmp`;
        const fileStream = fs.createWriteStream(tmpPath);

        res.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress(downloaded, total);
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => {
            try {
              fs.renameSync(tmpPath, destPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });

        fileStream.on("error", (err) => {
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch {}
          reject(err);
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error(`Timed out downloading ${url}`));
    });
  });
}

export async function handleModelManagerList(): Promise<ModelManagerListResponse> {
  const modelsDir = resolveManagedModelsDir();
  return {
    modelsDir,
    entries: getCatalogWithStatus(modelsDir),
  };
}

export async function handleModelManagerInstall(
  _event: unknown,
  modelId: string,
): Promise<ModelManagerListResponse> {
  const entry: CatalogModelEntry | undefined = MODEL_CATALOG.find(
    (m) => m.id === modelId,
  );
  if (!entry) {
    throw new Error(`Unknown catalog model: ${modelId}`);
  }

  const modelsDir = resolveManagedModelsDir();
  const mainWindow = getMainWindow();

  logit(`⬇️ Installing model "${entry.name}" into ${modelsDir}`);

  for (let i = 0; i < entry.files.length; i += 1) {
    const file = entry.files[i];
    const dest = path.join(modelsDir, file.filename);
    await downloadFileWithRedirects(
      file.url,
      dest,
      (downloadedBytes, totalBytes) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const fileFraction =
          totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : 0;
        const overallPercent = Math.round(
          ((i + fileFraction) / entry.files.length) * 100,
        );
        const info: ModelManagerProgressInfo = {
          modelId: entry.id,
          fileIndex: i + 1,
          totalFiles: entry.files.length,
          currentFile: file.filename,
          downloadedBytes,
          totalBytes,
          percent: overallPercent,
        };
        mainWindow.webContents.send(
          ELECTRON_COMMANDS.MODEL_MANAGER_PROGRESS,
          info,
        );
      },
    );
  }

  await refreshRendererCustomModels(modelsDir);
  logit(`✅ Installed model "${entry.name}"`);

  return {
    modelsDir,
    entries: getCatalogWithStatus(modelsDir),
  };
}

export async function handleModelManagerDelete(
  _event: unknown,
  modelId: string,
): Promise<ModelManagerListResponse> {
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!entry) {
    throw new Error(`Unknown catalog model: ${modelId}`);
  }

  const modelsDir = resolveManagedModelsDir();
  for (const file of entry.files) {
    const target = path.join(modelsDir, file.filename);
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (err) {
      logit("⚠️ Could not delete model file: ", target, err);
    }
  }

  await refreshRendererCustomModels(modelsDir);
  logit(`🗑️ Deleted model "${entry.name}" from ${modelsDir}`);

  return {
    modelsDir,
    entries: getCatalogWithStatus(modelsDir),
  };
}
