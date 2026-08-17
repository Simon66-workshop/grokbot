import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const POS_FILE = path.join(app.getPath("userData"), "pet-pos.json");

const STAGE_W = 580;
const STAGE_H = 600;
/** Ball center inside the window for each dock side. */
const BALL = {
  bottom: { x: 290, y: 220 },
  top: { x: 290, y: 380 },
  right: { x: 160, y: 300 },
  left: { x: 420, y: 300 },
};

let win = null;
let side = "bottom";

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
  const b = BALL[side];
  try {
    fs.writeFileSync(POS_FILE, JSON.stringify({ x: x + b.x, y: y + b.y }));
  } catch {
    /* ignore */
  }
}

function workAreaAt(x, y) {
  return screen.getDisplayNearestPoint({ x, y }).workArea;
}

function pickSide(bx, by, a) {
  const l = bx - a.x;
  const r = a.x + a.width - bx;
  const t = by - a.y;
  const btm = a.y + a.height - by;
  const edge = 130;
  if (btm < edge && btm <= t) return "top";
  if (t < edge && t < btm) return "bottom";
  if (l < edge && l <= r) return "right";
  if (r < edge && r < l) return "left";
  return "bottom";
}

function placeWindow(bx, by, nextSide) {
  if (!win) return;
  const o = BALL[nextSide];
  const a = workAreaAt(bx, by);
  let wx = Math.round(bx - o.x);
  let wy = Math.round(by - o.y);
  const dockPad = 12;
  if (nextSide === "bottom") {
    wy = Math.min(wy, a.y + a.height - STAGE_H + dockPad);
    wy = Math.max(wy, a.y - 80);
  } else if (nextSide === "top") {
    wy = Math.max(wy, a.y - dockPad);
    wy = Math.min(wy, a.y + a.height - STAGE_H + 80);
  } else if (nextSide === "right") {
    wx = Math.max(wx, a.x - 40);
    wx = Math.min(wx, a.x + a.width - STAGE_W + dockPad);
  } else {
    wx = Math.min(wx, a.x + a.width - STAGE_W + 40);
    wx = Math.max(wx, a.x - dockPad);
  }
  wx = Math.min(a.x + a.width - 160, Math.max(a.x + 160 - STAGE_W, wx));
  wy = Math.min(a.y + a.height - 160, Math.max(a.y + 160 - STAGE_H, wy));
  side = nextSide;
  win.setBounds({ x: wx, y: wy, width: STAGE_W, height: STAGE_H });
  win.webContents.send("pet-side", side);
}

function ballScreen() {
  const [wx, wy] = win.getPosition();
  const o = BALL[side];
  return { x: wx + o.x, y: wy + o.y };
}

function syncLayout() {
  if (!win || win.isDestroyed()) return;
  const b = ballScreen();
  const next = pickSide(b.x, b.y, workAreaAt(b.x, b.y));
  if (next !== side) placeWindow(b.x, b.y, next);
}

function create() {
  const cursor = screen.getCursorScreenPoint();
  const saved = loadPos();
  const start = {
    x: saved?.x ?? cursor.x,
    y: saved?.y ?? cursor.y,
  };
  const a = workAreaAt(start.x, start.y);
  side = pickSide(start.x, start.y, a);
  const o = BALL[side];
  win = new BrowserWindow({
    width: STAGE_W,
    height: STAGE_H,
    x: Math.round(start.x - o.x),
    y: Math.round(start.y - o.y),
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
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("pet-side", side);
    const b = ballScreen();
    placeWindow(b.x, b.y, side);
  });
  win.on("moved", () => {
    savePos();
    syncLayout();
  });
  win.on("close", savePos);

  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = ballScreen();
    const nx = Math.max(-1, Math.min(1, (p.x - b.x) / 260));
    const ny = Math.max(-1, Math.min(1, (p.y - b.y) / 200));
    win.webContents.send("pet-cursor", nx, ny);
  }, 32);
}

ipcMain.on("pet-move-by", (event, dx, dy) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w || typeof dx !== "number" || typeof dy !== "number") return;
  const b = ballScreen();
  const next = { x: b.x + dx, y: b.y + dy };
  const a = workAreaAt(next.x, next.y);
  next.x = Math.min(a.x + a.width - 8, Math.max(a.x + 8, next.x));
  next.y = Math.min(a.y + a.height - 8, Math.max(a.y + 8, next.y));
  const nextSide = pickSide(next.x, next.y, a);
  placeWindow(next.x, next.y, nextSide);
});

ipcMain.on("pet-click-through", (event, ignore) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  w.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on("pet-dock", () => {});

if (process.platform !== "darwin") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (!win) create();
});
