/** Shared stage math. Keep in sync with electron/layout.mjs */

export type PetSizeId = "s" | "m" | "l";
export type DockSide = "bottom" | "top" | "left" | "right";

export const PET_SIZES: Record<
  PetSizeId,
  { box: number; faceScale: number; label: string; hint: string }
> = {
  s: { box: 200, faceScale: 0.3, label: "S", hint: "Small · 200" },
  m: { box: 320, faceScale: 0.33, label: "M", hint: "Medium · 320" },
  l: { box: 440, faceScale: 0.24, label: "L", hint: "Large · 440" },
};

export const STAGE_W = 580;
export const DOCK_ROOM = 230;
export const SIZE_KEY = "grok-pet-size";
export const AUTO_WORK_KEY = "grok-auto-work";
export const CODEX_WATCH_KEY = "grok-codex-watch";

export function isPetSize(id: string): id is PetSizeId {
  return id === "s" || id === "m" || id === "l";
}

export function readPetSize(): PetSizeId {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    if (isPetSize(v ?? "")) return v as PetSizeId;
  } catch {
    /* ignore */
  }
  return "l";
}

export function writePetSize(id: PetSizeId) {
  try {
    localStorage.setItem(SIZE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readAutoWork() {
  try {
    const v = localStorage.getItem(AUTO_WORK_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function writeAutoWork(on: boolean) {
  try {
    localStorage.setItem(AUTO_WORK_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readCodexWatch() {
  try {
    const v = localStorage.getItem(CODEX_WATCH_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function writeCodexWatch(on: boolean) {
  try {
    localStorage.setItem(CODEX_WATCH_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Dock top so chips sit below the body disk, not on it. */
export function dockMainFor(box: number, faceScale: number) {
  const radius = box * faceScale;
  const lift = faceScale > 0.28 ? 0.06 * radius : 0;
  const ballBottom = box / 2 - lift + radius;
  return Math.round(Math.max(box - 72, ballBottom + 16));
}

export function layoutFor(id: PetSizeId) {
  const size = PET_SIZES[id];
  const box = size.box;
  const inset = Math.round((STAGE_W - box) / 2);
  const h = box + DOCK_ROOM;
  return {
    id,
    w: STAGE_W,
    h,
    box,
    faceScale: size.faceScale,
    inset,
    dockMain: dockMainFor(box, size.faceScale),
    faceSideTop: Math.round((h - box) / 2),
    ball: {
      bottom: { x: STAGE_W / 2, y: box / 2 },
      top: { x: STAGE_W / 2, y: h - box / 2 },
      right: { x: box / 2, y: h / 2 },
      left: { x: STAGE_W - box / 2, y: h / 2 },
    } as Record<DockSide, { x: number; y: number }>,
  };
}

export function inWorkHours(d = new Date(), wasOn = false) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  if (wasOn) return m >= 8 * 60 + 45 && m < 18 * 60 + 20;
  return m >= 9 * 60 && m < 18 * 60;
}
