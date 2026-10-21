const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  minimize() {
    ipcRenderer.send("desktop-window:minimize");
  },
  toggleMaximize() {
    ipcRenderer.send("desktop-window:toggle-maximize");
  },
  close() {
    ipcRenderer.send("desktop-window:close");
  },
  isMaximized() {
    return ipcRenderer.invoke("desktop-window:is-maximized");
  },
  onMaximized(callback) {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on("desktop-window:maximized", listener);
    return () => ipcRenderer.removeListener("desktop-window:maximized", listener);
  },
});

contextBridge.exposeInMainWorld("desktopUpdate", {
  install() {
    ipcRenderer.send("desktop-update:install");
  },
  ready() {
    return ipcRenderer.invoke("desktop-update:ready");
  },
  onReady(callback) {
    const listener = (_event, version) => callback(version || "");
    ipcRenderer.on("desktop-update:ready", listener);
    return () => ipcRenderer.removeListener("desktop-update:ready", listener);
  },
});
