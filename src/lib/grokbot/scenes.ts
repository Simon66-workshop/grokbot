export type SceneId = "work" | "companion" | "demo";

export type IdlePolicy = {
  breathe: number;
  blink: boolean;
  autoLook: boolean;
  autoBounce: number;
  followPointer: boolean;
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
    },
  },
  companion: {
    label: "Play",
    hint: "Looks at you. Sometimes hops.",
    idle: {
      breathe: 0.016,
      blink: true,
      autoLook: true,
      autoBounce: 0.16,
      followPointer: true,
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
