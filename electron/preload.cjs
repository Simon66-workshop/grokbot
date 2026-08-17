const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  isPet: true,
  moveBy(dx, dy) {
    ipcRenderer.send("pet-move-by", dx, dy);
  },
});
