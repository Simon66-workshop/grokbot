/** Shared input math for the packaged pet. Keep in sync with electron/main.mjs. */

export const DRAG_ARM_PX = 6;
export const DRAG_TICK_MS = 16;
export const BTN_POLL_MS = 180;
export const CURSOR_TICK_MS = 32;

export function ballRadius(box, faceScale, slop = 12) {
  return Number(box) * Number(faceScale) + slop;
}

export function cursorOverBall(cursor, ball, radius) {
  if (!cursor || !ball || !Number.isFinite(radius)) return false;
  return Math.hypot(cursor.x - ball.x, cursor.y - ball.y) <= radius;
}

/**
 * Packaged Electron + transparent NSPanel: `{forward:true}` only forwards
 * moves, and Chromium/GPU hit-testing often misses the canvas. Main must
 * decide click-through from ball geometry, not renderer pointerenter.
 */
export function shouldIgnoreMouse({
  dragging = false,
  dockOpen = false,
  overlayOn = false,
  overBall = false,
  rendererWantsClicks = false,
} = {}) {
  if (dragging || dockOpen || overlayOn || rendererWantsClicks || overBall) return false;
  return true;
}

export function shouldArmDrag(travel, armPx = DRAG_ARM_PX) {
  return Number(travel) >= armPx;
}

export function dragWasMove({ armed = false, travel = 0, armPx = DRAG_ARM_PX } = {}) {
  return Boolean(armed) || shouldArmDrag(travel, armPx);
}

export function packagedChromiumSwitches() {
  return ["disable-backgrounding-occluded-windows", "disable-renderer-backgrounding"];
}
