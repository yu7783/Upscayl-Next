const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("installer", {
  getDefaults: () => ipcRenderer.invoke("installer:getDefaults"),
  getLatestRelease: () => ipcRenderer.invoke("installer:getLatestRelease"),
  selectFolder: (currentPath) =>
    ipcRenderer.invoke("installer:selectFolder", currentPath),
  startInstall: (options) =>
    ipcRenderer.invoke("installer:startInstall", options),
  launchApp: (installDir) =>
    ipcRenderer.invoke("installer:launchApp", installDir),
  openFolder: (directory) =>
    ipcRenderer.invoke("installer:openFolder", directory),
  openUrl: (url) => ipcRenderer.invoke("installer:openUrl", url),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("installer:progress", listener);
    return () => ipcRenderer.removeListener("installer:progress", listener);
  },
  onLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("installer:log", listener);
    return () => ipcRenderer.removeListener("installer:log", listener);
  },
  onDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("installer:done", listener);
    return () => ipcRenderer.removeListener("installer:done", listener);
  },
});
