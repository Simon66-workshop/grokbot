import { GrokBotEngine } from "./engine";
import {
  FACE_PRESETS,
  GROK_BLUE,
  drawColorWheel,
  hexToHsv,
  hitColorWheel,
  hsvToHex,
  resolveFaceHex,
} from "./color";
import { drawGrokBot, type ThemeColors } from "./renderer";
import { readScene, SCENES, isSceneId, type SceneId } from "./scenes";
import { isMuted, onMute, playSfx, setMuted } from "./sfx";
import { BOT_SIZES } from "./sizes";
import { registerEngine } from "./registry";

export const HOLD_MS = 220;
export const TAP_MS = 280;
export const DBL_MS = 340;
export const COLOR_KEY = "grok-face-color";
export const POS_KEY = "grok-companion-pos";

export type DockSide = "bottom" | "top" | "left" | "right";

export const STAGE = { w: 580, h: 600 };

export const BALL_IN_STAGE: Record<DockSide, { x: number; y: number }> = {
  bottom: { x: 290, y: 220 },
  top: { x: 290, y: 380 },
  right: { x: 160, y: 300 },
  left: { x: 420, y: 300 },
};

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
    cx: number;
    cy: number;
    timer: number;
    armed: boolean;
    moved: boolean;
  } | null = null;
  let tapAt = 0;
  let tapTimer = 0;
  let holding = false;

  return {
    get holding() {
      return holding;
    },
    onDown(e: { screenX: number; screenY: number; clientX: number; clientY: number }) {
      press = {
        sx: e.screenX,
        sy: e.screenY,
        cx: e.clientX,
        cy: e.clientY,
        armed: false,
        moved: false,
        timer: window.setTimeout(() => {
          if (!press) return;
          press.armed = true;
          holding = true;
        }, HOLD_MS),
      };
    },
    onMove(e: { screenX: number; screenY: number; clientX: number; clientY: number }) {
      if (!press) return null;
      if (!press.armed) return null;
      const dx = e.screenX - press.sx;
      const dy = e.screenY - press.sy;
      if (Math.hypot(dx, dy) > 3) press.moved = true;
      const out = { dx, dy, clientX: e.clientX, clientY: e.clientY };
      press.sx = e.screenX;
      press.sy = e.screenY;
      return out;
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
  { id: "look", label: "Look", run: (e) => e.play("look") },
  { id: "joy", label: "Joy", run: (e) => e.setExpression(5) },
  { id: "think", label: "Think", run: (e) => e.play("think") },
  { id: "wow", label: "Wow", run: (e) => e.play("exclaim") },
  { id: "orbit", label: "Orbit", run: (e) => e.play("orbits") },
  { id: "bounce", label: "Bounce", run: (e) => e.bounceOnce() },
  { id: "tour", label: "Tour", run: (e) => e.setScene("demo") },
];

const STYLE_ID = "grok-pet-style";

const PET_CSS = `
.grok-stage {
  position: relative;
  width: ${STAGE.w}px;
  height: ${STAGE.h}px;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
.grok-stage .face,
.grok-stage .dock { pointer-events: auto; }
.grok-stage .face {
  position: absolute;
  width: ${BOT_SIZES.companion.box}px;
  height: ${BOT_SIZES.companion.box}px;
  cursor: grab;
  touch-action: none;
}
.grok-stage .face.hold { transform: scale(1.04); }
.grok-stage .face:active { cursor: grabbing; }
.grok-stage canvas.bot { display: block; width: 100%; height: 100%; }
.grok-stage #wheel { display: block; width: 72px; height: 72px; cursor: crosshair; }
.grok-stage .dock {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}
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
.grok-stage[data-side="bottom"] .face { left: 70px; top: 0; }
.grok-stage[data-side="bottom"] .dock { left: 0; right: 0; top: 400px; }
.grok-stage[data-side="top"] .face { left: 70px; bottom: 0; top: auto; }
.grok-stage[data-side="top"] .dock { left: 0; right: 0; bottom: 400px; top: auto; }
.grok-stage[data-side="right"] .face { left: 0; top: 80px; }
.grok-stage[data-side="right"] .dock {
  left: 400px; top: 50%; transform: translateY(-50%);
  width: 168px;
}
.grok-stage[data-side="left"] .face { right: 0; left: auto; top: 80px; }
.grok-stage[data-side="left"] .dock {
  right: 400px; left: auto; top: 50%; transform: translateY(-50%);
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
        <a class="studio" id="studio" hidden>Studio</a>
      </div>`,
    );
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
  const studio = stage.querySelector<HTMLAnchorElement>("#studio");
  const menuBot = document.querySelector<HTMLCanvasElement>("#menu-bot");

  const gesture = createPetGesture();
  let dockOpen = false;
  let raf = 0;
  let disposed = false;
  let loopOn = false;
  const faceCtx = canvas.getContext("2d");
  const wheelCtx = wheel.getContext("2d");
  const menuCtx = menuBot?.getContext("2d") ?? null;

  const setThrough = (on: boolean) => window.pet?.setClickThrough?.(on);
  if (pet) setThrough(true);

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
    if (btn) btn.textContent = isMuted() ? "Muted" : "Sound";
    btn?.classList.toggle("on", !isMuted());
  }

  function sceneSfx() {
    return SCENES[engine.scene].idle.sfx;
  }

  function applyScene(id: SceneId) {
    engine.setScene(id);
    paintScene();
    window.pet?.setScene?.(id);
  }

  function showDock(open: boolean) {
    dockOpen = open;
    stage.classList.toggle("open", open);
    if (open) {
      setThrough(false);
      if (sceneSfx()) playSfx("dock");
    } else if (!gesture.holding) setThrough(true);
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
    if (isSceneId(s)) applyScene(s);
  });
  const offVisible = window.pet?.onVisible?.((v) => setPaused(!v));
  const offTrayMute = window.pet?.onMute?.((on) => {
    if (on !== isMuted()) setMuted(on);
  });

  if (pet) {
    wrap.addEventListener("pointerenter", onFaceEnter);
    wrap.addEventListener("pointerleave", onFaceLeave);
    dock.addEventListener("pointerenter", onFaceEnter);
    dock.addEventListener("pointerleave", onFaceLeave);
  }

  function onFaceEnter() {
    setThrough(false);
  }
  function onFaceLeave() {
    if (!gesture.holding && !dockOpen) setThrough(true);
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
    fit(canvas, BOT_SIZES.companion.box);
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
      if (faceCtx) {
        drawGrokBot(faceCtx, engine, canvas.width || 480, THEME, {
          faceScale: BOT_SIZES.companion.faceScale,
        });
      }
      if (menuCtx && menuBot) {
        drawGrokBot(menuCtx, engine, menuBot.width || 22, THEME, {
          faceScale: BOT_SIZES.menubar.faceScale,
        });
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
  startLoop();

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
    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.dataset.pref = "mute";
    muteBtn.title = "Toggle sounds";
    muteBtn.addEventListener("click", () => setMuted(!isMuted()));
    prefBar.appendChild(muteBtn);
    paintMute();
  }

  window.pet?.setScene?.(engine.scene);
  window.pet?.setMuted?.(isMuted());

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
  const web = !pet;
  let pos = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };
  let last = { x: 0, y: 0, t: 0 };
  let dragging = false;
  let inertiaRaf = 0;
  let webSide: DockSide = "bottom";

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
    applyWebPos();
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
    waking = engine.state === "sleep";
    engine.noteInput();
    vel = { x: 0, y: 0 };
    dragging = false;
    last = { x: e.screenX, y: e.screenY, t: performance.now() };
    gesture.onDown(e);
    wrap.setPointerCapture(e.pointerId);
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
    const prevX = last.x;
    const prevY = last.y;
    last = { x: e.screenX, y: e.screenY, t: now };
    dragging = true;
    if (pet && window.pet) {
      window.pet.moveBy(e.screenX - prevX, e.screenY - prevY);
    } else {
      pos = clampPoint(pos.x + move.dx, pos.y + move.dy, area());
      placeWeb();
    }
  };
  const onUp = () => {
    wrap.classList.remove("hold");
    const kind = gesture.onUp();
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
    placeWeb();
  };

  wrap.addEventListener("pointerdown", onDown);
  wrap.addEventListener("pointermove", onMove);
  wrap.addEventListener("pointerup", onUp);
  wrap.addEventListener("pointercancel", onUp);
  const onMenu = (e: Event) => {
    e.preventDefault();
    if (pet) window.pet?.hide?.();
  };
  wrap.addEventListener("contextmenu", onMenu);

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
    wrap.removeEventListener("pointercancel", onUp);
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
  };
}
