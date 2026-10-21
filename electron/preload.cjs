const { contextBridge, ipcRenderer } = require("electron");

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
