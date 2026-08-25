import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Keep in sync with src/lib/grokbot/ribbons.ts */
function closestDistToSegment(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  return Math.hypot(ax + t * dx - cx, ay + t * dy - cy);
}

function segmentHitsDisk(ax, ay, bx, by, cx, cy, r) {
  return closestDistToSegment(ax, ay, bx, by, cx, cy) < r;
}

function shouldDrawRibbonSeg(midZ, ax, ay, bx, by, clip, stroke, hemisphere) {
  if (hemisphere < 0) return midZ <= 0;
  if (midZ <= 0) return false;
  return !segmentHitsDisk(ax, ay, bx, by, clip.cx, clip.cy, clip.r + stroke * 0.55);
}

const clip = { cx: 0, cy: 0, r: 100 };

test("chord through the disk is a hit even when the midpoint is outside", () => {
  assert.equal(segmentHitsDisk(-90, 80, 90, 80, 0, 0, 100), true);
  // Both ends and the midpoint sit outside; the closest point on the segment is still inside.
  assert.equal(segmentHitsDisk(20, 80, 20, 200, 0, 0, 100), true);
  assert.equal(Math.hypot((20 + 20) / 2, (80 + 200) / 2) > 100, true);
});

test("front ribbon segments on the body disk are not drawn", () => {
  assert.equal(shouldDrawRibbonSeg(20, -40, 0, 40, 0, clip, 5, 1), false);
  assert.equal(shouldDrawRibbonSeg(20, 118, 0, 130, 8, clip, 5, 1), true);
  assert.equal(shouldDrawRibbonSeg(-20, -40, 0, 40, 0, clip, 5, 1), false);
});

test("back ribbon segments may sit under the body; the fill covers them", () => {
  assert.equal(shouldDrawRibbonSeg(-20, -40, 0, 40, 0, clip, 5, -1), true);
  assert.equal(shouldDrawRibbonSeg(20, 118, 0, 130, 8, clip, 5, -1), false);
});

test("renderer punches the body ellipse and uses segment tests, not evenodd midpoint clip", () => {
  const src = readFileSync(new URL("../src/lib/grokbot/renderer.ts", import.meta.url), "utf8");
  assert.match(src, /shouldDrawRibbonSeg/);
  assert.match(src, /destination-out/);
  assert.match(src, /clip\.rx/);
  assert.doesNotMatch(src, /clip\("evenodd"\)/);
});
