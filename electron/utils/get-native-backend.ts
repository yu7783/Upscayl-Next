import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import isDev from "electron-is-dev";
import logit from "./logit";

/**
 * Root folder of the native Python backend.
 *
 * In development this is the `native/` folder in the repository. Packaged
 * builds copy the same folder next to app.asar through electron-builder's
 * extraResources, so Python can import it like a normal directory.
 */
export const nativeBackendRoot = isDev
  ? path.join(app.getAppPath(), "native")
  : path.join(process.resourcesPath, "native");

/** Python entry point. Invoked as `python __main__.py <upscayl-bin args>`. */
export const nativeBackendEntry = path.join(
  nativeBackendRoot,
  "upscayl_native",
  "__main__.py",
);

/**
 * Locations where a dedicated virtual environment may live.
 *
 * The repository setup script installs into native/.venv. Users of a packaged
 * build can install into the app's userData folder without touching the
 * (read-only) installation directory.
 */
const venvCandidates = () =>
  process.platform === "win32"
    ? [
        path.join(nativeBackendRoot, ".venv", "Scripts", "python.exe"),
        path.join(app.getPath("userData"), "native-backend", "venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(nativeBackendRoot, ".venv", "bin", "python"),
        path.join(app.getPath("userData"), "native-backend", "venv", "bin", "python"),
      ];

const commandIsAvailable = (command: string): boolean => {
  try {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
};

/**
 * Resolve the Python executable used by the native backend.
 *
 * Order:
 * 1. UPSCAYL_PYTHON environment variable (path or command name).
 * 2. Project / userData virtual environment created by native/setup.ps1.
 * 3. python on PATH (python3 first on macOS/Linux).
 *
 * Returns null when no interpreter is available, so callers can show an
 * actionable error instead of a cryptic spawn failure.
 */
export function getPythonExecutable(): string | null {
  const explicit = process.env.UPSCAYL_PYTHON?.trim();
  if (explicit) {
    if (fs.existsSync(explicit) || commandIsAvailable(explicit)) {
      return explicit;
    }
    logit("⚠️ UPSCAYL_PYTHON is set but not executable: ", explicit);
  }

  for (const candidate of venvCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const commands =
    process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const command of commands) {
    if (commandIsAvailable(command)) return command;
  }

  return null;
}

export function nativeBackendExists(): boolean {
  return fs.existsSync(nativeBackendEntry);
}

export const NATIVE_BACKEND_MISSING_MESSAGE =
  "The native HAT/DAT/SUPIR backend is not installed. " +
  "Run `npm run native:setup` from the source tree (or set UPSCAYL_PYTHON) " +
  "to install PyTorch, spandrel and onnxruntime. See native/README.md.";
