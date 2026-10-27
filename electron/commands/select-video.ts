import { MessageBoxOptions, dialog } from "electron";
import { getMainWindow } from "../main-window";
import { savedImagePath, setSavedImagePath } from "../utils/config-variables";
import logit from "../utils/logit";
import settings from "electron-settings";
import { FEATURE_FLAGS } from "../../common/feature-flags";
import { videoFormats } from "../../common/video-formats";

const selectVideo = async () => {
  const mainWindow = getMainWindow();

  const { canceled, filePaths, bookmarks } = await dialog.showOpenDialog({
    properties: ["openFile"],
    title: "Select Video",
    defaultPath: savedImagePath,
    securityScopedBookmarks: true,
    message: "Select a video to upscale",
    filters: [
      {
        name: "Videos",
        extensions: [...videoFormats],
      },
    ],
  });

  if (FEATURE_FLAGS.APP_STORE_BUILD && bookmarks && bookmarks.length > 0) {
    settings.set("file-bookmarks", bookmarks[0]);
  }

  if (canceled) {
    logit("🚫 Video selection cancelled");
    return null;
  }

  const videoPath = filePaths[0];
  const extension = videoPath.split(".").pop()?.toLowerCase() ?? "";
  if (!(videoFormats as readonly string[]).includes(extension)) {
    logit("❌ Invalid Video File Detected");
    const options: MessageBoxOptions = {
      type: "error",
      title: "Invalid Video",
      message:
        "The selected file is not a supported video. Choose an MP4, MOV, MKV, AVI, WEBM, M4V, MPEG, MPG, WMV or FLV file.",
    };
    if (!mainWindow) return null;
    dialog.showMessageBoxSync(mainWindow, options);
    return null;
  }

  setSavedImagePath(videoPath);
  logit("🎬 Selected Video Path: ", videoPath);
  return videoPath;
};

export default selectVideo;
