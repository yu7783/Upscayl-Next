import { shell } from "electron";
import logit from "../utils/logit";

const openFolder = async (event, payload) => {
  if (!payload) return;
  logit("📂 Opening Folder: ", payload);
  shell.openPath(payload);
};

export const openFileLocation = async (event, payload: string) => {
  if (!payload) return;
  logit("📂 Revealing File in Folder: ", payload);
  shell.showItemInFolder(payload);
};

export default openFolder;
