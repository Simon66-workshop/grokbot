/** Ribbon vs body-disk geometry. Keep in sync with scripts/ribbon-z.test.mjs */

export type BodyClip = {
  cx: number;
  cy: number;
  r: number;
  rx: number;
  ry: number;
  rot: number;
};

export function closestDistToSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  return Math.hypot(ax + t * dx - cx, ay + t * dy - cy);
}

export function segmentHitsDisk(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
) {
  return closestDistToSegment(ax, ay, bx, by, cx, cy) < r;
}

/** Front strokes stay off the disk. Back strokes draw first; the body covers the silhouette. */
export function shouldDrawRibbonSeg(
  midZ: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  clip: Pick<BodyClip, "cx" | "cy" | "r">,
  stroke: number,
  hemisphere: -1 | 1,
) {
  if (hemisphere < 0) return midZ <= 0;
  if (midZ <= 0) return false;
  return !segmentHitsDisk(ax, ay, bx, by, clip.cx, clip.cy, clip.r + stroke * 0.55);
}
