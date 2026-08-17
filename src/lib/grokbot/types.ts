export type Point = { x: number; y: number };

export type EyeParams = {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  round: number;
  alpha: number;
};

export type ExpressionId = number;

export type ShapeId =
  | "blob"
  | "circle"
  | "egg"
  | "hex"
  | "triangle"
  | "dot";

export type FaceMode = "face" | "loading" | "exclaim" | "satellites";

export type FaceColor = string;

export type StateId =
  | "idle"
  | "blink"
  | "look"
  | "loading"
  | "exclaim"
  | "exclaim-fly"
  | "focus"
  | "shrink"
  | "egg"
  | "hex"
  | "triangle"
  | "streaks"
  | "orbits"
  | "sparkle"
  | "sleep"
  | "trail"
  | "think"
  | "bounce";

export type Spring = { value: number; vel: number };

export type EngineSnapshot = {
  expression: ExpressionId;
  shape: ShapeId;
  state: StateId;
  gazeX: number;
  gazeY: number;
  yaw: number;
  pitch: number;
  eyeScale: number;
  springSpeed: number;
  bodyScale: number;
  mode: FaceMode;
  demoPlaying: boolean;
  demoName: string;
};

export const PATH_N = 64;
export const EYE_N = 48;
export const FACE_R = 100;

export const GAZE_CLAMP = 0.6;
export const GAZE_GAIN_X = 22;
export const GAZE_GAIN_Y = 14;
