import fs from "fs";
import logit from "./logit";
import { MessageBoxOptions, app, dialog } from "electron";
import settings from "electron-settings";
import { FEATURE_FLAGS } from "../../common/feature-flags";
import { getModelFileSupport } from "../../common/model-compatibility";

const getModels = async (folderPath: string | undefined) => {
  let models: string[] = [];
  let isValid = false;

  // SECURITY SCOPED BOOKMARKS
  let closeAccess;
  const customModelsBookmarks = await settings.get("custom-models-bookmarks");
  if (FEATURE_FLAGS.APP_STORE_BUILD && customModelsBookmarks) {
    console.log(
      "🚀 => file: get-models.ts:18 => customModelsBookmarks:",
      customModelsBookmarks,
    );
    try {
      closeAccess = app.startAccessingSecurityScopedResource(
        customModelsBookmarks as string,
      );
    } catch (error) {
      logit("📁 Custom Models Bookmarks Error: ", error);
    }
  }

  if (!folderPath) {
    logit("❌ Invalid Custom Model Folder Detected");
    const options: MessageBoxOptions = {
      type: "error",
      title: "Invalid Folder",
      message:
        "The selected folder does not contain valid model files. Use a folder with NCNN (.param/.bin), ONNX (.onnx) or PyTorch (.pth/.pt/.ckpt/.safetensors) models such as HAT, DAT or SUPIR.",
      buttons: ["OK"],
    };
    dialog.showMessageBoxSync(options);
    return null;
  }

  // READ CUSTOM MODELS FOLDER
  // NCNN, ONNX and PyTorch checkpoints are all accepted now. Keep the extension
  // for non-NCNN files so the UI can show the correct engine label.
  fs.readdirSync(folderPath, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isFile()) return;
    const file = entry.name;
    const support = getModelFileSupport(file);

    if (support.supportedByBuiltInEngine) {
      isValid = true;
      const modelName =
        support.engine === "ncnn"
          ? file.substring(0, file.lastIndexOf(".")) || file
          : file;
      if (!models.includes(modelName)) {
        models.push(modelName);
      }
      return;
    }
  });

  if (!isValid) {
    logit("❌ Invalid Custom Model Folder Detected");
    const options: MessageBoxOptions = {
      type: "error",
      title: "Invalid Folder",
      message:
        "The selected folder does not contain valid model files. Make sure you select a folder with NCNN (.param/.bin), ONNX (.onnx) or PyTorch (.pth/.pt/.ckpt/.safetensors) models.",
      buttons: ["OK"],
    };
    dialog.showMessageBoxSync(options);
    return null;
  }

  logit("🔎 Detected Custom Models: ", models);
  return models;
};

export default getModels;
