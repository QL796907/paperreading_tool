const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("glossaryDesktop", {
  isDesktop: true,
});
