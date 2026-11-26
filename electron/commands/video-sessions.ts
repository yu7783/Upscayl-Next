import { app } from "electron";
import fs from "fs";
import path from "path";
import { VideoSessionManifest } from "../../common/types/types";
import logit from "../utils/logit";

const MANIFEST_FILENAME = "manifest.json";

export function getVideoSessionsRoot(): string {
  const dir = path.join(app.getPath("userData"), "video-sessions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getVideoSessionDir(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(getVideoSessionsRoot(), safeId);
}

export function saveVideoSessionManifest(manifest: VideoSessionManifest): void {
  const dir = getVideoSessionDir(manifest.sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, MANIFEST_FILENAME);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), "utf8");
  fs.renameSync(tmp, target);
}

export function loadVideoSessionManifest(
  sessionId: string,
): VideoSessionManifest | null {
  try {
    const manifestPath = path.join(
      getVideoSessionDir(sessionId),
      MANIFEST_FILENAME,
    );
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, "utf8");
    return JSON.parse(raw) as VideoSessionManifest;
  } catch (error) {
    logit("⚠️ Failed to read video session manifest:", sessionId, error);
    return null;
  }
}

export function listVideoSessions(): VideoSessionManifest[] {
  const root = getVideoSessionsRoot();
  const sessions: VideoSessionManifest[] = [];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = loadVideoSessionManifest(entry.name);
      if (manifest && fs.existsSync(manifest.inputVideo)) {
        sessions.push(manifest);
      }
    }
  } catch (error) {
    logit("⚠️ Failed to list video sessions:", error);
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function discardVideoSession(sessionId: string): boolean {
  try {
    const dir = getVideoSessionDir(sessionId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      logit("🧹 Discarded video session:", sessionId);
    }
    return true;
  } catch (error) {
    logit("⚠️ Failed to discard video session:", sessionId, error);
    return false;
  }
}

export const handleListVideoSessions = async (): Promise<
  VideoSessionManifest[]
> => listVideoSessions();

export const handleDiscardVideoSession = async (
  _event: any,
  sessionId: string,
): Promise<boolean> => discardVideoSession(sessionId);
