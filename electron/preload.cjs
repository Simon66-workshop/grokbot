const { contextBridge, ipcRenderer } = require("electron");

function listen(channel, fn) {
  const wrapped = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld("pet", {
  isPet: true,
  moveBy(dx, dy) {
    ipcRenderer.send("pet-move-by", dx, dy);
  },
  setClickThrough(on) {
    ipcRenderer.send("pet-click-through", on);
  },
  onCursor(fn) {
    return listen("pet-cursor", fn);
  },
  onSide(fn) {
    return listen("pet-side", fn);
  },
  onScene(fn) {
    return listen("pet-scene", fn);
  },
  onVisible(fn) {
    return listen("pet-visible", fn);
  },
  onMute(fn) {
    return listen("pet-mute", fn);
  },
  setScene(scene) {
    ipcRenderer.send("pet-set-scene", scene);
  },
  setMuted(muted) {
    ipcRenderer.send("pet-set-mute", muted);
  },
  hide() {
    ipcRenderer.send("pet-hide");
  },
});
