import { GrokBotEngine } from "../src/lib/grokbot/engine";
import { drawGrokBot, type ThemeColors } from "../src/lib/grokbot/renderer";
import {
  FACE_PRESETS,
  GROK_BLUE,
  drawColorWheel,
  hexToHsv,
  hitColorWheel,
  hsvToHex,
  resolveFaceHex,
} from "../src/lib/grokbot/color";

const THEME: ThemeColors = {
  ink: "#161513",
  paper: "#f3f1ea",
  grok: "#1b56f3",
  eye: "#fffdf8",
  muted: "#6e6a62",
};

const COLOR_KEY = "grok-face-color";
const HOLD_MS = 220;
const pet = Boolean(window.pet?.isPet || new URLSearchParams(location.search).has("pet"));
if (pet) document.documentElement.classList.add("pet");

function setThrough(on: boolean) {
  window.pet?.setClickThrough?.(on);
}
if (pet) setThrough(true);

const engine = new GrokBotEngine();
engine.setFollowPointer(true);
engine.setAutoIdle(true);

let faceHex = GROK_BLUE;
try {
  faceHex = localStorage.getItem(COLOR_KEY) || GROK_BLUE;
} catch {
  /* ignore */
}
engine.setFaceColor(faceHex);

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#face")!;
const wrap = canvas.parentElement!;
const dock = document.querySelector<HTMLDivElement>("#dock")!;
const wheel = document.querySelector<HTMLCanvasElement>("#wheel")!;
const presets = document.querySelector<HTMLDivElement>("#presets")!;

if (window.pet?.onSide) {
  window.pet.onSide((s) => {
    stage.dataset.side = s;
  });
}

function showDock(open: boolean) {
  stage.classList.toggle("open", open);
  if (open) setThrough(false);
  else if (!press) setThrough(true);
}

let hideTimer = 0;
function armHide() {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (press) return;
    showDock(false);
  }, 480);
}
function cancelHide() {
  window.clearTimeout(hideTimer);
  showDock(true);
}

if (pet) {
  stage.addEventListener("pointerenter", cancelHide);
  stage.addEventListener("pointerleave", () => {
    if (!press) armHide();
  });
}

function sizeCanvas() {
  const css = canvas.clientWidth || 360;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(css * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
}

function paintWheel() {
  const ctx = wheel.getContext("2d");
  if (ctx) drawColorWheel(ctx, 108, hexToHsv(resolveFaceHex(faceHex)));
}

function setColor(hex: string) {
  faceHex = hex;
  engine.setFaceColor(hex);
  paintWheel();
  try {
    localStorage.setItem(COLOR_KEY, hex);
  } catch {
    /* ignore */
  }
}

const tick = (now: number) => {
  engine.tick(now);
  const ctx = canvas.getContext("2d");
  if (ctx) drawGrokBot(ctx, engine, canvas.width || 480, THEME, { faceScale: 0.24 });
  requestAnimationFrame(tick);
};

new ResizeObserver(sizeCanvas).observe(wrap);
sizeCanvas();
paintWheel();
requestAnimationFrame(tick);

function lookAt(clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  const nx = Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / Math.max(72, r.width * 0.42)));
  const ny = Math.max(-1, Math.min(1, (clientY - (r.top + r.height / 2)) / Math.max(72, r.height * 0.42)));
  engine.pointerMove(nx, ny);
}

if (pet && window.pet?.onCursor) {
  window.pet.onCursor((x, y) => engine.pointerMove(x, y));
} else {
  window.addEventListener("pointermove", (e) => lookAt(e.clientX, e.clientY), { passive: true });
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    engine.blink();
  } else if (e.key === "d" || e.key === "D") engine.playDemo();
  else if (e.key === "r" || e.key === "R") engine.reset();
});

const actions: Record<string, () => void> = {
  idle: () => engine.reset(),
  blink: () => engine.blink(),
  look: () => engine.play("look"),
  joy: () => engine.setExpression(5),
  think: () => engine.play("loading"),
  wow: () => engine.play("exclaim"),
  orbit: () => engine.play("orbits"),
  bounce: () => engine.play("bounce"),
  tour: () => engine.playDemo(),
};

document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => actions[btn.dataset.act ?? ""]?.());
});

FACE_PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.type = "button";
  b.title = p.name;
  b.style.background = p.hex;
  b.addEventListener("click", () => setColor(p.hex));
  presets.appendChild(b);
});

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
wheel.addEventListener("pointerdown", (e) => {
  wheel.setPointerCapture(e.pointerId);
  pickWheel(e);
});
wheel.addEventListener("pointermove", (e) => {
  if (e.buttons) pickWheel(e);
});

type Press = { x: number; y: number; timer: number; armed: boolean; moved: boolean };
let press: Press | null = null;
let tapAt = 0;
let tapTimer = 0;

wrap.addEventListener("pointerdown", (e) => {
  press = {
    x: e.screenX,
    y: e.screenY,
    armed: false,
    moved: false,
    timer: window.setTimeout(() => {
      if (!press) return;
      press.armed = true;
      wrap.classList.add("hold");
      setThrough(false);
    }, HOLD_MS),
  };
  wrap.setPointerCapture(e.pointerId);
});
wrap.addEventListener("pointermove", (e) => {
  if (!press) return;
  const dx = e.screenX - press.x;
  const dy = e.screenY - press.y;
  if (!press.armed) return;
  if (Math.hypot(dx, dy) > 3) press.moved = true;
  if (pet && window.pet) window.pet.moveBy(dx, dy);
  press.x = e.screenX;
  press.y = e.screenY;
});
wrap.addEventListener("pointerup", () => {
  if (press) window.clearTimeout(press.timer);
  wrap.classList.remove("hold");
  if (press && !press.armed && !press.moved) {
    const now = performance.now();
    if (now - tapAt < 340) {
      window.clearTimeout(tapTimer);
      tapAt = 0;
      engine.bounceOnce();
    } else {
      tapAt = now;
      tapTimer = window.setTimeout(() => engine.blink(), 280);
    }
  }
  press = null;
  if (pet && !stage.matches(":hover")) armHide();
});
