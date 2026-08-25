import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, Notification } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { layoutFor, isPetSize } from "./layout.mjs";
import { notifyCopy, readCodexSnapshot, statusLabel } from "./codex.mjs";
import { buildDesk, detectMeetingState, detectMacScene, openAgent, scanGit } from "./desk.mjs";
import { createPomo, EMPTY_DESK, formatRemain } from "./desk-core.mjs";
import { grokBrief, grokEnv, grokStatus } from "./grok.mjs";
import { readGrokBotApp } from "./grok-bot-app.mjs";
import { openPerm, probePerms, resolvePerms } from "./perms.mjs";
import {
  NUDGE_MS,
  OVERLAY_MS,
  bannersQuiet,
  nextNudge,
  overlayAgentId,
  overlayWhisper,
  parseInbox,
  parseNudgeUrl,
  waitKey,
} from "./nudge.mjs";
import { AGENT_RANK, createGate, createLatch, soonHyst, stampMeeting, tickMeeting } from "./hysteresis.mjs";
import { applyPetUserData, companionIndex, petDataFile } from "./pet-paths.mjs";
import {
  BTN_POLL_MS,
  CURSOR_TICK_MS,
  DRAG_ARM_PX,
  DRAG_TICK_MS,
  ballRadius,
  cursorOverBall,
  dragWasMove,
  packagedChromiumSwitches,
  shouldArmDrag,
  shouldIgnoreMouse,
} from "./pet-input.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
applyPetUserData(app);
const POS_FILE = petDataFile(app, "pet-pos.json");
const PREFS_FILE = petDataFile(app, "pet-prefs.json");

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
let watchCodex = true;
let meeting = false;
let petSize = "l";
let layout = layoutFor("l");
let lastIconAt = 0;
let drag = null;
let dockOpen = false;
let overlayOn = false;
let rendererWantsClicks = false;
let lastIgnore = null;
let codexTimer = null;
let lastCodex = { status: "idle", label: "idle", name: "", threads: 0, processOn: false, tool: "", agents: [] };
let lastCodexNote = { status: "idle", at: 0 };
let codexReady = false;
let lastDesk = { ...EMPTY_DESK };
let lastMeetNote = "";
let lastGitNote = "";
let grokInfo = { available: false, source: "none" };
const pomo = createPomo();
let pomoTimer = null;
let lastCal = { on: false, next: null };
let focusWork = false;
let lastNudgeAt = 0;
let ackedWaitKey = "";
let overlay = null;
let skippedNote = null;
let wasQuiet = false;
let pollTick = 0;
let cachedGrok = { at: 0, value: { available: false, source: "none" } };
let cachedPerms = { at: 0, value: EMPTY_DESK.perms };
let dismissedPerms = new Set();
let cachedGit = { at: 0, key: "", value: [] };
let lastInboxMtime = 0;
const meetingGate = createGate({ enterMs: 0, exitMs: 16_000 });
const focusGate = createGate({ enterMs: 8_000, exitMs: 16_000 });
const quietGate = createGate({ enterMs: 0, exitMs: 15_000 });
const agentLatches = new Map();
const lastAgent = new Map();
let lastSoon = false;

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
    if (isPetSize(raw.size)) petSize = raw.size;
    if (typeof raw.autoWork === "boolean") autoWork = raw.autoWork;
    if (typeof raw.watchCodex === "boolean") watchCodex = raw.watchCodex;
    if (typeof raw.muted === "boolean") muted = raw.muted;
    if (raw.scene === "work" || raw.scene === "companion" || raw.scene === "demo") scene = raw.scene;
  } catch {
    /* ignore */
  }
  layout = layoutFor(petSize);
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify({ size: petSize, autoWork, watchCodex, muted, scene }));
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

function applyClickThrough() {
  if (!win || win.isDestroyed()) return;
  const overBall = cursorOverBall(screen.getCursorScreenPoint(), ballScreen(), ballRadius(layout.box, layout.faceScale));
  const ignore = shouldIgnoreMouse({
    dragging: Boolean(drag),
    dockOpen,
    overlayOn,
    overBall,
    rendererWantsClicks,
  });
  if (ignore === lastIgnore) return;
  lastIgnore = ignore;
  if (ignore) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
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
  lastIgnore = null;
  applyClickThrough();
  drag.timer = setInterval(followDrag, DRAG_TICK_MS);
  followDrag();
}

function followDrag() {
  if (!drag || !win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const travel = Math.hypot(cursor.x - drag.startX, cursor.y - drag.startY);
  const now = Date.now();
  if (now - drag.lastBtnCheck > BTN_POLL_MS) {
    drag.lastBtnCheck = now;
    readLeftButton().then((down) => {
      if (drag && down === false) forceEndDrag();
    });
  }
  if (!drag.armed && !shouldArmDrag(travel, DRAG_ARM_PX)) {
    if (cursorInWindow()) drag.outsideSince = 0;
    else if (!drag.outsideSince) drag.outsideSince = now;
    if (drag.outsideSince && now - drag.outsideSince > 8000) forceEndDrag();
    return;
  }
  if (!drag.armed) {
    drag.armed = true;
    lastIgnore = null;
    applyClickThrough();
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
  if (!drag.outsideSince) drag.outsideSince = now;
  if (now - drag.outsideSince > 8000) forceEndDrag();
}

function endDrag() {
  if (!drag) return { moved: false };
  const cursor = screen.getCursorScreenPoint();
  const travel = Math.hypot(cursor.x - drag.startX, cursor.y - drag.startY);
  const moved = dragWasMove({ armed: drag.armed, travel, armPx: DRAG_ARM_PX });
  if (drag.timer) clearInterval(drag.timer);
  drag = null;
  lastIgnore = null;
  if (win && !win.isDestroyed()) {
    const b = ballScreen();
    const a = workAreaAt(b.x, b.y);
    placeWindow(b.x, b.y, pickSide(b.x, b.y, a));
    savePos();
    applyClickThrough();
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
  applyMenus();
}

function setMutedState(on) {
  muted = Boolean(on);
  savePrefs();
  win?.webContents.send("pet-mute", muted);
  applyMenus();
}

function applyAppMenu() {
  const appMenu = Menu.buildFromTemplate([
    {
      label: "GrokBot",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: lastDesk.digest || "What's up",
          click: () => void speakBrief(false),
        },
        {
          label: grokInfo.available ? "Grok Brief" : "Grok Brief (install grok CLI)",
          enabled: true,
          click: () => void speakBrief(true),
        },
        {
          label: pomo.snap().running
            ? `Focus ${formatRemain(pomo.snap().remainingMs)}`
            : pomo.snap().phase === "break"
              ? `Break ${formatRemain(pomo.snap().remainingMs)}`
              : "Start Focus",
          click: () => togglePomo(),
        },
        { type: "separator" },
        {
          label: "Mute",
          type: "checkbox",
          checked: muted,
          click: (item) => setMutedState(item.checked),
        },
        {
          label: visible ? "Hide GrokBot" : "Show GrokBot",
          click: () => toggleVisible(),
        },
        { type: "separator" },
        { role: "quit", label: "Quit GrokBot" },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);
}

function applyMenus() {
  applyTrayMenu();
  applyAppMenu();
}

function applyTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  const p = pomo.snap();
  const menu = Menu.buildFromTemplate([
    {
      label: lastDesk.digest || "What's up",
      click: () => void speakBrief(false),
    },
    {
      label: grokInfo.available ? "Grok Brief" : "Grok Brief (uses grok CLI)",
      click: () => void speakBrief(true),
    },
    {
      label: p.running
        ? `Focus ${formatRemain(p.remainingMs)}`
        : p.phase === "break"
          ? `Break ${formatRemain(p.remainingMs)}`
          : "Start Focus",
      click: () => togglePomo(),
    },
    { type: "separator" },
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
        applyMenus();
      },
    },
    {
      label: "Medium",
      type: "radio",
      checked: petSize === "m",
      click: () => {
        applySize("m");
        win?.webContents.send("pet-size", "m");
        applyMenus();
      },
    },
    {
      label: "Large",
      type: "radio",
      checked: petSize === "l",
      click: () => {
        applySize("l");
        win?.webContents.send("pet-size", "l");
        applyMenus();
      },
    },
    { type: "separator" },
    {
      label: "Mute",
      type: "checkbox",
      checked: muted,
      click: (item) => setMutedState(item.checked),
    },
    {
      label: "Agents Watch",
      type: "checkbox",
      checked: watchCodex,
      click: (item) => {
        watchCodex = item.checked;
        savePrefs();
        win?.webContents.send("pet-codex-watch", watchCodex);
        applyMenus();
        void pollDesk();
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
        applyMenus();
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
    tray.on("click", () => toggleVisible());
  }
  tray.setToolTip(lastDesk.digest && lastDesk.digest !== "All quiet." ? `GrokBot · ${lastDesk.digest}` : "GrokBot");
  tray.setContextMenu(menu);
  applyAppMenu();
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
    applyClickThrough();
  }, CURSOR_TICK_MS);
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

function runExec(bin, args, timeout) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, env: grokEnv() }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || "") });
    });
  });
}

function runCmd(bin, args, timeout) {
  return runExec(bin, args, timeout).then((r) => (r.ok ? r.out : ""));
}

function runPermProbe(bin, args, timeout) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, env: grokEnv() }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        out: String(stdout || ""),
        err: String(stderr || err?.message || ""),
        timedOut: Boolean(err && (err.killed || err.code === "ETIMEDOUT")),
      });
    });
  });
}

function latchAgents(agents, now) {
  const seen = new Set();
  const out = [];
  for (const a of agents || []) {
    seen.add(a.id);
    let L = agentLatches.get(a.id);
    if (!L) {
      L = createLatch({ rank: AGENT_RANK, enterMs: 0, exitMs: 12_000 });
      agentLatches.set(a.id, L);
    }
    const status = L.sample(a.status, now);
    const row = status === a.status ? a : { ...a, status, label: statusLabel(status) };
    lastAgent.set(a.id, row);
    out.push(row);
  }
  for (const [id, L] of agentLatches) {
    if (seen.has(id)) continue;
    const held = L.sample("idle", now);
    if (held === "idle") {
      agentLatches.delete(id);
      lastAgent.delete(id);
      continue;
    }
    const prev = lastAgent.get(id);
    if (prev) out.push({ ...prev, status: held, label: statusLabel(held) });
  }
  return out;
}

function emitMeeting(on) {
  if (meeting === on) return;
  meeting = on;
  win?.webContents.send("pet-meeting", meeting);
}

function currentQuiet() {
  return Boolean(lastDesk.quiet) || bannersQuiet({ meeting, meetingOn: lastDesk.meeting?.on, pomo: pomo.snap() });
}

function showNote(title, body, onClick) {
  if (currentQuiet()) {
    skippedNote = { title, body, onClick };
    return;
  }
  skippedNote = null;
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({ title, body, silent: muted });
    if (typeof onClick === "function") n.on("click", onClick);
    n.show();
  } catch {
    /* ignore */
  }
}

function inboxPath() {
  return petDataFile(app, "inbox.json");
}

function applyExternalNudge(msg, { poll = true } = {}) {
  if (!msg) return;
  if (msg.kind === "open") {
    void jumpToAgent(msg.id || "grok-bot");
    return;
  }
  overlay = { ...msg, at: Date.now() };
  ackedWaitKey = "";
  lastNudgeAt = Date.now();
  win?.webContents.send("pet-whisper", overlayWhisper(msg));
  if (poll) void pollDesk();
}

function readInbox() {
  const file = inboxPath();
  try {
    const st = fs.statSync(file);
    if (st.mtimeMs <= lastInboxMtime) return;
    lastInboxMtime = st.mtimeMs;
    const msg = parseInbox(fs.readFileSync(file, "utf8"));
    if (msg) applyExternalNudge(msg, { poll: false });
  } catch {
    /* none */
  }
}

function installNudgeHook() {
  const src = path.join(here, "../mac/nudge-grokbot.sh");
  try {
    const dest = petDataFile(app, "nudge-grokbot.sh");
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  } catch {
    /* ignore */
  }
  const grokDir = path.join(os.homedir(), ".grok", "hooks");
  try {
    if (fs.existsSync(path.join(os.homedir(), ".grok"))) {
      fs.mkdirSync(grokDir, { recursive: true });
      const dest = path.join(grokDir, "grokbot-nudge.sh");
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, 0o755);
    }
  } catch {
    /* ignore */
  }
}

function handleNudgeUrl(raw) {
  const msg = parseNudgeUrl(raw);
  if (msg) applyExternalNudge(msg);
}

function emitDesk(desk, { silent = false } = {}) {
  lastDesk = desk;
  win?.webContents.send("pet-desk", desk);
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(desk.digest && desk.digest !== "All quiet." ? `GrokBot · ${desk.digest}` : "GrokBot");
  }
  if (silent) return;
  const next = desk.meeting?.next;
  if (next && next.minutes >= 0 && !desk.meeting.on) {
    const bucket = next.minutes <= 5 ? 5 : 15;
    const key = `${next.title}|${bucket}`;
    if (key !== lastMeetNote) {
      lastMeetNote = key;
      showNote(bucket === 5 ? "Stand up" : "Coming up", `${next.title} in ${next.minutes}m`, () => {
        void runCmd("open", ["-a", "Calendar"], 2000);
      });
    }
  }
  const fail = (desk.git || []).find((g) => g.tests === "fail");
  if (fail) {
    const key = `${fail.repo}-fail`;
    if (key !== lastGitNote) {
      lastGitNote = key;
      showNote("Tests failed", `${fail.repo} is red`);
    }
  } else if ((desk.git || []).some((g) => g.tests === "pass")) {
    lastGitNote = "";
  }
}

function emitCodex(snap, silent = false) {
  lastCodex = snap;
  win?.webContents.send("pet-codex", snap);
  const grokAlert = (snap.agents || []).some(
    (a) => a.id === "grok-bot" && (a.status === "waiting" || a.status === "error" || a.status === "done"),
  );
  if (silent) {
    lastCodexNote = { status: snap.status, at: Date.now() };
    return;
  }
  if (!watchCodex && !grokAlert) return;
  if (snap.status !== "waiting" && snap.status !== "done" && snap.status !== "error") return;
  const now = Date.now();
  if (snap.status === lastCodexNote.status && now - lastCodexNote.at < 20_000) return;
  lastCodexNote = { status: snap.status, at: now };
  const copy = notifyCopy(snap.status, snap.name, snap.threads, snap.tool || "Agents");
  if (!copy) return;
  const agentId = snap.agents?.[0]?.id || "";
  showNote(copy.title, copy.body, () => {
    void jumpToAgent(agentId);
  });
}

async function jumpToAgent(id) {
  setVisible(true);
  const agent = (lastDesk.agents || lastCodex.agents || []).find((a) => a.id === id);
  await openAgent(id, { runExec, cwd: agent?.path || "" });
}

async function pollDesk({ withCal = false } = {}) {
  if (drag) return;
  try {
    pollTick += 1;
    const now = Date.now();
    readInbox();
    if (overlay && now - overlay.at > OVERLAY_MS) overlay = null;

    if (now - cachedGrok.at > 60_000) {
      grokInfo = await grokStatus(runCmd);
      cachedGrok = { at: now, value: grokInfo };
    } else grokInfo = cachedGrok.value;

    const sceneJob =
      process.platform === "darwin"
        ? detectMacScene(runCmd)
        : Promise.resolve({
            focus: lastDesk.focus,
            meetingApp: meeting,
            grokBotWindows: "",
            grokBotWaiting: false,
          });
    const wantCal = withCal || pollTick % 8 === 1;
    const jobs = [
      watchCodex ? readCodexSnapshot({ runCmd }) : Promise.resolve({ ...lastCodex, agents: (lastCodex.agents || []).filter((a) => a.id === "grok-bot") }),
      sceneJob,
    ];
    if (wantCal) jobs.push(detectMeetingState(runCmd));
    const [agentsSnap, scene, calMaybe] = await Promise.all(jobs);
    if (wantCal && calMaybe) lastCal = stampMeeting(calMaybe, now);
    const cal = tickMeeting(lastCal, now);
    const focus = scene.focus || lastDesk.focus || { app: "", workish: false };
    const sceneOk = Boolean(scene.focus?.app || scene.grokBotWindows);
    const grokBot = await readGrokBotApp({
      runCmd,
      skipFiles: pollTick % 3 !== 1,
      windows: sceneOk ? scene.grokBotWindows : undefined,
    });
    if (scene.grokBotWaiting) {
      grokBot.status = "waiting";
      grokBot.label = "needs you";
      grokBot.threads = Math.max(grokBot.threads, 1);
    }
    const rawAgents = (agentsSnap.agents || []).filter((a) => a.id !== "grok-bot");
    if (grokBot.status !== "idle") rawAgents.unshift(grokBot);
    const overlayId = overlayAgentId(overlay?.tool);
    if (
      overlay &&
      (overlay.status === "waiting" || overlay.status === "error") &&
      !rawAgents.some((a) => a.id === overlayId && a.status === overlay.status)
    ) {
      rawAgents.unshift({
        id: overlayId,
        name: overlay.tool || "Grok Bot",
        status: overlay.status,
        label: overlay.status === "error" ? "error" : "needs you",
        threads: 1,
        cwd: overlay.name || "",
        path: "",
        processOn: true,
      });
    }
    const agents = latchAgents(rawAgents, now);
    const merged = {
      ...agentsSnap,
      agents,
      status: agents[0]?.status || "idle",
      tool: agents[0]?.name || agentsSnap.tool,
      name: agents[0]?.cwd || agentsSnap.name,
    };
    if (watchCodex || agents.some((a) => a.id === "grok-bot")) {
      if (!codexReady) {
        codexReady = true;
        const keepQuiet = merged.status !== "waiting" && merged.status !== "error";
        emitCodex(merged, keepQuiet);
      } else {
        const changed =
          merged.status !== lastCodex.status ||
          merged.threads !== lastCodex.threads ||
          merged.name !== lastCodex.name;
        if (changed) emitCodex(merged, currentQuiet() && merged.status !== "error");
      }
    }

    const key = waitKey(merged);
    const nudge = nextNudge({ status: merged.status, key, now, lastNudgeAt, ackedKey: ackedWaitKey, interval: NUDGE_MS });
    if (nudge.reset) {
      lastNudgeAt = 0;
      ackedWaitKey = "";
    } else if (nudge.fire) {
      lastNudgeAt = now;
      if (!nudge.first) win?.webContents.send("pet-nudge", { tool: merged.tool, name: merged.name, repeat: true });
    }

    focusWork = focusGate.sample(Boolean(focus.workish), now);
    const meetingOn = meetingGate.sample(Boolean(scene.meetingApp || cal.on), now);
    emitMeeting(meetingOn);
    const next = cal.next;
    lastSoon = soonHyst(next?.minutes, lastSoon);
    const meetingSnap = { on: meetingOn, next: lastSoon ? next : meetingOn ? next : null };

    const permTtl = cachedPerms.value?.missing?.length ? 20_000 : 90_000;
    if (now - cachedPerms.at > permTtl) {
      const nextPerms = await probePerms(runPermProbe, {
        grokBotRunning: grokBot.processOn,
        sceneOk,
        calendarProbed: Boolean(wantCal && calMaybe?.probed),
      });
      cachedPerms = {
        at: now,
        value: resolvePerms(nextPerms, { previous: cachedPerms.value, dismissed: dismissedPerms }),
      };
    }

    const cwds = agents.map((a) => a.path).filter(Boolean);
    const gitKey = cwds.join("|");
    if (gitKey !== cachedGit.key || now - cachedGit.at > 30_000) {
      cachedGit = { at: now, key: gitKey, value: gitKey ? await scanGit(cwds, runCmd) : [] };
    }

    const quiet = quietGate.sample(bannersQuiet({ meeting: meetingOn, meetingOn, pomo: pomo.snap() }), now);
    if (wasQuiet && !quiet && skippedNote && merged.status === "waiting") {
      const pending = skippedNote;
      skippedNote = null;
      showNote(pending.title, pending.body, pending.onClick);
    }
    wasQuiet = quiet;

    const desk = buildDesk({
      agents,
      meeting: meetingSnap,
      focus: { ...focus, workish: focusWork },
      git: cachedGit.value,
      pomo: pomo.snap(),
      grok: { available: grokInfo.available, source: grokInfo.source },
      perms: cachedPerms.value,
      quiet,
    });
    emitDesk(desk);
    win?.webContents.send("pet-focus", focusWork);
  } catch (err) {
    console.error("pollDesk", err);
  }
}

function tickPomo() {
  const snap = pomo.tick();
  lastDesk = { ...lastDesk, pomo: snap, digest: lastDesk.digest };
  const desk = buildDesk({
    agents: lastDesk.agents,
    meeting: lastDesk.meeting,
    focus: lastDesk.focus,
    git: lastDesk.git,
    pomo: snap,
    grok: lastDesk.grok,
    perms: lastDesk.perms,
    quiet: currentQuiet(),
  });
  emitDesk(desk, { silent: true });
  if (snap.justEnded === "work") {
    showNote("Break", "Focus block done. Five minutes.");
    win?.webContents.send("pet-pomo-ended", "work");
    applyMenus();
  } else if (snap.justEnded === "break") {
    showNote("Back", "Break's over.");
    win?.webContents.send("pet-pomo-ended", "break");
    stopPomoClock();
    applyMenus();
  }
}

function startPomoClock() {
  if (pomoTimer) return;
  pomoTimer = setInterval(tickPomo, 1000);
}

function stopPomoClock() {
  if (!pomoTimer) return;
  clearInterval(pomoTimer);
  pomoTimer = null;
}

function togglePomo() {
  const snap = pomo.toggle();
  if (snap.running) startPomoClock();
  else if (snap.phase === "idle") stopPomoClock();
  const desk = buildDesk({
    agents: lastDesk.agents,
    meeting: lastDesk.meeting,
    focus: lastDesk.focus,
    git: lastDesk.git,
    pomo: snap,
    grok: lastDesk.grok,
    perms: lastDesk.perms,
    quiet: currentQuiet(),
  });
  emitDesk(desk, { silent: true });
  applyMenus();
  return snap;
}

function skipPomo() {
  const snap = pomo.skip();
  if (snap.phase === "break" && snap.running) startPomoClock();
  else stopPomoClock();
  const desk = buildDesk({
    agents: lastDesk.agents,
    meeting: lastDesk.meeting,
    focus: lastDesk.focus,
    git: lastDesk.git,
    pomo: snap,
    grok: lastDesk.grok,
    perms: lastDesk.perms,
    quiet: currentQuiet(),
  });
  emitDesk(desk, { silent: true });
  applyMenus();
  return snap;
}

async function speakBrief(useGrok) {
  setVisible(true);
  let text = lastDesk.digest || "All quiet.";
  if (useGrok) {
    const result = await grokBrief(text, { runCmd });
    if (result.text) text = result.text;
  }
  win?.webContents.send("pet-whisper", text);
  showNote("GrokBot", text);
  return text;
}

function startFocusWatch() {}

function startCodexWatch() {
  if (codexTimer) return;
  void pollDesk({ withCal: true });
  codexTimer = setInterval(() => void pollDesk(), 8_000);
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
  stopPomoClock();
  if (meetTimer) clearInterval(meetTimer);
  if (calTimer) clearInterval(calTimer);
  if (codexTimer) clearInterval(codexTimer);
  meetTimer = null;
  calTimer = null;
  codexTimer = null;
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
  lastIgnore = null;
  applyClickThrough();
  win.loadFile(companionIndex(here), { query: { pet: "1" } });
  win.webContents.on("did-finish-load", () => {
    win.webContents.send("pet-side", side);
    win.webContents.send("pet-visible", visible);
    win.webContents.send("pet-scene", scene);
    win.webContents.send("pet-mute", muted);
    win.webContents.send("pet-size", petSize);
    win.webContents.send("pet-auto-work", autoWork);
    win.webContents.send("pet-codex-watch", watchCodex);
    win.webContents.send("pet-codex", lastCodex);
    win.webContents.send("pet-desk", lastDesk);
    win.webContents.send("pet-meeting", meeting);
    win.webContents.send("pet-focus", focusWork);
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
  installNudgeHook();
  startFocusWatch();
  startCodexWatch();
  wireDisplays();
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

ipcMain.on("pet-click-through", (_event, ignore) => {
  rendererWantsClicks = !Boolean(ignore);
  applyClickThrough();
});

ipcMain.on("pet-dock", (_event, open) => {
  dockOpen = Boolean(open);
  applyClickThrough();
});

ipcMain.on("pet-overlay", (_event, on) => {
  overlayOn = Boolean(on);
  applyClickThrough();
});

ipcMain.on("pet-set-scene", (_e, next) => {
  if (next !== "work" && next !== "companion" && next !== "demo") return;
  scene = next;
  savePrefs();
  applyTrayMenu();
});

ipcMain.on("pet-set-mute", (_e, on) => {
  setMutedState(on);
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

ipcMain.on("pet-set-codex-watch", (_e, on) => {
  watchCodex = Boolean(on);
  savePrefs();
  applyTrayMenu();
  void pollDesk();
});

ipcMain.on("pet-hide", () => setVisible(false));

ipcMain.handle("pet-brief", (_e, useGrok) => speakBrief(Boolean(useGrok)));
ipcMain.on("pet-pomo-toggle", () => togglePomo());
ipcMain.on("pet-pomo-skip", () => skipPomo());
ipcMain.on("pet-open-agent", (_e, id) => {
  if (typeof id === "string" && id) {
    const waiting = (lastDesk.agents || []).find((a) => a.id === id && a.status === "waiting");
    if (waiting) ackedWaitKey = waitKey({ status: "waiting", tool: waiting.name, name: waiting.cwd });
    void jumpToAgent(id);
  }
});
ipcMain.on("pet-ack-agent", (_e, id) => {
  const waiting = (lastDesk.agents || []).find((a) => a.id === id) || lastDesk.agents?.find((a) => a.status === "waiting");
  if (waiting) ackedWaitKey = waitKey({ status: "waiting", tool: waiting.name, name: waiting.cwd });
  else ackedWaitKey = waitKey(lastCodex);
});
ipcMain.on("pet-open-perm", (_e, id) => {
  if (typeof id !== "string" || !id) return;
  dismissedPerms.add(id);
  cachedPerms = {
    at: 0,
    value: resolvePerms(cachedPerms.value || EMPTY_DESK.perms, {
      previous: cachedPerms.value,
      dismissed: dismissedPerms,
    }),
  };
  emitDesk(
    buildDesk({
      agents: lastDesk.agents,
      meeting: lastDesk.meeting,
      focus: lastDesk.focus,
      git: lastDesk.git,
      pomo: lastDesk.pomo,
      grok: lastDesk.grok,
      perms: cachedPerms.value,
      quiet: lastDesk.quiet,
    }),
    { silent: true },
  );
  void openPerm(id, { runExec, runCmd });
});

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

if (app.isPackaged) {
  for (const flag of packagedChromiumSwitches()) app.commandLine.appendSwitch(flag);
}

if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient("grokbot", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("grokbot");
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleNudgeUrl(url);
});

const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const url = (argv || []).find((a) => String(a).startsWith("grokbot:"));
    if (url) handleNudgeUrl(url);
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
