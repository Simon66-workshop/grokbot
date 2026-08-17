import { EYE_N, FACE_R, PATH_N, type EyeParams, type Point } from "./types";
import { lerp, polyRadius, resampleClosed } from "./math";

export function stadiumPath(eye: EyeParams, n = EYE_N): Point[] {
  const pts: Point[] = [];
  const hw = Math.max(0.4, eye.w);
  const hh = Math.max(0.4, eye.h);
  const r = Math.min(hw, hh) * lerp(0.35, 1, eye.round);
  const innerW = Math.max(0, hw - r);
  const innerH = Math.max(0, hh - r);
  const c = Math.cos(eye.rot);
  const s = Math.sin(eye.rot);

  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    const sx = Math.sign(ca) || 1;
    const sy = Math.sign(sa) || 1;
    const lx = innerW * sx + r * Math.abs(ca) * sx;
    const ly = innerH * sy + r * Math.abs(sa) * sy;
    pts.push({
      x: eye.x + lx * c - ly * s,
      y: eye.y + lx * s + ly * c,
    });
  }
  return pts;
}

export function polarBody(
  radiusFn: (theta: number) => number,
  n = PATH_N,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = radiusFn(theta);
    pts.push({ x: Math.cos(theta) * r, y: Math.sin(theta) * r });
  }
  return pts;
}

export function circleBody(r = FACE_R): Point[] {
  return polarBody(() => r);
}

export function blobBody(r = FACE_R, time = 0): Point[] {
  return polarBody((th) => {
    const wobble =
      0.018 * Math.sin(2 * th + 0.35 + time * 0.15) +
      0.01 * Math.sin(3 * th + 1.1);
    return r * (1 + wobble);
  });
}

export function eggBody(r = FACE_R): Point[] {
  return polarBody((th) => {
    const taper = 1 - 0.2 * Math.sin(th);
    const stretch = 1 + 0.14 * Math.sin(th);
    return r * taper * stretch * 0.96;
  });
}

export function hexBody(r = FACE_R): Point[] {
  return polarBody((th) => {
    const sharp = polyRadius(th, 6, r, Math.PI / 6);
    return lerp(sharp, r, 0.38);
  });
}

export function triangleBody(r = FACE_R): Point[] {
  return polarBody((th) => {
    const sharp = polyRadius(th, 3, r * 1.12, Math.PI / 2);
    return lerp(sharp, r, 0.46);
  });
}

export function dotBody(r = 14): Point[] {
  return circleBody(r);
}

/** Tall tapered capsule — the exclamation stem. Starts at the top, clockwise. */
export function exclaimStem(r = FACE_R): Point[] {
  const topW = r * 0.105;
  const botW = r * 0.048;
  const y0 = -r * 0.6;
  const y1 = r * 0.2;
  const raw: Point[] = [];

  for (let i = 0; i <= 22; i++) {
    const a = Math.PI + (i / 22) * Math.PI;
    raw.push({ x: Math.cos(a) * topW, y: y0 + Math.sin(a) * topW * 0.85 });
  }
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    raw.push({ x: lerp(topW, botW, t), y: lerp(y0, y1, t) });
  }
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI;
    raw.push({ x: Math.cos(a) * botW, y: y1 + Math.sin(a) * botW });
  }
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    raw.push({ x: lerp(-botW, -topW, t), y: lerp(y1, y0, t) });
  }
  return resampleClosed(raw, PATH_N);
}
