const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("glossaryDesktop", {
  isDesktop: true,
  minimize: () => ipcRenderer.send("win-minimize"),
  toggleMaximize: () => ipcRenderer.send("win-maximize"),
  close: () => ipcRenderer.send("win-close"),
});
