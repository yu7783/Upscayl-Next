import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import { getMainWindow } from "../main-window";
import {
  childProcesses,
  clearChildProcesses,
  setStopped,
} from "../utils/config-variables";
import logit from "../utils/logit";

const stop = async (event, payload) => {
  const mainWindow = getMainWindow();

  setStopped(true);
  mainWindow && mainWindow.setProgressBar(-1);
  const active = [...childProcesses];
  clearChildProcesses();
  active.forEach((child) => {
    try {
      logit("🛑 Stopping Upscaling Process", child.process.pid);
      child.kill();
    } catch (error) {
      logit("⚠️ Failed to stop process: ", error);
    }
  });
  mainWindow?.webContents.send(ELECTRON_COMMANDS.STOPPED);
};

export default stop;
