import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { FaceRestoreStatus } from "../../common/types/types";
import {
  getPythonExecutable,
  nativeBackendRoot,
} from "../utils/get-native-backend";
import logit from "../utils/logit";

const faceRestoreScript = path.join(
  nativeBackendRoot,
  "upscayl_native",
  "face_restore.py",
);

export function checkFaceRestoreStatus(): FaceRestoreStatus {
  const pythonPath = getPythonExecutable();
  if (!pythonPath) {
    return {
      available: false,
      engines: [],
      pythonPath: null,
      message: "Python interpreter not found. Run npm run native:setup first.",
    };
  }
  if (!fs.existsSync(faceRestoreScript)) {
    return {
      available: false,
      engines: [],
      pythonPath,
      message: `face_restore.py not found at ${faceRestoreScript}`,
    };
  }

  try {
    const probe = spawnSync(pythonPath, [faceRestoreScript, "--check"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    if (probe.status === 0 && probe.stdout) {
      const parsed = JSON.parse(probe.stdout.trim());
      return {
        available: Boolean(parsed.available),
        engines: Array.isArray(parsed.engines) ? parsed.engines : [],
        pythonPath: parsed.python || pythonPath,
        message: parsed.available
          ? undefined
          : "Install GFPGAN in the native venv: pip install gfpgan opencv-python",
      };
    }
  } catch (err: any) {
    logit("⚠️ Face restore availability probe failed: ", err?.message ?? err);
  }

  return {
    available: false,
    engines: [],
    pythonPath,
    message:
      "GFPGAN is not installed. Run: pip install gfpgan opencv-python in the native Python environment.",
  };
}

export async function handleCheckFaceRestore(): Promise<FaceRestoreStatus> {
  return checkFaceRestoreStatus();
}

/**
 * Run optional face restoration in-place on an upscaled image file.
 * Uses a sibling temp file and atomically replaces `imagePath` on success so
 * a failed restoration never corrupts the upscaled output.
 */
export async function runFaceRestore(
  imagePath: string,
  strengthPercent = 70,
): Promise<{ applied: boolean; warning?: string }> {
  const status = checkFaceRestoreStatus();
  if (!status.available || !status.pythonPath) {
    return {
      applied: false,
      warning:
        status.message ??
        "Face restoration skipped: GFPGAN is not installed in the native Python environment.",
    };
  }

  const parsed = path.parse(imagePath);
  const tmpOut = path.join(
    parsed.dir,
    `${parsed.name}.__facerestore__${parsed.ext || ".png"}`,
  );
  const weight = Math.max(0, Math.min(1, (strengthPercent ?? 70) / 100));

  return new Promise((resolve) => {
    const child = spawn(
      status.pythonPath!,
      [
        faceRestoreScript,
        "--input",
        imagePath,
        "--output",
        tmpOut,
        "--strength",
        weight.toFixed(2),
      ],
      { windowsHide: true },
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      try {
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      } catch {}
      resolve({
        applied: false,
        warning: `Face restoration skipped: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmpOut)) {
        try {
          fs.renameSync(tmpOut, imagePath);
          logit(`✨ Face restoration applied (${Math.round(weight * 100)}%): `, imagePath);
          resolve({ applied: true });
          return;
        } catch (renameErr: any) {
          try {
            fs.copyFileSync(tmpOut, imagePath);
            fs.unlinkSync(tmpOut);
            resolve({ applied: true });
            return;
          } catch (copyErr: any) {
            resolve({
              applied: false,
              warning: `Face restoration write failed: ${copyErr?.message ?? renameErr?.message}`,
            });
            return;
          }
        }
      }
      try {
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      } catch {}
      resolve({
        applied: false,
        warning: `Face restoration skipped: ${stderr.trim() || `exit code ${code}`}`,
      });
    });
  });
}
