import { MessageBoxOptions, dialog, shell } from "electron";
import { UpdateDownloadedEvent, autoUpdater } from "electron-updater";
import logit from "../utils/logit";

const autoUpdate = (event: UpdateDownloadedEvent) => {
  autoUpdater.autoInstallOnAppQuit = false;
  const dialogOpts: MessageBoxOptions = {
    type: "info",
    buttons: ["Install update", "No Thanks", "Check Release Notes"],
    title: "New Upscayl-Next Update",
    message: event.releaseName as string,
    detail:
      "A new version has been downloaded. Restart the application to apply the updates.",
  };

  const dialogResponse = dialog.showMessageBoxSync(dialogOpts);

  logit("✅ Update Downloaded");
  if (dialogResponse === 0) {
    autoUpdater.quitAndInstall();
  } else if (dialogResponse === 2) {
    const version = String(event.version);
    shell.openExternal(
      "https://github.com/yu7783/Upscayl-Next/releases/tag/" +
        (version.startsWith("v") ? version : "v" + version)
    );
    dialog.showMessageBoxSync(dialogOpts);
  } else {
    logit("🚫 Update Installation Cancelled");
  }
};

export default autoUpdate;
