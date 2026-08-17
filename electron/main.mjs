import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const POS_FILE = path.join(app.getPath("userData"), "pet-pos.json");
const FACE = 300;
const DOCK = 230;

let win = null;
let dockOpen = false;

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

function clampToDisplay(x, y, w, h) {
  const d = screen.getDisplayNearestPoint({ x, y });
  const a = d.workArea;
  return {
    x: Math.min(a.x + a.width - 64, Math.max(a.x - w + 64, x)),
    y: Math.min(a.y + a.height - 64, Math.max(a.y - 24, y)),
  };
}

function applySize(open) {
  if (!win) return;
  dockOpen = open;
  const h = open ? FACE + DOCK : FACE;
  const [x, y] = win.getPosition();
  const a = screen.getDisplayNearestPoint({ x, y }).workArea;
  let ny = y;
  if (open && y + h > a.y + a.height) ny = a.y + a.height - h;
  const next = clampToDisplay(x, ny, FACE, h);
  win.setBounds({ x: next.x, y: next.y, width: FACE, height: h });
}

function create() {
  const cursor = screen.getCursorScreenPoint();
  const saved = loadPos();
  win = new BrowserWindow({
    width: FACE,
    height: FACE,
    x: saved?.x ?? Math.max(16, cursor.x - FACE / 2),
    y: saved?.y ?? Math.max(16, cursor.y - FACE / 2),
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

  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const cx = b.x + b.width / 2;
    const cy = b.y + FACE / 2;
    const nx = Math.max(-1, Math.min(1, (p.x - cx) / 260));
    const ny = Math.max(-1, Math.min(1, (p.y - cy) / 200));
    win.webContents.send("pet-cursor", nx, ny);
  }, 32);
}

ipcMain.on("pet-move-by", (event, dx, dy) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w || typeof dx !== "number" || typeof dy !== "number") return;
  const [x, y] = w.getPosition();
  const h = dockOpen ? FACE + DOCK : FACE;
  const next = clampToDisplay(x + dx, y + dy, FACE, h);
  w.setPosition(Math.round(next.x), Math.round(next.y));
});

ipcMain.on("pet-click-through", (event, ignore) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  w.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on("pet-dock", (_event, open) => {
  applySize(Boolean(open));
});

if (process.platform !== "darwin") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (!win) create();
});
