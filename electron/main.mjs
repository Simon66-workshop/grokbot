import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const POS_FILE = path.join(app.getPath("userData"), "pet-pos.json");

// Keep in sync with src/lib/grokbot/pet-shell.ts STAGE / BALL_IN_STAGE
const STAGE_W = 580;
const STAGE_H = 600;
const BALL = {
  bottom: { x: 290, y: 220 },
  top: { x: 290, y: 380 },
  right: { x: 160, y: 300 },
  left: { x: 420, y: 300 },
};

let win = null;
let tray = null;
let side = "bottom";
let cursorTimer = null;
let visible = true;

function loadPos() {
  try {
    const raw = JSON.parse(fs.readFileSync(POS_FILE, "utf8"));
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
    if (raw.v === 2) return { x: raw.x, y: raw.y };
    return { x: raw.x + BALL.bottom.x, y: raw.y + BALL.bottom.y };
  } catch {
    return null;
  }
}

function savePos() {
  if (!win) return;
  const b = ballScreen();
  try {
    fs.writeFileSync(POS_FILE, JSON.stringify({ v: 2, x: b.x, y: b.y }));
  } catch {
    /* ignore */
  }
}

function onADisplay(x, y) {
  return screen.getAllDisplays().some((d) => {
    const a = d.bounds;
    return x >= a.x && y >= a.y && x <= a.x + a.width && y <= a.y + a.height;
  });
}

function workAreaAt(x, y) {
  return screen.getDisplayNearestPoint({ x, y }).workArea;
}

function pickSide(bx, by, a) {
  const l = bx - a.x;
  const r = a.x + a.width - bx;
  const t = by - a.y;
  const btm = a.y + a.height - by;
  const edge = 110;
  if (btm < edge && btm <= t) return "top";
  if (t < edge && t < btm) return "bottom";
  if (l < edge && l <= r) return "right";
  if (r < edge && r < l) return "left";
  return "bottom";
}

function placeWindow(bx, by, nextSide) {
  if (!win) return;
  const o = BALL[nextSide];
  const wx = Math.round(bx - o.x);
  const wy = Math.round(by - o.y);
  side = nextSide;
  win.setBounds({ x: wx, y: wy, width: STAGE_W, height: STAGE_H });
  win.webContents.send("pet-side", side);
}

function ballScreen() {
  const [wx, wy] = win.getPosition();
  const o = BALL[side];
  return { x: wx + o.x, y: wy + o.y };
}

function iconImage() {
  const file = path.join(here, "../assets/icon.png");
  if (fs.existsSync(file)) return nativeImage.createFromPath(file);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#1b56f3"/><circle cx="12" cy="14" r="2.2" fill="#fffdf8"/><circle cx="20" cy="14" r="2.2" fill="#fffdf8"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function applyTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    {
      label: visible ? "Hide GrokBot" : "Show GrokBot",
      click: () => toggleVisible(),
    },
    { type: "separator" },
    { label: "Work", click: () => win?.webContents.send("pet-scene", "work") },
    { label: "Play", click: () => win?.webContents.send("pet-scene", "companion") },
    { label: "Demo", click: () => win?.webContents.send("pet-scene", "demo") },
    { type: "separator" },
    {
      label: "Open at Login",
      type: "checkbox",
      checked: login,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
      },
    },
    { type: "separator" },
    {
      label: "Quit GrokBot",
      accelerator: "Command+Q",
      click: () => {
        cleanup();
        app.quit();
      },
    },
  ]);
  if (!tray) {
    const img = iconImage();
    img.setTemplateImage(false);
    tray = new Tray(img.resize({ width: 18, height: 18 }));
    tray.setToolTip("GrokBot");
    tray.on("click", () => toggleVisible());
  }
  tray.setContextMenu(menu);
}

function toggleVisible() {
  if (!win) return;
  visible = !visible;
  if (visible) win.show();
  else win.hide();
  applyTrayMenu();
}

function cleanup() {
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
  tray?.destroy();
  tray = null;
}

function create() {
  const cursor = screen.getCursorScreenPoint();
  let start = loadPos();
  if (!start || !onADisplay(start.x, start.y)) start = { x: cursor.x, y: cursor.y };
  const a = workAreaAt(start.x, start.y);
  start.x = Math.min(a.x + a.width - 8, Math.max(a.x + 8, start.x));
  start.y = Math.min(a.y + a.height - 8, Math.max(a.y + 8, start.y));
  side = pickSide(start.x, start.y, a);
  const o = BALL[side];
  win = new BrowserWindow({
    width: STAGE_W,
    height: STAGE_H,
    x: Math.round(start.x - o.x),
    y: Math.round(start.y - o.y),
    show: !app.getLoginItemSettings().wasOpenedAsHidden,
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
  if (app.getLoginItemSettings().wasOpenedAsHidden) visible = false;
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
  win.on("moved", savePos);
  win.on("close", savePos);

  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = ballScreen();
    const nx = Math.max(-1, Math.min(1, (p.x - b.x) / 260));
    const ny = Math.max(-1, Math.min(1, (p.y - b.y) / 200));
    win.webContents.send("pet-cursor", nx, ny);
  }, 32);

  applyTrayMenu();
  const appMenu = Menu.buildFromTemplate([
    {
      label: "GrokBot",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Hide GrokBot", click: () => toggleVisible() },
        { type: "separator" },
        { role: "quit", label: "Quit GrokBot" },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);
}

ipcMain.on("pet-move-by", (event, dx, dy) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w || typeof dx !== "number" || typeof dy !== "number") return;
  const b = ballScreen();
  const next = { x: b.x + dx, y: b.y + dy };
  const a = workAreaAt(next.x, next.y);
  next.x = Math.min(a.x + a.width - 8, Math.max(a.x + 8, next.x));
  next.y = Math.min(a.y + a.height - 8, Math.max(a.y + 8, next.y));
  placeWindow(next.x, next.y, pickSide(next.x, next.y, a));
});

ipcMain.on("pet-click-through", (event, ignore) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  w.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on("pet-set-scene", (_e, scene) => {
  win?.webContents.send("pet-scene", scene);
});

if (process.platform !== "darwin") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
}

const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) create();
    else {
      if (!visible) toggleVisible();
      else win.show();
    }
  });
  app.whenReady().then(create);
}

app.on("window-all-closed", () => {
  cleanup();
  app.quit();
});
app.on("before-quit", cleanup);
app.on("activate", () => {
  if (!win) create();
  else if (!visible) toggleVisible();
});
