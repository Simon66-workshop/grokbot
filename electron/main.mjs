import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const POS_FILE = path.join(app.getPath("userData"), "pet-pos.json");

let win = null;

function loadPos() {
  try {
    const raw = JSON.parse(fs.readFileSync(POS_FILE, "utf8"));
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
  } catch {
    /* first run */
  }
  return null;
}

function savePos() {
  if (!win) return;
  const [x, y] = win.getPosition();
  try {
    fs.writeFileSync(POS_FILE, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

function create() {
  const cursor = screen.getCursorScreenPoint();
  const saved = loadPos();
  const width = 300;
  const height = 300;
  win = new BrowserWindow({
    width,
    height,
    x: saved?.x ?? Math.max(16, cursor.x - width / 2),
    y: saved?.y ?? Math.max(16, cursor.y - height / 2),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    acceptFirstMouse: true,
    backgroundColor: "#00000000",
    title: "GrokBot",
    type: process.platform === "darwin" ? "panel" : undefined,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(false);
    win.setHiddenInMissionControl(true);
  }
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(here, "../mac/index.html"), { query: { pet: "1" } });
  win.on("moved", savePos);
  win.on("close", savePos);
}

ipcMain.on("pet-move-by", (event, dx, dy) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w || typeof dx !== "number" || typeof dy !== "number") return;
  const [x, y] = w.getPosition();
  w.setPosition(Math.round(x + dx), Math.round(y + dy));
});

ipcMain.on("pet-click-through", (event, ignore) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  w.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

if (process.platform !== "darwin") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (!win) create();
});
