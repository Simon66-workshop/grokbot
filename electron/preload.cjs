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
  dragStart() {
    ipcRenderer.send("pet-drag-start");
  },
  dragEnd() {
    return ipcRenderer.invoke("pet-drag-end");
  },
  onDragArmed(fn) {
    return listen("pet-drag-armed", fn);
  },
  onDragFinished(fn) {
    return listen("pet-drag-finished", fn);
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
  onMeeting(fn) {
    return listen("pet-meeting", fn);
  },
  onSize(fn) {
    return listen("pet-size", fn);
  },
  onAutoWork(fn) {
    return listen("pet-auto-work", fn);
  },
  onCodex(fn) {
    return listen("pet-codex", fn);
  },
  onCodexWatch(fn) {
    return listen("pet-codex-watch", fn);
  },
  setScene(scene) {
    ipcRenderer.send("pet-set-scene", scene);
  },
  setMuted(muted) {
    ipcRenderer.send("pet-set-mute", muted);
  },
  setSize(id) {
    ipcRenderer.send("pet-set-size", id);
  },
  setAutoWork(on) {
    ipcRenderer.send("pet-set-auto-work", on);
  },
  setCodexWatch(on) {
    ipcRenderer.send("pet-set-codex-watch", on);
  },
  setTrayIcon(dataUrl) {
    ipcRenderer.send("pet-tray-icon", dataUrl);
  },
  hide() {
    ipcRenderer.send("pet-hide");
  },
});
