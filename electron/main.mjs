import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { layoutFor, isPetSize } from "./layout.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const POS_FILE = path.join(app.getPath("userData"), "pet-pos.json");
const PREFS_FILE = path.join(app.getPath("userData"), "pet-prefs.json");

let win = null;
let tray = null;
let side = "bottom";
let cursorTimer = null;
let meetTimer = null;
let calTimer = null;
let visible = true;
let scene = "companion";
let muted = false;
let autoWork = true;
let meeting = false;
let petSize = "l";
let layout = layoutFor("l");
let lastIconAt = 0;
const DRAG_ARM_PX = 6;
let drag = null;

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
    if (isPetSize(raw.size)) petSize = raw.size;
    if (typeof raw.autoWork === "boolean") autoWork = raw.autoWork;
    if (typeof raw.muted === "boolean") muted = raw.muted;
    if (raw.scene === "work" || raw.scene === "companion" || raw.scene === "demo") scene = raw.scene;
  } catch {
    /* ignore */
  }
  layout = layoutFor(petSize);
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify({ size: petSize, autoWork, muted, scene }));
  } catch {
    /* ignore */
  }
}

function loadPosStore() {
  try {
    return JSON.parse(fs.readFileSync(POS_FILE, "utf8"));
  } catch {
    return null;
  }
}

function boundsKey(d) {
  const b = d.bounds;
  return `${b.width}x${b.height}+${b.x}+${b.y}`;
}

function loadPos() {
  const raw = loadPosStore();
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  if (raw.v >= 2) return { x: raw.x, y: raw.y };
  return { x: raw.x + layout.ball.bottom.x, y: raw.y + layout.ball.bottom.y };
}

function savePos() {
  if (!win) return;
  const b = ballScreen();
  const d = screen.getDisplayNearestPoint(b);
  const prev = loadPosStore() || { v: 3, byDisplay: {}, byBounds: {} };
  prev.v = 3;
  prev.x = b.x;
  prev.y = b.y;
  prev.displayId = d.id;
  prev.byDisplay = prev.byDisplay || {};
  prev.byBounds = prev.byBounds || {};
  prev.byDisplay[String(d.id)] = { x: b.x, y: b.y };
  prev.byBounds[boundsKey(d)] = { x: b.x, y: b.y };
  try {
    fs.writeFileSync(POS_FILE, JSON.stringify(prev));
  } catch {
    /* ignore */
  }
}

function savedForDisplay(d) {
  const raw = loadPosStore();
  if (!raw) return null;
  const byId = raw.byDisplay?.[String(d.id)];
  if (byId && Number.isFinite(byId.x)) return byId;
  const byB = raw.byBounds?.[boundsKey(d)];
  if (byB && Number.isFinite(byB.x)) return byB;
  return null;
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
  const o = layout.ball[nextSide];
  const wx = Math.round(bx - o.x);
  const wy = Math.round(by - o.y);
  const sideChanged = side !== nextSide;
  side = nextSide;
  const cur = win.getBounds();
  if (cur.width === layout.w && cur.height === layout.h) {
    win.setPosition(wx, wy);
  } else {
    win.setBounds({ x: wx, y: wy, width: layout.w, height: layout.h }, false);
  }
  if (sideChanged) win.webContents.send("pet-side", side);
}

function cursorInWindow() {
  if (!win) return false;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  return p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height;
}

function readLeftButton() {
  if (process.platform !== "darwin") return Promise.resolve(null);
  return runCmd(
    "osascript",
    [
      "-e",
      'use framework "AppKit"',
      "-e",
      "(current application's NSEvent's pressedMouseButtons() as integer)",
    ],
    400,
  ).then((out) => {
    const n = parseInt(String(out).trim(), 10);
    if (!Number.isFinite(n)) return null;
    return (n & 1) === 1;
  });
}

function startDrag() {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const b = ballScreen();
  if (drag?.timer) clearInterval(drag.timer);
  drag = {
    ox: cursor.x - b.x,
    oy: cursor.y - b.y,
    startX: cursor.x,
    startY: cursor.y,
    armed: false,
    sideLocked: side,
    timer: null,
    outsideSince: 0,
    lastBtnCheck: 0,
  };
  win.setIgnoreMouseEvents(false);
  drag.timer = setInterval(followDrag, 10);
  followDrag();
}

function followDrag() {
  if (!drag || !win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const travel = Math.hypot(cursor.x - drag.startX, cursor.y - drag.startY);
  if (!drag.armed && travel < DRAG_ARM_PX) return;
  if (!drag.armed) {
    drag.armed = true;
    win.webContents.send("pet-drag-armed");
  }
  const next = { x: cursor.x - drag.ox, y: cursor.y - drag.oy };
  const a = workAreaAt(next.x, next.y);
  next.x = Math.min(a.x + a.width - 8, Math.max(a.x + 8, next.x));
  next.y = Math.min(a.y + a.height - 8, Math.max(a.y + 8, next.y));
  placeWindow(next.x, next.y, drag.sideLocked);
  if (cursorInWindow()) {
    drag.outsideSince = 0;
    return;
  }
  const now = Date.now();
  if (!drag.outsideSince) drag.outsideSince = now;
  if (now - drag.lastBtnCheck > 180) {
    drag.lastBtnCheck = now;
    readLeftButton().then((down) => {
      if (drag && down === false) forceEndDrag();
    });
  }
  if (now - drag.outsideSince > 8000) forceEndDrag();
}

function endDrag() {
  if (!drag) return { moved: false };
  const moved = drag.armed;
  if (drag.timer) clearInterval(drag.timer);
  drag = null;
  if (win && !win.isDestroyed()) {
    const b = ballScreen();
    const a = workAreaAt(b.x, b.y);
    placeWindow(b.x, b.y, pickSide(b.x, b.y, a));
    savePos();
  }
  return { moved };
}

function forceEndDrag() {
  if (!drag) return;
  const result = endDrag();
  win?.webContents.send("pet-drag-finished", result);
}

function ballScreen() {
  const [wx, wy] = win.getPosition();
  const o = layout.ball[side];
  return { x: wx + o.x, y: wy + o.y };
}

function applySize(id) {
  if (!isPetSize(id)) return;
  const b = win ? ballScreen() : null;
  petSize = id;
  layout = layoutFor(id);
  savePrefs();
  if (win && b) {
    const a = workAreaAt(b.x, b.y);
    placeWindow(b.x, b.y, pickSide(b.x, b.y, a));
  }
}

function iconImage() {
  const file = path.join(here, "../assets/icon.png");
  if (fs.existsSync(file)) return nativeImage.createFromPath(file);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#1b56f3"/><circle cx="12" cy="14" r="2.2" fill="#fffdf8"/><circle cx="20" cy="14" r="2.2" fill="#fffdf8"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function sendScene(next) {
  scene = next;
  savePrefs();
  win?.webContents.send("pet-scene", scene);
  applyTrayMenu();
}

function applyTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    {
      label: visible ? "Hide GrokBot" : "Show GrokBot",
      click: () => toggleVisible(),
    },
    { type: "separator" },
    {
      label: "Work",
      type: "radio",
      checked: scene === "work",
      click: () => sendScene("work"),
    },
    {
      label: "Play",
      type: "radio",
      checked: scene === "companion",
      click: () => sendScene("companion"),
    },
    {
      label: "Demo",
      type: "radio",
      checked: scene === "demo",
      click: () => sendScene("demo"),
    },
    { type: "separator" },
    {
      label: "Small",
      type: "radio",
      checked: petSize === "s",
      click: () => {
        applySize("s");
        win?.webContents.send("pet-size", "s");
        applyTrayMenu();
      },
    },
    {
      label: "Medium",
      type: "radio",
      checked: petSize === "m",
      click: () => {
        applySize("m");
        win?.webContents.send("pet-size", "m");
        applyTrayMenu();
      },
    },
    {
      label: "Large",
      type: "radio",
      checked: petSize === "l",
      click: () => {
        applySize("l");
        win?.webContents.send("pet-size", "l");
        applyTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Sound",
      type: "checkbox",
      checked: !muted,
      click: (item) => {
        muted = !item.checked;
        savePrefs();
        win?.webContents.send("pet-mute", muted);
        applyTrayMenu();
      },
    },
    {
      label: "Auto Work",
      type: "checkbox",
      checked: autoWork,
      click: (item) => {
        autoWork = item.checked;
        savePrefs();
        win?.webContents.send("pet-auto-work", autoWork);
        applyTrayMenu();
      },
    },
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
    tray = new Tray(img.resize({ width: 22, height: 22 }));
    tray.setToolTip("GrokBot");
    tray.on("click", () => toggleVisible());
  }
  tray.setContextMenu(menu);
}

function startCursor() {
  if (cursorTimer) return;
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !visible) return;
    const p = screen.getCursorScreenPoint();
    const b = ballScreen();
    const nx = Math.max(-1, Math.min(1, (p.x - b.x) / 260));
    const ny = Math.max(-1, Math.min(1, (p.y - b.y) / 200));
    win.webContents.send("pet-cursor", nx, ny);
  }, 32);
}

function stopCursor() {
  if (!cursorTimer) return;
  clearInterval(cursorTimer);
  cursorTimer = null;
}

function setVisible(next) {
  if (!win) return;
  visible = next;
  if (visible) {
    win.show();
    startCursor();
  } else {
    win.hide();
    stopCursor();
  }
  win.webContents.send("pet-visible", visible);
  applyTrayMenu();
}

function toggleVisible() {
  setVisible(!visible);
}

function runCmd(bin, args, timeout) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout }, (err, stdout) => {
      resolve(err ? "" : String(stdout || ""));
    });
  });
}

const MEET_RE = /zoom(\.us)?|facetime|webex|microsoft teams|^teams$|ciscowebex|google meet/i;

async function detectMeeting() {
  if (process.platform === "darwin") {
    const named = await runCmd(
      "osascript",
      ["-e", 'tell application "System Events" to get name of every process whose background only is false'],
      2000,
    );
    if (named && named.split(",").some((n) => MEET_RE.test(n.trim()))) return true;
  }
  const pg = await runCmd("pgrep", ["-il", "zoom|FaceTime|Webex|Teams"], 1500);
  return Boolean(pg && pg.trim());
}

async function detectCalendarBusy() {
  if (process.platform !== "darwin") return false;
  const script = `
    set nowDate to current date
    set soon to nowDate + 8 * minutes
    tell application "Calendar"
      repeat with cal in calendars
        try
          set evs to (every event of cal whose start date is less than or equal to soon and end date is greater than or equal to nowDate)
          if (count of evs) > 0 then return "1"
        end try
      end repeat
    end tell
    return "0"
  `;
  const out = await runCmd("osascript", ["-e", script], 2500);
  return out.trim() === "1";
}

function emitMeeting(on) {
  if (meeting === on) return;
  meeting = on;
  win?.webContents.send("pet-meeting", meeting);
}

function startFocusWatch() {
  const pollMeet = async () => {
    if (!visible) return;
    try {
      emitMeeting(await detectMeeting());
    } catch {
      /* ignore */
    }
  };
  const pollCal = async () => {
    if (!visible || !autoWork) return;
    try {
      if (await detectCalendarBusy()) emitMeeting(true);
    } catch {
      /* ignore */
    }
  };
  pollMeet();
  meetTimer = setInterval(pollMeet, 15_000);
  calTimer = setInterval(pollCal, 90_000);
}

function restoreToDisplay(d) {
  const saved = savedForDisplay(d);
  const a = d.workArea;
  let x;
  let y;
  if (saved && saved.x >= a.x && saved.y >= a.y && saved.x <= a.x + a.width && saved.y <= a.y + a.height) {
    x = saved.x;
    y = saved.y;
  } else {
    x = a.x + a.width / 2;
    y = a.y + a.height / 2;
  }
  placeWindow(x, y, pickSide(x, y, a));
  savePos();
}

function wireDisplays() {
  screen.on("display-added", (_e, display) => {
    const saved = savedForDisplay(display);
    if (!saved) return;
    const a = display.workArea;
    if (saved.x >= a.x && saved.y >= a.y && saved.x <= a.x + a.width && saved.y <= a.y + a.height) {
      placeWindow(saved.x, saved.y, pickSide(saved.x, saved.y, a));
      savePos();
    }
  });
  screen.on("display-removed", () => {
    if (!win) return;
    const b = ballScreen();
    if (onADisplay(b.x, b.y)) return;
    const nearest = screen.getDisplayNearestPoint(b);
    restoreToDisplay(nearest);
  });
}

function cleanup() {
  if (drag?.timer) clearInterval(drag.timer);
  drag = null;
  stopCursor();
  if (meetTimer) clearInterval(meetTimer);
  if (calTimer) clearInterval(calTimer);
  meetTimer = null;
  calTimer = null;
  tray?.destroy();
  tray = null;
}

function create() {
  loadPrefs();
  const cursor = screen.getCursorScreenPoint();
  let start = loadPos();
  if (!start || !onADisplay(start.x, start.y)) {
    const nearest = screen.getDisplayNearestPoint(cursor);
    const saved = savedForDisplay(nearest);
    start = saved && onADisplay(saved.x, saved.y) ? saved : { x: cursor.x, y: cursor.y };
  }
  const a = workAreaAt(start.x, start.y);
  start.x = Math.min(a.x + a.width - 8, Math.max(a.x + 8, start.x));
  start.y = Math.min(a.y + a.height - 8, Math.max(a.y + 8, start.y));
  side = pickSide(start.x, start.y, a);
  const o = layout.ball[side];
  const startHidden = app.getLoginItemSettings().wasOpenedAsHidden;
  win = new BrowserWindow({
    width: layout.w,
    height: layout.h,
    x: Math.round(start.x - o.x),
    y: Math.round(start.y - o.y),
    show: !startHidden,
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
  visible = !startHidden;
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
    win.webContents.send("pet-visible", visible);
    win.webContents.send("pet-size", petSize);
    win.webContents.send("pet-auto-work", autoWork);
    win.webContents.send("pet-meeting", meeting);
    const b = ballScreen();
    placeWindow(b.x, b.y, side);
  });
  win.on("moved", () => {
    if (drag) return;
    savePos();
  });
  win.on("close", savePos);
  if (visible) startCursor();

  applyTrayMenu();
  startFocusWatch();
  wireDisplays();
  const appMenu = Menu.buildFromTemplate([
    {
      label: "GrokBot",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Hide GrokBot", click: () => setVisible(false) },
        { type: "separator" },
        { role: "quit", label: "Quit GrokBot" },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);
}

ipcMain.on("pet-move-by", (event, dx, dy) => {
  if (drag) return;
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w || typeof dx !== "number" || typeof dy !== "number") return;
  const b = ballScreen();
  const next = { x: b.x + dx, y: b.y + dy };
  const a = workAreaAt(next.x, next.y);
  next.x = Math.min(a.x + a.width - 8, Math.max(a.x + 8, next.x));
  next.y = Math.min(a.y + a.height - 8, Math.max(a.y + 8, next.y));
  placeWindow(next.x, next.y, pickSide(next.x, next.y, a));
});

ipcMain.on("pet-drag-start", () => startDrag());
ipcMain.handle("pet-drag-end", () => endDrag());

ipcMain.on("pet-click-through", (event, ignore) => {
  if (drag) return;
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  w.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on("pet-set-scene", (_e, next) => {
  if (next !== "work" && next !== "companion" && next !== "demo") return;
  scene = next;
  savePrefs();
  applyTrayMenu();
});

ipcMain.on("pet-set-mute", (_e, on) => {
  muted = Boolean(on);
  savePrefs();
  applyTrayMenu();
});

ipcMain.on("pet-set-size", (_e, id) => {
  if (!isPetSize(id) || id === petSize) return;
  applySize(id);
  applyTrayMenu();
});

ipcMain.on("pet-set-auto-work", (_e, on) => {
  autoWork = Boolean(on);
  savePrefs();
  applyTrayMenu();
});

ipcMain.on("pet-hide", () => setVisible(false));

ipcMain.on("pet-tray-icon", (_e, dataUrl) => {
  if (!tray || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) return;
  if (dataUrl.length > 400000) return;
  const now = Date.now();
  if (now - lastIconAt < 80) return;
  lastIconAt = now;
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return;
    img.setTemplateImage(false);
    tray.setImage(img.resize({ width: 22, height: 22 }));
  } catch {
    /* ignore */
  }
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
    else setVisible(true);
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
  else setVisible(true);
});
