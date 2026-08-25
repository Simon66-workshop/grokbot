/** Keep in sync with src/lib/grokbot/layout.ts */

export const PET_SIZES = {
  s: { box: 200, faceScale: 0.3 },
  m: { box: 320, faceScale: 0.33 },
  l: { box: 440, faceScale: 0.24 },
};

export const STAGE_W = 580;
export const DOCK_ROOM = 230;

export function isPetSize(id) {
  return id === "s" || id === "m" || id === "l";
}

export function dockMainFor(box, faceScale) {
  const radius = box * faceScale;
  const lift = faceScale > 0.28 ? 0.06 * radius : 0;
  const ballBottom = box / 2 - lift + radius;
  return Math.round(Math.max(box - 72, ballBottom + 16));
}

export function layoutFor(id) {
  const size = PET_SIZES[isPetSize(id) ? id : "l"];
  const box = size.box;
  const h = box + DOCK_ROOM;
  return {
    id: isPetSize(id) ? id : "l",
    w: STAGE_W,
    h,
    box,
    faceScale: size.faceScale,
    dockMain: dockMainFor(box, size.faceScale),
    ball: {
      bottom: { x: STAGE_W / 2, y: box / 2 },
      top: { x: STAGE_W / 2, y: h - box / 2 },
      right: { x: box / 2, y: h / 2 },
      left: { x: STAGE_W - box / 2, y: h / 2 },
    },
  };
}
