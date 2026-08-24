import { GrokBotEngine } from "./engine";
import {
  FACE_PRESETS,
  GROK_BLUE,
  drawColorWheel,
  hexToHsv,
  hitColorWheel,
  hsvToHex,
  resolveFaceHex,
  type MoodId,
} from "./color";
import { drawGrokBot, type ThemeColors } from "./renderer";
import { readScene, SCENES, isSceneId, type SceneId } from "./scenes";
import { isMuted, onMute, playSfx, setMuted } from "./sfx";
import { BOT_SIZES } from "./sizes";
import { registerEngine } from "./registry";
import {
  PET_SIZES,
  inWorkHours,
  isPetSize,
  layoutFor,
  readAutoWork,
  readCodexWatch,
  readPetSize,
  writeAutoWork,
  writeCodexWatch,
  writePetSize,
  type PetSizeId,
} from "./layout";
import {
  composeDigest,
  createPomo,
  demoDesk,
  formatRemain,
  type DeskSnap,
} from "./desk";

export const HOLD_MS = 220;
export const TAP_MS = 280;
export const DBL_MS = 340;
export const DRAG_ARM_PX = 6;
export const COLOR_KEY = "grok-face-color";
export const POS_KEY = "grok-companion-pos";

export type DockSide = "bottom" | "top" | "left" | "right";

const first = layoutFor("l");
export const STAGE = { w: first.w, h: first.h };
export const BALL_IN_STAGE: Record<DockSide, { x: number; y: number }> = {
  bottom: { ...first.ball.bottom },
  top: { ...first.ball.top },
  right: { ...first.ball.right },
  left: { ...first.ball.left },
};

function adoptLayout(id: PetSizeId) {
  const L = layoutFor(id);
  STAGE.w = L.w;
  STAGE.h = L.h;
  BALL_IN_STAGE.bottom = L.ball.bottom;
  BALL_IN_STAGE.top = L.ball.top;
  BALL_IN_STAGE.right = L.ball.right;
  BALL_IN_STAGE.left = L.ball.left;
  return L;
}

export type Area = { x: number; y: number; w: number; h: number };

export function pickDockSide(bx: number, by: number, area: Area, edge = 110): DockSide {
  const l = bx - area.x;
  const r = area.x + area.w - bx;
  const t = by - area.y;
  const b = area.y + area.h - by;
  if (b < edge && b <= t) return "top";
  if (t < edge && t < b) return "bottom";
  if (l < edge && l <= r) return "right";
  if (r < edge && r < l) return "left";
  return "bottom";
}

export function clampPoint(x: number, y: number, area: Area, pad = 8) {
  return {
    x: Math.min(area.x + area.w - pad, Math.max(area.x + pad, x)),
    y: Math.min(area.y + area.h - pad, Math.max(area.y + pad, y)),
  };
}

export function gazeFromRect(
  clientX: number,
  clientY: number,
  r: { left: number; top: number; width: number; height: number },
) {
  const nx = Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / Math.max(72, r.width * 0.42)));
  const ny = Math.max(-1, Math.min(1, (clientY - (r.top + r.height / 2)) / Math.max(72, r.height * 0.42)));
  return { x: nx, y: ny };
}

export function readFaceColor() {
  try {
    return localStorage.getItem(COLOR_KEY) || GROK_BLUE;
  } catch {
    return GROK_BLUE;
  }
}

export function writeFaceColor(hex: string) {
  try {
    localStorage.setItem(COLOR_KEY, hex);
  } catch {
    /* ignore */
  }
}

export type GestureKind = "none" | "tap" | "dbl" | "drag";

export function createPetGesture() {
  let press: {
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    timer: number;
    moved: boolean;
  } | null = null;
  let tapAt = 0;
  let tapTimer = 0;
  let holding = false;

  return {
    get holding() {
      return holding;
    },
    get dragging() {
      return Boolean(press?.moved);
    },
    get pressed() {
      return Boolean(press);
    },
    markMoved() {
      if (!press) return;
      press.moved = true;
      holding = true;
    },
    onDown(e: { screenX: number; screenY: number; clientX: number; clientY: number }) {
      press = {
        sx: e.screenX,
        sy: e.screenY,
        ox: e.screenX,
        oy: e.screenY,
        moved: false,
        timer: window.setTimeout(() => {
          if (!press) return;
          holding = true;
        }, HOLD_MS),
      };
    },
    onMove(e: { screenX: number; screenY: number; clientX: number; clientY: number }) {
      if (!press) return null;
      const travel = Math.hypot(e.screenX - press.ox, e.screenY - press.oy);
      if (!press.moved && travel < DRAG_ARM_PX) return null;
      press.moved = true;
      holding = true;
      const dx = e.screenX - press.sx;
      const dy = e.screenY - press.sy;
      press.sx = e.screenX;
      press.sy = e.screenY;
      return { dx, dy, clientX: e.clientX, clientY: e.clientY };
    },
    onUp(): GestureKind {
      if (press) window.clearTimeout(press.timer);
      const p = press;
      press = null;
      holding = false;
      if (!p) return "none";
      if (p.moved) return "drag";
      const now = performance.now();
      if (now - tapAt < DBL_MS) {
        window.clearTimeout(tapTimer);
        tapAt = 0;
        return "dbl";
      }
      tapAt = now;
      return "tap";
    },
    scheduleTap(fn: () => void) {
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(fn, TAP_MS);
    },
    cancelTap() {
      window.clearTimeout(tapTimer);
    },
    dispose() {
      if (press) window.clearTimeout(press.timer);
      window.clearTimeout(tapTimer);
      press = null;
      holding = false;
    },
  };
}

const THEME: ThemeColors = {
  ink: "#161513",
  paper: "#f3f1ea",
  grok: "#1b56f3",
  eye: "#fffdf8",
  muted: "#6e6a62",
};

const ACTIONS: { id: string; label: string; run: (engine: GrokBotEngine) => void }[] = [
  { id: "idle", label: "Idle", run: (e) => e.reset() },
  { id: "blink", label: "Blink", run: (e) => e.blink() },
  { id: "look", label: "Look", run: (e) => e.play("look", { force: true }) },
  { id: "joy", label: "Joy", run: (e) => e.setExpression(5, { hold: 4 }) },
  { id: "think", label: "Think", run: (e) => e.play("think", { force: true }) },
  { id: "wow", label: "Wow", run: (e) => e.play("exclaim", { force: true }) },
  { id: "orbit", label: "Orbit", run: (e) => e.play("orbits", { force: true }) },
  { id: "bounce", label: "Bounce", run: (e) => e.bounceOnce() },
  { id: "tour", label: "Tour", run: (e) => e.setScene("demo") },
];

const STYLE_ID = "grok-pet-style";

const PET_CSS = `
.grok-stage {
  position: relative;
  width: var(--stage-w, 580px);
  height: var(--stage-h, 600px);
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
.grok-stage .face,
.grok-stage .dock { pointer-events: auto; }
.grok-stage .face {
  position: absolute;
  width: var(--face-box, 440px);
  height: var(--face-box, 440px);
  cursor: grab;
  touch-action: none;
}
.grok-stage .face.hold { transform: scale(1.04); }
.grok-stage .face:active { cursor: grabbing; }
.grok-stage canvas.bot { display: block; width: 100%; height: 100%; }
.grok-stage #wheel { display: block; width: 64px; height: 64px; cursor: crosshair; }
.grok-stage .dock {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}
.grok-stage .whisper { order: 1; }
.grok-stage .agents { order: 2; }
.grok-stage .desk { order: 3; }
.grok-stage #actions { order: 4; }
.grok-stage #scenes { order: 5; }
.grok-stage #prefs { order: 6; }
.grok-stage #wheel,
.grok-stage .presets { order: 7; }
.grok-stage[data-side="top"] .dock { flex-direction: column-reverse; }
.grok-stage #prefs button.dim { opacity: 0.62; }
.grok-stage.open .dock {
  opacity: 1;
  pointer-events: auto;
}
.grok-stage .presets { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.grok-stage .presets button {
  width: 14px; height: 14px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.35);
  padding: 0; cursor: pointer;
}
.grok-stage .bar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
  gap: 1px;
  padding: 4px 6px;
  background: rgba(22, 21, 19, 0.55);
  border-radius: 999px;
  backdrop-filter: blur(16px);
  white-space: nowrap;
}
.grok-stage .bar button {
  border: 0;
  background: transparent;
  color: #fffcf6;
  font: 500 9px/1 "SF Pro Text", "Helvetica Neue", sans-serif;
  padding: 6px 6px;
  border-radius: 999px;
  cursor: pointer;
  flex: none;
}
.grok-stage .bar button:hover { background: rgba(255,255,255,0.12); }
.grok-stage .presets button.on {
  box-shadow: 0 0 0 2px #fffcf6;
}
.grok-stage .bar button.on { background: rgba(255,255,255,0.2); }
.grok-stage #prefs { flex-wrap: wrap; }
.grok-stage .watch {
  max-width: 220px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(27, 86, 243, 0.62);
  color: #fffcf6;
  font: 500 10px/1.3 "SF Pro Text", "Helvetica Neue", sans-serif;
  text-align: center;
}
.grok-stage .watch[hidden] { display: none; }
.grok-stage .whisper {
  max-width: 260px;
  padding: 6px 12px;
  border-radius: 14px;
  background: rgba(22, 21, 19, 0.62);
  color: #fffcf6;
  font: 500 11px/1.35 "SF Pro Text", "Helvetica Neue", sans-serif;
  text-align: center;
}
.grok-stage .whisper[hidden] { display: none; }
.grok-stage .agents,
.grok-stage .desk {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  max-width: 280px;
}
.grok-stage .agents[hidden],
.grok-stage .desk[hidden] { display: none; }
.grok-stage .agents button,
.grok-stage .desk .chip {
  border: 0;
  border-radius: 999px;
  padding: 4px 8px;
  font: 500 10px/1.2 "SF Pro Text", "Helvetica Neue", sans-serif;
  color: #fffcf6;
  background: rgba(27, 86, 243, 0.62);
  cursor: pointer;
}
.grok-stage .agents button.wait { background: rgba(201, 140, 40, 0.78); }
.grok-stage .agents button.err { background: rgba(180, 50, 40, 0.78); }
.grok-stage .agents button.done { background: rgba(40, 140, 80, 0.72); }
.grok-stage .desk .chip {
  cursor: default;
  background: rgba(22, 21, 19, 0.5);
}
.grok-stage .desk button.chip { cursor: pointer; }
.grok-stage .desk .chip.fail { background: rgba(180, 50, 40, 0.75); }
.grok-stage .desk .chip.warn { background: rgba(201, 140, 40, 0.75); }
.grok-stage .studio {
  border-radius: 999px;
  background: rgba(22, 21, 19, 0.4);
  color: rgba(255,252,246,0.85);
  font: 500 11px/1 "SF Pro Text", "Helvetica Neue", sans-serif;
  padding: 6px 10px;
  text-decoration: none;
  backdrop-filter: blur(12px);
}
.grok-stage .studio:hover { background: rgba(22, 21, 19, 0.6); }
.grok-stage[data-side="bottom"] .face { left: var(--face-inset, 70px); top: 0; }
.grok-stage[data-side="bottom"] .dock { left: 0; right: 0; top: var(--dock-main, 400px); }
.grok-stage[data-side="top"] .face { left: var(--face-inset, 70px); bottom: 0; top: auto; }
.grok-stage[data-side="top"] .dock { left: 0; right: 0; bottom: var(--dock-main, 400px); top: auto; }
.grok-stage[data-side="right"] .face { left: 0; top: var(--face-side-top, 80px); }
.grok-stage[data-side="right"] .dock {
  left: var(--dock-main, 400px); top: 50%; transform: translateY(-50%);
  width: 168px;
}
.grok-stage[data-side="left"] .face { right: 0; left: auto; top: var(--face-side-top, 80px); }
.grok-stage[data-side="left"] .dock {
  right: var(--dock-main, 400px); left: auto; top: 50%; transform: translateY(-50%);
  width: 168px;
}
.grok-stage[data-side="right"] .bar,
.grok-stage[data-side="left"] .bar {
  flex-direction: column;
  border-radius: 16px;
  white-space: normal;
  padding: 6px 8px;
}
.grok-stage[data-side="right"] .bar button,
.grok-stage[data-side="left"] .bar button {
  width: 100%;
  text-align: center;
  padding: 5px 8px;
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = PET_CSS;
  document.head.appendChild(el);
}

function ensureStage(root: HTMLElement) {
  let stage =
    root.id === "stage" || root.classList.contains("grok-stage")
      ? root
      : root.querySelector<HTMLDivElement>("#stage") ||
        root.querySelector<HTMLDivElement>(".grok-stage");
  if (!stage) {
    stage = document.createElement("div");
    stage.id = "stage";
    root.appendChild(stage);
  }
  stage.classList.add("grok-stage");
  if (!stage.dataset.side) stage.dataset.side = "bottom";
  if (!stage.querySelector("#face")) {
    stage.replaceChildren();
    stage.insertAdjacentHTML(
      "afterbegin",
      `<div class="face" id="drag">
        <canvas id="face" class="bot" aria-label="Grok Bot"></canvas>
      </div>
      <div class="dock" id="dock">
        <canvas id="wheel" width="108" height="108" aria-label="Body color"></canvas>
        <div class="presets" id="presets"></div>
        <div class="bar" id="scenes"></div>
        <div class="bar" id="actions"></div>
        <div class="bar" id="prefs"></div>
        <div class="whisper" id="whisper" hidden></div>
        <div class="agents" id="agents" hidden></div>
        <div class="desk" id="desk" hidden></div>
        <a class="studio" id="studio" hidden>Studio</a>
      </div>`,
    );
  } else {
    const dock = stage.querySelector("#dock");
    if (dock && !stage.querySelector("#whisper")) {
      dock.querySelector("#watch")?.remove();
      dock.insertAdjacentHTML(
        "beforeend",
        `<div class="whisper" id="whisper" hidden></div>
        <div class="agents" id="agents" hidden></div>
        <div class="desk" id="desk" hidden></div>`,
      );
    }
  }
  return stage;
}

export type BootOptions = {
  root?: HTMLElement | null;
  studioHref?: string;
};

export function bootMacCompanion(opts: BootOptions = {}) {
  injectStyle();

  const pet = Boolean(window.pet?.isPet || new URLSearchParams(location.search).has("pet"));
  const web = !pet;
  if (pet) document.documentElement.classList.add("pet");

  const host = opts.root ?? document.querySelector<HTMLElement>("#stage") ?? document.body;
  const stage = ensureStage(host);
  const engine = new GrokBotEngine();
  engine.setScene(readScene());
  registerEngine(engine);

  let faceHex = readFaceColor();
  engine.setFaceColor(faceHex);

  const wrap = stage.querySelector<HTMLElement>("#drag")!;
  const canvas = stage.querySelector<HTMLCanvasElement>("#face")!;
  const dock = stage.querySelector<HTMLDivElement>("#dock")!;
  const wheel = stage.querySelector<HTMLCanvasElement>("#wheel")!;
  const presets = stage.querySelector<HTMLDivElement>("#presets")!;
  const sceneBar = stage.querySelector<HTMLDivElement>("#scenes")!;
  const actionBar = stage.querySelector<HTMLDivElement>("#actions")!;
  const prefBar = stage.querySelector<HTMLDivElement>("#prefs");
  const whisperEl = stage.querySelector<HTMLDivElement>("#whisper");
  const agentsEl = stage.querySelector<HTMLDivElement>("#agents");
  const deskEl = stage.querySelector<HTMLDivElement>("#desk");
  const studio = stage.querySelector<HTMLAnchorElement>("#studio");
  const menuBot = document.querySelector<HTMLCanvasElement>("#menu-bot");

  const gesture = createPetGesture();
  let dockOpen = false;
  let raf = 0;
  let disposed = false;
  let loopOn = false;
  let pos = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };
  let last = { x: 0, y: 0, t: 0 };
  let dragging = false;
  let inertiaRaf = 0;
  let webSide: DockSide = "bottom";
  const faceCtx = canvas.getContext("2d");
  const wheelCtx = wheel.getContext("2d");
  const menuCtx = menuBot?.getContext("2d") ?? null;

  const setThrough = (on: boolean) => window.pet?.setClickThrough?.(on);
  if (pet) setThrough(true);

  let petDrag = false;
  let pointerGen = 0;
  let finishing = false;

  function canClickThrough() {
    return !dockOpen && !gesture.pressed && !gesture.holding && !petDrag && !dragging;
  }

  function interactOn() {
    setThrough(false);
  }

  function interactOff() {
    if (canClickThrough()) setThrough(true);
  }

  function paintScene() {
    sceneBar.querySelectorAll<HTMLButtonElement>("[data-scene]").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.scene === engine.scene);
    });
  }

  function paintPresets() {
    presets.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.hex === faceHex);
    });
  }

  function paintMute() {
    const btn = prefBar?.querySelector<HTMLButtonElement>("[data-pref=mute]");
    if (!btn) return;
    btn.textContent = "Mute";
    btn.classList.toggle("on", isMuted());
    btn.setAttribute("aria-pressed", isMuted() ? "true" : "false");
    btn.title = isMuted() ? "Sound off · M" : "Sound on · M";
  }

  function paintSize() {
    prefBar?.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.size === petSize);
    });
  }

  function paintAuto() {
    const btn = prefBar?.querySelector<HTMLButtonElement>("[data-pref=auto]");
    if (btn) btn.textContent = autoWork ? "Auto" : "Manual";
    btn?.classList.toggle("on", autoWork);
  }

  function paintCodex() {
    const btn = prefBar?.querySelector<HTMLButtonElement>("[data-pref=codex]");
    if (btn) {
      btn.textContent = "Agents";
      btn.classList.toggle("on", watchCodex);
      btn.setAttribute("aria-pressed", watchCodex ? "true" : "false");
    }
  }

  function paintPomo() {
    const btn = prefBar?.querySelector<HTMLButtonElement>("[data-pref=pomo]");
    if (!btn) return;
    const p = desk.pomo;
    if (p.running && p.phase === "work") btn.textContent = formatRemain(p.remainingMs);
    else if (p.running && p.phase === "break") btn.textContent = `Br ${formatRemain(p.remainingMs)}`;
    else btn.textContent = "Focus";
    btn.classList.toggle("on", p.running || p.phase === "break");
    btn.title = p.running ? "Pause focus · F" : "25-minute focus · F";
  }

  function paintBrief() {
    const btn = prefBar?.querySelector<HTMLButtonElement>("[data-pref=brief]");
    if (!btn) return;
    btn.textContent = briefing ? "…" : "Brief";
    btn.classList.toggle("on", Boolean(whisper));
    btn.title = desk.grok.available ? "Ask Grok · W" : "One-line status · W";
  }

  function paintWhisper() {
    if (!whisperEl) return;
    const text = whisper || (dockOpen ? desk.digest : "");
    if (!text || text === "All quiet.") {
      whisperEl.hidden = true;
      whisperEl.textContent = "";
      return;
    }
    whisperEl.textContent = text;
    whisperEl.hidden = false;
  }

  function paintAgents() {
    if (!agentsEl) return;
    agentsEl.replaceChildren();
    const list = watchCodex ? desk.agents.filter((a) => a.status !== "idle") : [];
    if (!list.length) {
      agentsEl.hidden = true;
      return;
    }
    agentsEl.hidden = false;
    for (const agent of list.slice(0, 6)) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.agent = agent.id;
      const klass = agent.status === "waiting" ? "wait" : agent.status === "error" ? "err" : agent.status === "done" ? "done" : "";
      if (klass) b.classList.add(klass);
      b.textContent = agent.cwd ? `${agent.name} · ${agent.cwd}` : `${agent.name} · ${agent.label}`;
      b.title = "Open this tool";
      b.addEventListener("click", () => {
        ackedWait = `${agent.id}:${agent.status}:${agent.cwd}`;
        if (pet) {
          window.pet?.ackAgent?.(agent.id);
          window.pet?.openAgent?.(agent.id);
        } else showWhisper(`Would open ${agent.name} on your Mac`);
      });
      agentsEl.appendChild(b);
    }
  }

  function paintDeskChips() {
    if (!deskEl) return;
    deskEl.replaceChildren();
    const chips: { text: string; kind?: string; perm?: string }[] = [];
    for (const p of desk.perms?.missing || []) {
      chips.push({ text: p.label, kind: "fail", perm: p.id });
    }
    if (desk.quiet) chips.push({ text: "Face only", kind: "warn" });
    const next = desk.meeting.next;
    if (desk.meeting.on) chips.push({ text: "In a meeting", kind: "warn" });
    else if (next && next.minutes >= 0) chips.push({ text: `${next.title} in ${next.minutes}m`, kind: "warn" });
    for (const g of desk.git.slice(0, 2)) {
      const bits = [g.repo, g.branch].filter(Boolean);
      if (g.tests === "fail") bits.push("tests");
      else if (g.dirty) bits.push(`${g.dirty} dirty`);
      chips.push({
        text: bits.join(" · "),
        kind: g.tests === "fail" ? "fail" : g.dirty ? "warn" : "",
      });
    }
    if (!chips.length) {
      deskEl.hidden = true;
      return;
    }
    deskEl.hidden = false;
    for (const chip of chips) {
      if (chip.perm) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `chip ${chip.kind || ""}`.trim();
        b.textContent = chip.text;
        b.title = "Open System Settings and grant access";
        b.addEventListener("click", () => {
          if (pet) window.pet?.openPerm?.(chip.perm!);
          else showWhisper("On your Mac this opens System Settings so you can allow it.");
        });
        deskEl.appendChild(b);
      } else {
        const el = document.createElement("span");
        el.className = `chip${chip.kind ? ` ${chip.kind}` : ""}`;
        el.textContent = chip.text;
        deskEl.appendChild(el);
      }
    }
  }

  function paintDesk() {
    paintCodex();
    paintPomo();
    paintBrief();
    paintWhisper();
    paintAgents();
    paintDeskChips();
  }

  function playNudge() {
    engine.noteInput();
    engine.play("exclaim");
    engine.bounceOnce();
    playSfx("dock");
  }

  function waitKeyOf(agents: DeskSnap["agents"]) {
    const w = agents.find((a) => a.status === "waiting");
    return w ? `${w.id}:${w.status}:${w.cwd}` : "";
  }

  function scheduleWebNudge(key: string) {
    window.clearTimeout(nudgeTimer);
    if (pet || !key || key === ackedWait) return;
    nudgeTimer = window.setTimeout(() => {
      if (waitKeyOf(desk.agents) !== key || key === ackedWait) return;
      playNudge();
      scheduleWebNudge(key);
    }, 12_000);
  }

  function moodFromDesk(snap: DeskSnap): MoodId {
    if (snap.agents.some((a) => a.status === "error")) return "error";
    if (snap.agents.some((a) => a.status === "waiting")) return "wait";
    if (snap.agents.some((a) => a.status === "done")) return "joy";
    if (snap.agents.some((a) => a.status === "running")) return "think";
    if (snap.pomo?.running && snap.pomo.phase === "work") return "think";
    if (snap.meeting?.on) return "look";
    return "idle";
  }

  function applyCodexSnap(snap: { status: string; label: string; name: string; threads: number; tool?: string }, fromWatch = true) {
    if (pet) return;
    const prev = desk.agents[0]?.status;
    if (snap.status === "idle") {
      desk.agents = [];
    } else {
      desk.agents = [
        {
          id: (snap.tool || "agents").toLowerCase(),
          name: snap.tool || "Agents",
          status: snap.status,
          label: snap.label,
          threads: snap.threads,
          cwd: snap.name,
          processOn: true,
        },
      ];
    }
    desk.digest = composeDigest(desk);
    paintDesk();
    engine.setMood(moodFromDesk(desk));
    if (!watchCodex || !fromWatch) return;
    if (snap.status === prev) return;
    engine.noteInput();
    if (snap.status === "running") engine.play("think");
    else if (snap.status === "waiting") {
      engine.play("exclaim");
      engine.bounceOnce();
      playSfx("dock");
    } else if (snap.status === "done") {
      engine.setExpression(5);
      engine.bounceOnce();
      playSfx("land");
    } else if (snap.status === "error") {
      engine.setExpression(17);
      engine.play("think");
    }
  }

  function applyDesk(snap: DeskSnap, fromWatch = true) {
    const prevAgents = desk.agents.map((a) => `${a.id}:${a.status}`).join("|");
    const prevMeet = desk.meeting.next?.minutes;
    const prevFail = desk.git.some((g) => g.tests === "fail");
    desk = snap;
    meetingOn = Boolean(snap.meeting?.on);
    focusWork = Boolean(snap.focus?.workish);
    paintDesk();
    engine.setMood(moodFromDesk(snap));
    syncAutoWork();
    if (!fromWatch) return;
    const nextAgents = snap.agents.map((a) => `${a.id}:${a.status}`).join("|");
    if (nextAgents !== prevAgents) {
      const waiting = snap.agents.find((a) => a.status === "waiting");
      const running = snap.agents.find((a) => a.status === "running");
      const errored = snap.agents.find((a) => a.status === "error");
      const done = snap.agents.find((a) => a.status === "done");
      engine.noteInput();
      if (errored) {
        engine.setExpression(17);
        engine.play("think");
      } else if (waiting) {
        engine.play("exclaim");
        engine.bounceOnce();
        playSfx("dock");
      } else if (done) {
        engine.setExpression(5);
        engine.bounceOnce();
        playSfx("land");
      } else if (running) engine.play("think");
    }
    if (
      engine.mood === "idle" &&
      snap.meeting.next &&
      snap.meeting.next.minutes >= 0 &&
      snap.meeting.next.minutes !== prevMeet
    ) {
      engine.play("look");
    }
    if (!prevFail && snap.git.some((g) => g.tests === "fail")) engine.play("think");
    const key = waitKeyOf(snap.agents);
    if (!key) ackedWait = "";
    scheduleWebNudge(key);
  }

  function showWhisper(text: string) {
    whisper = text;
    paintWhisper();
    paintBrief();
    if (!dockOpen) showDock(true);
    window.clearTimeout(whisperTimer);
    whisperTimer = window.setTimeout(() => {
      if (whisper === text) {
        whisper = "";
        paintWhisper();
        paintBrief();
      }
    }, 8000);
  }

  function tickWebPomo() {
    const snap = webPomo.tick();
    desk = { ...desk, pomo: snap, digest: composeDigest({ ...desk, pomo: snap }) };
    paintDesk();
    if (snap.justEnded === "work") {
      engine.setExpression(5);
      engine.bounceOnce();
      playSfx("land");
      showWhisper("Break. Five minutes.");
    } else if (snap.justEnded === "break") {
      window.clearInterval(webPomoTimer);
      webPomoTimer = 0;
      showWhisper("Back to it.");
    }
  }

  function toggleFocus() {
    if (pet) {
      window.pet?.pomoToggle?.();
      return;
    }
    const snap = webPomo.toggle();
    desk = { ...desk, pomo: snap, digest: composeDigest({ ...desk, pomo: snap }) };
    paintDesk();
    if (snap.running && !webPomoTimer) webPomoTimer = window.setInterval(tickWebPomo, 1000);
    if (!snap.running && snap.phase === "idle") {
      window.clearInterval(webPomoTimer);
      webPomoTimer = 0;
    }
    if (snap.running && snap.phase === "work") applyScene("work");
  }

  async function askBrief(useGrok: boolean) {
    if (pet && window.pet?.brief) {
      briefing = true;
      paintBrief();
      try {
        const text = await window.pet.brief(useGrok);
        if (text) showWhisper(text);
      } finally {
        briefing = false;
        paintBrief();
      }
      return;
    }
    showWhisper(desk.digest || "All quiet.");
  }

  function sceneSfx() {
    return SCENES[engine.scene].idle.sfx;
  }

  let petSize = readPetSize();
  let autoWork = readAutoWork();
  let watchCodex = readCodexWatch();
  let meetingOn = false;
  let focusWork = false;
  let desk: DeskSnap = {
    digest: "All quiet.",
    agents: [],
    meeting: { on: false, next: null },
    focus: { app: "", workish: false },
    git: [],
    pomo: { running: false, phase: "idle", remainingMs: 0, totalMs: 25 * 60_000 },
    grok: { available: false, source: "none" },
    perms: { calendar: true, automation: true, grokBot: true, missing: [] },
    quiet: false,
  };
  let whisper = "";
  let whisperTimer = 0;
  let ackedWait = "";
  let nudgeTimer = 0;
  let briefing = false;
  let sceneBeforeAuto: SceneId | null = null;
  let userPinned = false;
  let lastTrayAt = 0;
  const webPomo = createPomo();
  let webPomoTimer = 0;

  const trayCanvas = document.createElement("canvas");
  trayCanvas.width = 44;
  trayCanvas.height = 44;
  const trayCtx = trayCanvas.getContext("2d");

  let hoursOn = inWorkHours();

  function shouldAutoWork() {
    hoursOn = inWorkHours(new Date(), hoursOn);
    return autoWork && (meetingOn || hoursOn || focusWork);
  }

  function applyScene(id: SceneId, fromUser = true) {
    if (fromUser && shouldAutoWork() && id !== "work") userPinned = true;
    if (fromUser && id === "work") userPinned = false;
    engine.setScene(id);
    paintScene();
    window.pet?.setScene?.(id);
  }

  function syncAutoWork() {
    const need = shouldAutoWork();
    if (need) {
      if (engine.scene !== "work" && !userPinned) {
        sceneBeforeAuto = engine.scene;
        engine.setScene("work");
        paintScene();
        window.pet?.setScene?.("work");
      }
    } else {
      userPinned = false;
      if (engine.scene === "work" && sceneBeforeAuto && sceneBeforeAuto !== "work") {
        const back = sceneBeforeAuto;
        sceneBeforeAuto = null;
        applyScene(back, false);
      }
    }
  }

  function applyPetSize(id: PetSizeId, persist = true) {
    petSize = id;
    const L = adoptLayout(id);
    stage.style.setProperty("--stage-w", `${L.w}px`);
    stage.style.setProperty("--stage-h", `${L.h}px`);
    stage.style.setProperty("--face-box", `${L.box}px`);
    stage.style.setProperty("--face-inset", `${L.inset}px`);
    stage.style.setProperty("--dock-main", `${L.dockMain}px`);
    stage.style.setProperty("--face-side-top", `${L.faceSideTop}px`);
    sizeCanvas();
    paintSize();
    if (persist) writePetSize(id);
    window.pet?.setSize?.(id);
    if (!pet) placeWeb();
  }

  function showDock(open: boolean) {
    dockOpen = open;
    stage.classList.toggle("open", open);
    paintWhisper();
    if (open) {
      interactOn();
      if (sceneSfx()) playSfx("dock");
      if (web) placeWeb();
    } else {
      interactOff();
    }
  }

  const offBlink = engine.on("blink", () => {
    if (sceneSfx()) playSfx("blink");
  });
  const offLand = engine.on("land", () => {
    if (sceneSfx()) playSfx("land");
  });
  const offMute = onMute((on) => {
    paintMute();
    window.pet?.setMuted?.(on);
  });

  const offSide = window.pet?.onSide?.((s) => {
    stage.dataset.side = s;
  });
  const offScene = window.pet?.onScene?.((s) => {
    if (isSceneId(s)) applyScene(s, true);
  });
  const offVisible = window.pet?.onVisible?.((v) => setPaused(!v));
  const offTrayMute = window.pet?.onMute?.((on) => {
    if (on !== isMuted()) setMuted(on);
  });
  const offMeeting = window.pet?.onMeeting?.((on) => {
    meetingOn = Boolean(on);
    syncAutoWork();
  });
  const offFocus = window.pet?.onFocus?.((on) => {
    focusWork = Boolean(on);
    syncAutoWork();
  });
  const offSize = window.pet?.onSize?.((id) => {
    if (isPetSize(id) && id !== petSize) applyPetSize(id, true);
  });
  const offAuto = window.pet?.onAutoWork?.((on) => {
    if (on === autoWork) return;
    autoWork = on;
    writeAutoWork(on);
    paintAuto();
    if (!on) userPinned = false;
    syncAutoWork();
  });
  const offCodex = window.pet?.onCodex?.((snap) => {
    applyCodexSnap(snap);
  });
  const offCodexWatch = window.pet?.onCodexWatch?.((on) => {
    if (on === watchCodex) return;
    watchCodex = on;
    writeCodexWatch(on);
    paintDesk();
  });
  const offDesk = window.pet?.onDesk?.((snap) => {
    applyDesk(snap);
  });
  const offWhisper = window.pet?.onWhisper?.((text) => {
    showWhisper(String(text || ""));
  });
  const offPomoEnded = window.pet?.onPomoEnded?.((phase) => {
    engine.noteInput();
    if (phase === "work") {
      engine.setExpression(5);
      engine.bounceOnce();
      playSfx("land");
    } else {
      engine.play("exclaim");
      engine.bounceOnce();
    }
  });
  const offNudge = window.pet?.onNudge?.(() => playNudge());

  if (pet) {
    wrap.addEventListener("pointerenter", onFaceEnter);
    wrap.addEventListener("pointerleave", onFaceLeave);
    dock.addEventListener("pointerenter", onFaceEnter);
    dock.addEventListener("pointerleave", onFaceLeave);
  }

  function onFaceEnter() {
    interactOn();
  }
  function onFaceLeave() {
    interactOff();
  }

  function sizeCanvas() {
    const fit = (el: HTMLCanvasElement, fallback: number) => {
      const css = el.clientWidth || fallback;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.round(css * dpr);
      if (el.width !== px) {
        el.width = px;
        el.height = px;
      }
    };
    fit(canvas, layoutFor(petSize).box);
    if (menuBot) fit(menuBot, BOT_SIZES.menubar.box);
  }

  function paintWheel() {
    if (wheelCtx) drawColorWheel(wheelCtx, 108, hexToHsv(resolveFaceHex(faceHex)));
  }

  function setColor(hex: string) {
    faceHex = hex;
    engine.setFaceColor(hex);
    paintWheel();
    paintPresets();
    writeFaceColor(hex);
  }

  function setPaused(on: boolean) {
    engine.setPaused(on);
    if (!on && !disposed) startLoop();
  }

  function startLoop() {
    if (loopOn || disposed) return;
    loopOn = true;
    const tick = (now: number) => {
      if (disposed || engine.paused) {
        loopOn = false;
        raf = 0;
        return;
      }
      engine.tick(now);
      const scale = layoutFor(petSize).faceScale;
      if (faceCtx) {
        drawGrokBot(faceCtx, engine, canvas.width || 480, THEME, {
          faceScale: scale,
        });
      }
      if (menuCtx && menuBot) {
        drawGrokBot(menuCtx, engine, menuBot.width || 22, THEME, {
          faceScale: BOT_SIZES.menubar.faceScale,
        });
      }
      if (pet && trayCtx && now - lastTrayAt > 120) {
        lastTrayAt = now;
        drawGrokBot(trayCtx, engine, 44, THEME, {
          faceScale: BOT_SIZES.menubar.faceScale,
        });
        window.pet?.setTrayIcon?.(trayCanvas.toDataURL("image/png"));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  const ro = new ResizeObserver(sizeCanvas);
  ro.observe(wrap);
  if (menuBot) ro.observe(menuBot);
  sizeCanvas();
  paintWheel();
  applyPetSize(petSize, false);
  startLoop();
  syncAutoWork();
  const autoTimer = window.setInterval(syncAutoWork, 30_000);

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onMotion = () => {
    engine.reducedMotion = motion.matches;
  };
  onMotion();
  motion.addEventListener("change", onMotion);

  const onVis = () => setPaused(document.hidden);
  document.addEventListener("visibilitychange", onVis);
  if (document.hidden) setPaused(true);

  function lookAt(clientX: number, clientY: number) {
    const g = gazeFromRect(clientX, clientY, canvas.getBoundingClientRect());
    engine.pointerMove(g.x, g.y);
  }

  const onCursor = (x: number, y: number) => engine.pointerMove(x, y);
  const onPointerGaze = (e: PointerEvent) => lookAt(e.clientX, e.clientY);
  let offCursor: (() => void) | undefined;
  if (pet && window.pet?.onCursor) {
    offCursor = window.pet.onCursor(onCursor);
  } else {
    window.addEventListener("pointermove", onPointerGaze, { passive: true });
  }

  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    engine.noteInput();
    if (e.code === "Space") {
      e.preventDefault();
      engine.blink();
    } else if (e.key === "d" || e.key === "D") applyScene("demo");
    else if (e.key === "r" || e.key === "R") engine.reset();
    else if (e.key === "1") applyScene("work");
    else if (e.key === "2") applyScene("companion");
    else if (e.key === "m" || e.key === "M") setMuted(!isMuted());
    else if (e.key === "w" || e.key === "W") void askBrief(false);
    else if (e.key === "f" || e.key === "F") toggleFocus();
  };
  window.addEventListener("keydown", onKey);

  sceneBar.replaceChildren();
  (Object.keys(SCENES) as SceneId[]).forEach((id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.scene = id;
    b.textContent = SCENES[id].label;
    b.title = SCENES[id].hint;
    b.addEventListener("click", () => applyScene(id));
    sceneBar.appendChild(b);
  });
  paintScene();

  actionBar.replaceChildren();
  ACTIONS.forEach((act) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.act = act.id;
    b.textContent = act.label;
    b.addEventListener("click", () => {
      engine.noteInput();
      act.run(engine);
      paintScene();
    });
    actionBar.appendChild(b);
  });

  presets.replaceChildren();
  FACE_PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = p.name;
    b.dataset.hex = p.hex;
    b.style.background = p.hex;
    b.addEventListener("click", () => setColor(p.hex));
    presets.appendChild(b);
  });
  paintPresets();

  if (prefBar) {
    prefBar.replaceChildren();
    const pomoBtn = document.createElement("button");
    pomoBtn.type = "button";
    pomoBtn.dataset.pref = "pomo";
    pomoBtn.title = "25-minute focus · F";
    pomoBtn.addEventListener("click", () => toggleFocus());
    prefBar.appendChild(pomoBtn);
    const briefBtn = document.createElement("button");
    briefBtn.type = "button";
    briefBtn.dataset.pref = "brief";
    briefBtn.title = "One-line status · W";
    briefBtn.addEventListener("click", () => void askBrief(Boolean(pet)));
    prefBar.appendChild(briefBtn);
    (Object.keys(PET_SIZES) as PetSizeId[]).forEach((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.size = id;
      b.textContent = PET_SIZES[id].label;
      b.title = PET_SIZES[id].hint;
      b.classList.add("dim");
      b.addEventListener("click", () => applyPetSize(id));
      prefBar.appendChild(b);
    });
    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.dataset.pref = "mute";
    muteBtn.title = "Sound on · M";
    muteBtn.classList.add("dim");
    muteBtn.addEventListener("click", () => setMuted(!isMuted()));
    prefBar.appendChild(muteBtn);
    const autoBtn = document.createElement("button");
    autoBtn.type = "button";
    autoBtn.dataset.pref = "auto";
    autoBtn.title = "Work hours 9–18 and meetings switch to Work";
    autoBtn.classList.add("dim");
    autoBtn.addEventListener("click", () => {
      autoWork = !autoWork;
      writeAutoWork(autoWork);
      paintAuto();
      window.pet?.setAutoWork?.(autoWork);
      if (!autoWork) userPinned = false;
      syncAutoWork();
    });
    prefBar.appendChild(autoBtn);
    const codexBtn = document.createElement("button");
    codexBtn.type = "button";
    codexBtn.dataset.pref = "codex";
    codexBtn.title = "Watch local Codex, Claude, Cursor, Gemini, and other agents";
    codexBtn.classList.add("dim");
    codexBtn.addEventListener("click", () => {
      watchCodex = !watchCodex;
      writeCodexWatch(watchCodex);
      paintCodex();
      window.pet?.setCodexWatch?.(watchCodex);
      if (!watchCodex) applyCodexSnap({ status: "idle", label: "idle", name: "", threads: 0 }, false);
    });
    prefBar.appendChild(codexBtn);
    paintMute();
    paintSize();
    paintAuto();
    paintDesk();
  }

  window.pet?.setScene?.(engine.scene);
  window.pet?.setMuted?.(isMuted());
  window.pet?.setAutoWork?.(autoWork);
  window.pet?.setCodexWatch?.(watchCodex);

  if (web) applyDesk(demoDesk(), false);

  if (studio && opts.studioHref) {
    studio.hidden = false;
    studio.href = opts.studioHref;
  }

  const pickWheel = (e: PointerEvent) => {
    const r = wheel.getBoundingClientRect();
    const hit = hitColorWheel(
      ((e.clientX - r.left) / r.width) * 108,
      ((e.clientY - r.top) / r.height) * 108,
      108,
      hexToHsv(resolveFaceHex(faceHex)),
    );
    if (hit) setColor(hsvToHex(hit.hsv.h, hit.hsv.s, hit.hsv.v));
  };
  const onWheelDown = (e: PointerEvent) => {
    wheel.setPointerCapture(e.pointerId);
    pickWheel(e);
  };
  const onWheelMove = (e: PointerEvent) => {
    if (e.buttons) pickWheel(e);
  };
  wheel.addEventListener("pointerdown", onWheelDown);
  wheel.addEventListener("pointermove", onWheelMove);

  // --- web-only: drag the stage around the viewport ---
  function area(): Area {
    return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  }

  function fitScale() {
    return Math.min(1, window.innerWidth / STAGE.w, window.innerHeight / (STAGE.h * 0.92));
  }

  function applyWebPos() {
    if (!web) return;
    const o = BALL_IN_STAGE[webSide];
    const scale = fitScale();
    stage.style.position = "absolute";
    stage.style.left = "0";
    stage.style.top = "0";
    stage.style.transformOrigin = `${o.x}px ${o.y}px`;
    stage.style.transform = `translate(${pos.x - o.x}px, ${pos.y - o.y}px) scale(${scale})`;
    stage.dataset.side = webSide;
  }

  function placeWeb() {
    if (!web) return;
    webSide = pickDockSide(pos.x, pos.y, area());
    keepDockOnScreen();
    applyWebPos();
  }

  function keepDockOnScreen() {
    if (!web) return;
    const scale = fitScale();
    const o = BALL_IN_STAGE[webSide];
    const a = area();
    if (webSide === "bottom") {
      const bottom = pos.y + (STAGE.h - o.y) * scale;
      if (bottom > a.h - 8) pos.y -= bottom - (a.h - 8);
    } else if (webSide === "top") {
      const top = pos.y - o.y * scale;
      if (top < 36) pos.y += 36 - top;
    } else if (webSide === "right") {
      const right = pos.x + (STAGE.w - o.x) * scale;
      if (right > a.w - 8) pos.x -= right - (a.w - 8);
    } else if (webSide === "left") {
      const left = pos.x - o.x * scale;
      if (left < 8) pos.x += 8 - left;
    }
    pos = clampPoint(pos.x, pos.y, a);
  }

  function saveWebPos() {
    if (!web) return;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }

  if (web) {
    let placed = false;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          pos = clampPoint(p.x, p.y, area());
          placed = true;
        }
      }
    } catch {
      /* ignore */
    }
    if (!placed) pos = clampPoint(window.innerWidth / 2, window.innerHeight / 2, area());
    placeWeb();

    const step = () => {
      if (disposed) return;
      if (!dragging && (Math.abs(vel.x) > 0.12 || Math.abs(vel.y) > 0.12)) {
        let { x, y } = pos;
        x += vel.x;
        y += vel.y;
        const next = clampPoint(x, y, area());
        if (next.x !== x) vel.x *= -0.52;
        if (next.y !== y) vel.y *= -0.52;
        pos = next;
        vel.x *= 0.9;
        vel.y *= 0.9;
        placeWeb();
        if (Math.abs(vel.x) <= 0.12 && Math.abs(vel.y) <= 0.12) {
          vel = { x: 0, y: 0 };
          saveWebPos();
        }
      }
      inertiaRaf = requestAnimationFrame(step);
    };
    inertiaRaf = requestAnimationFrame(step);
  }

  const onResize = () => {
    if (!web) return;
    pos = clampPoint(pos.x, pos.y, area());
    placeWeb();
  };
  window.addEventListener("resize", onResize);

  const onBg = (e: PointerEvent) => {
    if (!dockOpen) return;
    if (stage.contains(e.target as Node)) return;
    showDock(false);
  };
  if (web) window.addEventListener("pointerdown", onBg);

  let waking = false;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pointerGen += 1;
    finishing = false;
    waking = engine.state === "sleep";
    engine.noteInput();
    vel = { x: 0, y: 0 };
    dragging = false;
    last = { x: e.screenX, y: e.screenY, t: performance.now() };
    gesture.onDown(e);
    interactOn();
    if (pet && window.pet?.dragStart) {
      petDrag = true;
      window.pet.dragStart();
    } else {
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    const move = gesture.onMove(e);
    if (!move) return;
    wrap.classList.add("hold");
    const now = performance.now();
    const dt = Math.max(8, now - last.t);
    vel = {
      x: ((e.screenX - last.x) / dt) * 16,
      y: ((e.screenY - last.y) / dt) * 16,
    };
    last = { x: e.screenX, y: e.screenY, t: now };
    dragging = true;
    if (pet) return;
    pos = clampPoint(pos.x + move.dx, pos.y + move.dy, area());
    placeWeb();
  };

  function applyPointerKind(kind: GestureKind) {
    if (kind === "dbl") {
      gesture.cancelTap();
      engine.noteInput();
      engine.bounceOnce();
      vel = { x: 0, y: 0 };
    } else if (kind === "tap") {
      if (waking) {
        engine.blink();
        vel = { x: 0, y: 0 };
      } else {
        gesture.scheduleTap(() => {
          engine.blink();
          showDock(!dockOpen);
        });
        vel = { x: 0, y: 0 };
      }
    } else if (kind === "drag" && web) {
      vel.x = Math.max(-38, Math.min(38, vel.x));
      vel.y = Math.max(-38, Math.min(38, vel.y));
    }
    dragging = false;
    saveWebPos();
    if (web) placeWeb();
    interactOff();
  }

  async function finishPointer(mainMoved?: boolean) {
    if (finishing) return;
    if (!gesture.pressed && !petDrag) return;
    finishing = true;
    const my = pointerGen;
    wrap.classList.remove("hold");
    let kind = gesture.onUp();
    if (pet && window.pet?.dragEnd && petDrag) {
      petDrag = false;
      try {
        const result = await window.pet.dragEnd();
        if (result?.moved) kind = "drag";
      } catch {
        /* ignore */
      }
    }
    petDrag = false;
    if (mainMoved) kind = "drag";
    if (my !== pointerGen) return;
    applyPointerKind(kind);
    finishing = false;
  }

  const onUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    void finishPointer();
  };

  const onCancel = () => {
    if (pet && (petDrag || gesture.dragging || gesture.pressed)) return;
    void finishPointer();
  };

  const onWinUp = (e: Event) => {
    if (!gesture.pressed && !petDrag) return;
    if ("button" in e && (e as MouseEvent).button !== 0) return;
    void finishPointer();
  };

  wrap.addEventListener("pointerdown", onDown);
  wrap.addEventListener("pointermove", onMove);
  wrap.addEventListener("pointerup", onUp);
  wrap.addEventListener("pointercancel", onCancel);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onWinUp, true);
  window.addEventListener("mouseup", onWinUp, true);
  const onMenu = (e: Event) => {
    e.preventDefault();
    if (pet) window.pet?.hide?.();
  };
  wrap.addEventListener("contextmenu", onMenu);

  const offDragArmed = window.pet?.onDragArmed?.(() => {
    wrap.classList.add("hold");
    gesture.markMoved();
    dragging = true;
  });
  const offDragFinished = window.pet?.onDragFinished?.((result) => {
    void finishPointer(Boolean(result?.moved));
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(inertiaRaf);
    ro.disconnect();
    offBlink();
    offLand();
    offMute();
    gesture.dispose();
    registerEngine(null);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointermove", onPointerGaze);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointerdown", onBg);
    document.removeEventListener("visibilitychange", onVis);
    motion.removeEventListener("change", onMotion);
    wrap.removeEventListener("pointerdown", onDown);
    wrap.removeEventListener("pointermove", onMove);
    wrap.removeEventListener("pointerup", onUp);
    wrap.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onWinUp, true);
    window.removeEventListener("mouseup", onWinUp, true);
    wrap.removeEventListener("contextmenu", onMenu);
    wrap.removeEventListener("pointerenter", onFaceEnter);
    wrap.removeEventListener("pointerleave", onFaceLeave);
    dock.removeEventListener("pointerenter", onFaceEnter);
    dock.removeEventListener("pointerleave", onFaceLeave);
    wheel.removeEventListener("pointerdown", onWheelDown);
    wheel.removeEventListener("pointermove", onWheelMove);
    if (typeof offCursor === "function") offCursor();
    if (typeof offSide === "function") offSide();
    if (typeof offScene === "function") offScene();
    if (typeof offVisible === "function") offVisible();
    if (typeof offTrayMute === "function") offTrayMute();
    if (typeof offMeeting === "function") offMeeting();
    if (typeof offFocus === "function") offFocus();
    if (typeof offSize === "function") offSize();
    if (typeof offAuto === "function") offAuto();
    if (typeof offCodex === "function") offCodex();
    if (typeof offCodexWatch === "function") offCodexWatch();
    if (typeof offDesk === "function") offDesk();
    if (typeof offWhisper === "function") offWhisper();
    if (typeof offPomoEnded === "function") offPomoEnded();
    if (typeof offNudge === "function") offNudge();
    if (typeof offDragArmed === "function") offDragArmed();
    if (typeof offDragFinished === "function") offDragFinished();
    window.clearInterval(autoTimer);
    window.clearTimeout(whisperTimer);
    window.clearTimeout(nudgeTimer);
    window.clearInterval(webPomoTimer);
  };
}
