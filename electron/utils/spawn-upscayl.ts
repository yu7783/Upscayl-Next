import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { execPath } from "./get-resource-paths";
import { resolveModelRuntime } from "../../common/model-runtime";
import {
  getPythonExecutable,
  nativeBackendEntry,
  nativeBackendRoot,
  NATIVE_BACKEND_MISSING_MESSAGE,
} from "./get-native-backend";

/**
 * Read a single CLI flag value from an upscayl-bin style argument array.
 * Empty strings are filtered out by the caller, so `-n` is always followed by
 * its value when present.
 */
const readFlag = (args: string[], flag: string): string => {
  const index = args.indexOf(flag);
  if (index < 0) return "";
  return args[index + 1] ?? "";
};

const hasNcnnModelFiles = (modelsPath: string, model: string): boolean => {
  if (!modelsPath || !model) return false;
  const base = model.replace(/\.(param|bin)$/i, "");
  return (
    fs.existsSync(path.join(modelsPath, `${base}.param`)) &&
    fs.existsSync(path.join(modelsPath, `${base}.bin`))
  );
};

export const spawnUpscayl = (
  command: string[],
  logit: (...args: any) => void,
) => {
  const args = command.filter((arg) => arg !== "");
  const model = readFlag(args, "-n");
  const modelsPath = readFlag(args, "-m");
  const runtime = resolveModelRuntime(model, {
    hasNcnnFiles: hasNcnnModelFiles(modelsPath, model),
  });

  logit("📢 Upscayl Command: ", args);

  let spawnCommand = execPath;
  let spawnArgs = args;
  let env: NodeJS.ProcessEnv | undefined;
  let cwd: string | undefined;

  if (runtime === "python") {
    const python = getPythonExecutable();
    const backendAvailable = fs.existsSync(nativeBackendEntry);

    if (!python || !backendAvailable) {
      logit(
        "❌ Native backend unavailable:",
        python ? "entry missing" : "Python missing",
        nativeBackendEntry,
      );
      // Spawn Electron itself as Node so the existing stderr/close handlers in
      // the upscale commands receive a normal, actionable error message.
      spawnCommand = process.execPath;
      spawnArgs = [
        "-e",
        `console.error(${JSON.stringify(
          `${NATIVE_BACKEND_MISSING_MESSAGE} (backend: ${nativeBackendEntry})`,
        )}); process.exit(1);`,
      ];
      env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
    } else {
      logit("🐍 Native Python backend:", python, "→", model);
      spawnCommand = python;
      // The worker accepts exactly the same flags as upscayl-bin, so all
      // existing argument builders keep working unchanged.
      spawnArgs = [nativeBackendEntry, ...args];
      cwd = nativeBackendRoot;
      env = {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: [nativeBackendRoot, process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter),
      };
    }
  }

  const spawnedProcess = spawn(spawnCommand, spawnArgs, {
    cwd,
    env,
    detached: false,
    windowsHide: true,
  });

  return {
    process: spawnedProcess,
    kill: () => spawnedProcess.kill(),
  };
};
