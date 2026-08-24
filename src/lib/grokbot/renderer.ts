import { FACE_R, type Point } from "./types";
import { clamp, lerp } from "./math";
import type { GrokBotEngine } from "./engine";
import { stadiumPath } from "./paths";
import { luminance, resolveFaceHex } from "./color";

export type ThemeColors = {
  ink: string;
  paper: string;
  grok: string;
  eye: string;
  muted: string;
};

function fillPath(ctx: CanvasRenderingContext2D, pts: Point[]) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

function hueStroke(h: number, a = 1) {
  return `hsla(${h}, 72%, 62%, ${a})`;
}

export function drawGrokBot(
  ctx: CanvasRenderingContext2D,
  engine: GrokBotEngine,
  cssSize: number,
  theme: ThemeColors,
  opts?: { faceScale?: number },
) {
  const dpr = cssSize;
  ctx.clearRect(0, 0, dpr, dpr);
  ctx.save();
  ctx.translate(dpr / 2, dpr / 2);
  const faceScale = opts?.faceScale ?? 0.31;
  const scale = (dpr * faceScale) / FACE_R;
  ctx.scale(scale, scale);
  if (faceScale > 0.28) ctx.translate(0, -FACE_R * 0.06);

  const face = resolveFaceHex(engine.displayColor || engine.faceColor);
  const eyeFill = theme.eye;
  const spin = engine.t.spin.value;
  if (spin) ctx.rotate(spin * Math.sin(performance.now() / 900) * 0.35);

  const flyX = engine.t.flyX.value * FACE_R * 1.45;
  const flyY = engine.t.flyY.value * FACE_R * 1.45;
  const hop = engine.t.hop.value;
  const hopX = engine.t.hopX.value;
  const squash = Math.max(0.45, engine.t.squash.value);
  ctx.translate(flyX + hopX * FACE_R * 0.7, flyY - hop * FACE_R * 0.78);

  const orbitW = engine.t.orbitW.value;
  const streakW = engine.t.streakW.value;
  const bodyScale = Math.max(0.04, engine.t.bodyScale.value);
  const dotsW = engine.t.dotsW.value;
  const exclaimW = engine.t.exclaimW.value;
  const satW = engine.t.satW.value;
  const faceW = engine.t.faceW.value;

  const lookX = engine.t.gazeX.value + engine.t.yaw.value * 0.55;
  const lookY = engine.t.gazeY.value + engine.t.pitch.value * 0.45;

  drawTrail(ctx, engine);
  if (orbitW > 0.02) drawOrbits(ctx, engine, orbitW, -1);
  if (streakW > 0.02) drawStreaks(ctx, engine, streakW, -1);

  const hideBody = dotsW > 0.45;
  if (!hideBody && faceW > 0.08) {
    drawContactShadow(ctx, faceW, bodyScale, hop, hopX, lookX, lookY);
  }

  ctx.save();
  ctx.translate(lookX * 4, lookY * 3.5);
  ctx.rotate(lookX * 0.04);
  ctx.scale(
    1 + lookX * lookX * 0.03 - lookY * lookY * 0.015,
    1 + lookY * lookY * 0.025 - lookX * lookX * 0.018,
  );

  const body = engine.bodyPoints();
  if (!hideBody && (faceW > 0.02 || exclaimW > 0.02)) {
    ctx.save();
    ctx.scale(bodyScale * (1 / squash), bodyScale * squash);
    ctx.globalAlpha = Math.max(faceW, exclaimW);
    fillPath(ctx, body);
    ctx.fillStyle = face;
    ctx.fill();
    shadeSphere(ctx, body, face, lookX, lookY);
    ctx.restore();
  }

  // Eyes stay in unsquashed face space. Body squash (bounce land 0.45–0.78)
  // would otherwise turn Rest/Joy ovals into horizontal dashes.
  if (!hideBody && faceW > 0.05 && engine.t.eyeAlpha.value > 0.02) {
    ctx.save();
    ctx.scale(bodyScale, bodyScale);
    ctx.beginPath();
    ctx.arc(0, 0, FACE_R * 0.96, 0, Math.PI * 2);
    ctx.clip();
    const L = engine.projectedEye("left");
    const R = engine.projectedEye("right");
    const eyes = L.depth <= R.depth ? [L, R] : [R, L];
    for (const eye of eyes) {
      if (eye.eye.alpha < 0.02) continue;
      const a = clamp(eye.eye.alpha * faceW, 0, 1);
      ctx.globalAlpha = a;
      fillPath(ctx, eye.path);
      ctx.fillStyle = eyeFill;
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  if (exclaimW > 0.05) {
    drawExclaimDot(ctx, face, exclaimW, bodyScale);
  }

  if (dotsW > 0.04) drawLoadingDots(ctx, engine, face, theme, dotsW);
  if (satW > 0.04) drawSatellites(ctx, engine, face, theme, satW);

  if (orbitW > 0.02) drawOrbits(ctx, engine, orbitW, 1);
  if (streakW > 0.02) drawStreaks(ctx, engine, streakW, 1);
  drawSparks(ctx, engine);

  if (engine.debug) drawDebug(ctx, engine, theme);

  ctx.restore();
}

function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  faceW: number,
  bodyScale: number,
  hop: number,
  hopX: number,
  lookX: number,
  lookY: number,
) {
  const fade = faceW * bodyScale * (1 - hop * 0.45);
  const x = lookX * 8 - hopX * FACE_R * 0.22;
  const y = FACE_R * 0.94 * bodyScale + 6 + lookY * 3 + hop * FACE_R * 0.78;
  ctx.save();
  ctx.fillStyle = "#1a1814";
  ctx.globalAlpha = 0.09 * fade;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 68 * bodyScale, 11 * bodyScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.07 * fade;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 42 * bodyScale, 6.5 * bodyScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function shadeSphere(
  ctx: CanvasRenderingContext2D,
  body: Point[],
  faceHex: string,
  lookX: number,
  lookY: number,
) {
  ctx.save();
  fillPath(ctx, body);
  ctx.clip();

  const lx = -40 - lookX * 36;
  const ly = -48 - lookY * 28;
  const lum = luminance(faceHex);
  const hi = 0.12 + (1 - lum) * 0.2;
  const sh = 0.16 + lum * 0.22;

  const volume = ctx.createRadialGradient(lx, ly, 6, lx * 0.15, ly * 0.1, FACE_R * 1.38);
  volume.addColorStop(0, `rgba(255,255,255,${hi})`);
  volume.addColorStop(0.18, `rgba(255,255,255,${hi * 0.42})`);
  volume.addColorStop(0.48, "rgba(255,255,255,0)");
  volume.addColorStop(0.78, `rgba(8,10,24,${sh * 0.55})`);
  volume.addColorStop(1, `rgba(4,6,16,${sh})`);
  ctx.fillStyle = volume;
  ctx.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);

  const spec = ctx.createRadialGradient(lx * 0.72, ly * 0.72, 0, lx * 0.72, ly * 0.72, 34);
  spec.addColorStop(0, `rgba(255,255,255,${hi})`);
  spec.addColorStop(0.35, `rgba(255,255,255,${hi * 0.3})`);
  spec.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);

  const rimX = 52 + lookX * 20;
  const rimY = 18 + lookY * 16;
  const rim = ctx.createRadialGradient(rimX, rimY, FACE_R * 0.35, 0, 0, FACE_R * 1.02);
  rim.addColorStop(0, "rgba(255,255,255,0)");
  rim.addColorStop(0.72, "rgba(255,255,255,0)");
  rim.addColorStop(0.9, `rgba(255,255,255,${0.08 + (1 - lum) * 0.12})`);
  rim.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rim;
  ctx.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);

  ctx.restore();
}

function drawExclaimDot(
  ctx: CanvasRenderingContext2D,
  face: string,
  w: number,
  bodyScale: number,
) {
  ctx.save();
  ctx.globalAlpha = w;
  const y = FACE_R * 0.48 * bodyScale;
  ctx.beginPath();
  ctx.ellipse(0, y, 8.5 * Math.max(bodyScale, 0.7), 8.5 * Math.max(bodyScale, 0.7), 0, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.restore();
}

function drawLoadingDots(
  ctx: CanvasRenderingContext2D,
  engine: GrokBotEngine,
  face: string,
  theme: ThemeColors,
  w: number,
) {
  const t = performance.now() / 1000;
  const spacing = 52;
  const items = [
    { x: -spacing, k: 0.62, r: 18 },
    { x: 0, k: 1, r: 24 },
    { x: spacing, k: 0.62, r: 18 },
  ];
  ctx.save();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const pulse = 0.88 + 0.12 * Math.sin(t * 3.6 + i * 0.95);
    ctx.globalAlpha = w * it.k;
    ctx.beginPath();
    ctx.arc(it.x, 0, it.r * pulse, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();
  }
  ctx.restore();
}

function drawSatellites(
  ctx: CanvasRenderingContext2D,
  engine: GrokBotEngine,
  face: string,
  theme: ThemeColors,
  w: number,
) {
  ctx.save();
  const scale = engine.t.bodyScale.value;
  for (let i = 0; i < engine.satellites.length; i++) {
    const s = engine.satellites[i]!;
    const x = Math.cos(s.ang + i) * s.dist * Math.max(scale, 0.25);
    const y = Math.sin(s.ang * 0.85 + i) * s.dist * 0.55 * Math.max(scale, 0.25);
    ctx.globalAlpha = w * (i === 0 ? 1 : 0.55);
    ctx.beginPath();
    ctx.arc(x, y - 10, s.r * (i === 0 ? 1.15 : 0.85), 0, Math.PI * 2);
    if (i === 0 && engine.state === "focus") {
      ctx.fillStyle = theme.grok;
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = theme.paper;
      ctx.stroke();
    } else {
      ctx.fillStyle = face;
      ctx.globalAlpha = w * 0.45;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawOrbits(
  ctx: CanvasRenderingContext2D,
  engine: GrokBotEngine,
  w: number,
  hemisphere: -1 | 1,
) {
  const samples = 72;
  for (const o of engine.orbits) {
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= samples; i++) {
      const a = (i / samples) * Math.PI * 2 + o.phase;
      const x0 = Math.cos(a) * o.rx;
      const y0 = Math.sin(a) * o.ry;
      const z0 = 0;
      const ct = Math.cos(o.tilt);
      const st = Math.sin(o.tilt);
      const y1 = y0 * ct - z0 * st;
      const z1 = y0 * st + z0 * ct;
      const cy = Math.cos(o.yaw);
      const sy = Math.sin(o.yaw);
      const x2 = x0 * cy + z1 * sy;
      const z2 = -x0 * sy + z1 * cy;
      pts.push({ x: x2, y: y1, z: z2 });
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = o.width;
    ctx.globalAlpha = w * 0.92;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const midZ = (a.z + b.z) / 2;
      if (hemisphere < 0 && midZ > 8) continue;
      if (hemisphere > 0 && midZ < -8) continue;
      const u = i / (pts.length - 1);
      const h = lerp(o.hueA, o.hueB, u);
      ctx.beginPath();
      ctx.strokeStyle = hueStroke(h, 0.95);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawStreaks(
  ctx: CanvasRenderingContext2D,
  engine: GrokBotEngine,
  w: number,
  hemisphere: -1 | 1,
) {
  if (hemisphere < 0) return;
  const t = performance.now() / 1000;
  const streaks = [
    { y: -36, rot: -0.45, h0: 12, h1: 55, len: 150 },
    { y: -18, rot: -0.38, h0: 165, h1: 200, len: 120 },
    { y: -50, rot: -0.52, h0: 280, h1: 330, len: 110 },
  ];
  ctx.save();
  ctx.globalAlpha = w;
  ctx.lineCap = "round";
  for (const s of streaks) {
    ctx.save();
    ctx.rotate(s.rot + Math.sin(t) * 0.04);
    ctx.translate(-20, s.y);
    const g = ctx.createLinearGradient(-s.len / 2, 0, s.len / 2, 0);
    g.addColorStop(0, hueStroke(s.h0, 0));
    g.addColorStop(0.25, hueStroke(s.h0, 0.95));
    g.addColorStop(0.7, hueStroke(s.h1, 0.95));
    g.addColorStop(1, hueStroke(s.h1, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(-s.len / 2, 0);
    ctx.quadraticCurveTo(0, -18, s.len / 2, 8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, engine: GrokBotEngine) {
  const tr = engine.trail;
  if (tr.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1]!;
    const b = tr[i]!;
    const u = i / tr.length;
    ctx.strokeStyle = hueStroke(b.hue, u * 0.85);
    ctx.lineWidth = lerp(2, 10, u);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparks(ctx: CanvasRenderingContext2D, engine: GrokBotEngine) {
  for (const s of engine.sparks) {
    const u = 1 - s.life / s.max;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    ctx.strokeStyle = hueStroke(s.hue, u);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s.len * u, 0);
    ctx.lineTo(s.len * u, 0);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDebug(
  ctx: CanvasRenderingContext2D,
  engine: GrokBotEngine,
  theme: ThemeColors,
) {
  ctx.save();
  ctx.strokeStyle = theme.grok;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, FACE_R, 0, Math.PI * 2);
  ctx.stroke();

  const L = engine.projectedEye("left");
  const R = engine.projectedEye("right");
  for (const eye of [L, R]) {
    ctx.beginPath();
    ctx.arc(eye.eye.x, eye.eye.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = theme.grok;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(eye.eye.x - 8, eye.eye.y);
    ctx.lineTo(eye.eye.x + 8, eye.eye.y);
    ctx.moveTo(eye.eye.x, eye.eye.y - 8);
    ctx.lineTo(eye.eye.x, eye.eye.y + 8);
    ctx.stroke();
  }
  ctx.restore();
}

export function bodyPathD(engine: GrokBotEngine): string {
  const pts = engine.bodyPoints();
  if (!pts.length) return "";
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x.toFixed(1)} ${pts[i]!.y.toFixed(1)}`;
  }
  return d + " Z";
}

export { stadiumPath };
