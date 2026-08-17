import { GrokBotEngine } from "../src/lib/grokbot/engine";
import { drawGrokBot, type ThemeColors } from "../src/lib/grokbot/renderer";

const THEME: ThemeColors = {
  ink: "#161513",
  paper: "#f3f1ea",
  grok: "#1b56f3",
  eye: "#fffdf8",
  muted: "#6e6a62",
};

const engine = new GrokBotEngine();
engine.setFaceColor("blue");
engine.setFollowPointer(true);
engine.setAutoIdle(true);

const canvas = document.querySelector<HTMLCanvasElement>("#face")!;
const wrap = canvas.parentElement!;

function sizeCanvas() {
  const css = canvas.clientWidth || 360;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(css * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
}

const tick = (now: number) => {
  engine.tick(now);
  const ctx = canvas.getContext("2d");
  if (ctx) drawGrokBot(ctx, engine, canvas.width || 480, THEME, { faceScale: 0.36 });
  requestAnimationFrame(tick);
};

new ResizeObserver(sizeCanvas).observe(wrap);
sizeCanvas();
requestAnimationFrame(tick);

window.addEventListener(
  "pointermove",
  (e) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    engine.pointerMove(nx, ny);
  },
  { passive: true },
);

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
  tour: () => engine.playDemo(),
};

document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
  btn.addEventListener("click", () => actions[btn.dataset.act ?? ""]?.());
});
