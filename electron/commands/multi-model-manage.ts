import fs from "fs";
import path from "path";
import { shell } from "electron";
import decodePath from "../../common/decode-path";
import {
  MultiModelTrashPayload,
  MultiModelTrashResult,
} from "../../common/types/types";
import logit from "../utils/logit";

const normalizeResolved = (p: string): string => {
  const resolved = path.resolve(decodePath(p));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

/**
 * Safely move rejected multi-model outputs to the OS Trash (falling back to
 * unlink only when trashItem is unsupported). Never deletes protected paths
 * such as the original source image.
 */
export async function handleTrashMultiModelFiles(
  _event: unknown,
  payload: MultiModelTrashPayload,
): Promise<MultiModelTrashResult> {
  const protectedSet = new Set(
    (payload?.protectedPaths ?? [])
      .filter((p) => typeof p === "string" && p.trim().length > 0)
      .map(normalizeResolved),
  );

  const trashed: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  for (const rawPath of payload?.filePaths ?? []) {
    if (!rawPath || typeof rawPath !== "string") continue;
    const decoded = decodePath(rawPath);
    const key = normalizeResolved(decoded);

    if (protectedSet.has(key)) {
      failed.push({
        path: decoded,
        error: "Protected source file cannot be discarded.",
      });
      continue;
    }

    if (!fs.existsSync(decoded)) {
      // Already removed; treat as successfully discarded.
      trashed.push(decoded);
      continue;
    }

    try {
      await shell.trashItem(decoded);
      trashed.push(decoded);
      logit("🗑️ Moved to Trash: ", decoded);
    } catch (trashErr: any) {
      try {
        fs.unlinkSync(decoded);
        trashed.push(decoded);
        logit("🗑️ Deleted rejected output (trash fallback): ", decoded);
      } catch (unlinkErr: any) {
        const msg =
          unlinkErr?.message ?? trashErr?.message ?? "Failed to discard file";
        failed.push({ path: decoded, error: msg });
        logit("❌ Could not discard file: ", decoded, msg);
      }
    }
  }

  return { trashed, failed };
}
