const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  isPet: true,
  moveBy(dx, dy) {
    ipcRenderer.send("pet-move-by", dx, dy);
  },
  setClickThrough(on) {
    ipcRenderer.send("pet-click-through", on);
  },
  setDock(open) {
    ipcRenderer.send("pet-dock", open);
  },
  onCursor(fn) {
    ipcRenderer.on("pet-cursor", (_e, x, y) => fn(x, y));
  },
  onSide(fn) {
    ipcRenderer.on("pet-side", (_e, s) => fn(s));
  },
});
