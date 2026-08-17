import type { Point, Spring } from "./types";

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function springOf(value = 0): Spring {
  return { value, vel: 0 };
}

/** Critically-damped-ish spring. `speed` maps to the atelier slider (≈7). */
export function stepSpring(
  s: Spring,
  target: number,
  dt: number,
  speed: number,
  zeta = 0.9,
) {
  const omega = Math.max(0.4, speed);
  const acc = (target - s.value) * omega * omega - 2 * zeta * omega * s.vel;
  s.vel += acc * dt;
  s.value += s.vel * dt;
  if (Math.abs(target - s.value) < 0.0006 && Math.abs(s.vel) < 0.004) {
    s.value = target;
    s.vel = 0;
  }
}

export function snapSpring(s: Spring, value: number) {
  s.value = value;
  s.vel = 0;
}

export function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function rotate(p: Point, ang: number): Point {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/**
 * Project a face-space point onto a sphere, apply yaw/pitch, then
 * perspective-project back to 2D. Returns depth in [-1, 1] (front > 0).
 */
export function projectSphere(
  x: number,
  y: number,
  yaw: number,
  pitch: number,
  radius: number,
): { x: number; y: number; z: number; visible: number } {
  const r2 = x * x + y * y;
  const maxR = radius * 0.96;
  const clamped = r2 > maxR * maxR ? maxR / Math.sqrt(r2) : 1;
  const px = x * clamped;
  const py = y * clamped;
  const z0 = Math.sqrt(Math.max(0, radius * radius - px * px - py * py));

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = px * cy + z0 * sy;
  const z1 = -px * sy + z0 * cy;

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = py * cp - z1 * sp;
  const z2 = py * sp + z1 * cp;

  const persp = 1 / (1 + (radius - z2) * 0.0032);
  const visible = clamp((z2 / radius + 0.35) / 1.15, 0.35, 1);

  return { x: x1 * persp, y: y2 * persp, z: z2 / radius, visible };
}

/** Polar radius of a regular n-gon with a vertex (or flat) alignment. */
export function polyRadius(theta: number, sides: number, R: number, turn = 0) {
  const a = (Math.PI * 2) / sides;
  const t = theta + turn;
  const half = a / 2;
  const sector = ((((t + half) % a) + a) % a) - half;
  return (R * Math.cos(half)) / Math.cos(sector);
}

export function resampleClosed(pts: Point[], count: number): Point[] {
  if (pts.length === 0) return Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  const closed = pts[0] && pts[pts.length - 1]
    ? [...pts, pts[0]]
    : pts;
  const segs: number[] = [0];
  let total = 0;
  for (let i = 1; i < closed.length; i++) {
    total += dist(closed[i - 1]!, closed[i]!);
    segs.push(total);
  }
  if (total < 1e-6) {
    return Array.from({ length: count }, () => ({ ...pts[0]! }));
  }
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    let lo = 0;
    while (lo < segs.length - 2 && segs[lo + 1]! < target) lo++;
    const a = segs[lo]!;
    const b = segs[lo + 1]!;
    const t = b === a ? 0 : (target - a) / (b - a);
    out.push(lerpPoint(closed[lo]!, closed[lo + 1]!, t));
  }
  return out;
}

export function pathToD(pts: Point[]): string {
  if (!pts.length) return "";
  const p0 = pts[0]!;
  let d = `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return d + " Z";
}
