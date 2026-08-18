export type SceneId = "work" | "companion" | "demo";

export type IdlePolicy = {
  breathe: number;
  blink: boolean;
  autoLook: boolean;
  autoBounce: number;
  followPointer: boolean;
  sfx: boolean;
  sleepAfter: number;
};

export const SCENES: Record<
  SceneId,
  { label: string; hint: string; idle: IdlePolicy }
> = {
  work: {
    label: "Work",
    hint: "Quiet. Breath and blink only.",
    idle: {
      breathe: 0.008,
      blink: true,
      autoLook: false,
      autoBounce: 0,
      followPointer: false,
      sfx: false,
      sleepAfter: 0,
    },
  },
  companion: {
    label: "Play",
    hint: "Looks at you. Sometimes hops. Naps if left alone.",
    idle: {
      breathe: 0.016,
      blink: true,
      autoLook: true,
      autoBounce: 0.16,
      followPointer: true,
      sfx: true,
      sleepAfter: 90,
    },
  },
  demo: {
    label: "Demo",
    hint: "Plays the tour.",
    idle: {
      breathe: 0.012,
      blink: true,
      autoLook: false,
      autoBounce: 0,
      followPointer: false,
      sfx: true,
      sleepAfter: 0,
    },
  },
};

export const SCENE_KEY = "grok-scene";

export function readScene(): SceneId {
  try {
    const v = localStorage.getItem(SCENE_KEY);
    if (v === "work" || v === "companion" || v === "demo") return v;
  } catch {
    /* ignore */
  }
  return "companion";
}

export function writeScene(id: SceneId) {
  try {
    localStorage.setItem(SCENE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function isSceneId(v: string): v is SceneId {
  return v === "work" || v === "companion" || v === "demo";
}
