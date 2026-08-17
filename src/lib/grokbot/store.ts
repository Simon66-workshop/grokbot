import { create } from "zustand";
import { GROK_BLUE } from "./color";
import type { FaceColor, ShapeId, StateId } from "./types";
import type { SceneId } from "./scenes";

type AtelierState = {
  expression: number;
  shape: ShapeId;
  state: StateId;
  gazeX: number;
  gazeY: number;
  yawDeg: number;
  eyeScale: number;
  springSpeed: number;
  flipX: boolean;
  emphasis: boolean;
  debug: boolean;
  followPointer: boolean;
  autoIdle: boolean;
  faceColor: FaceColor;
  scene: SceneId;
  demoPlaying: boolean;
  demoName: string;
  liveGazeX: number;
  liveGazeY: number;
  liveUnitsX: number;
  liveUnitsY: number;
  liveState: StateId;
  liveShape: ShapeId;
  liveExpression: number;
  set: (p: Partial<AtelierState>) => void;
};

export const useAtelier = create<AtelierState>((set) => ({
  expression: 0,
  shape: "circle",
  state: "idle",
  gazeX: 0,
  gazeY: 0,
  yawDeg: 0,
  eyeScale: 1,
  springSpeed: 7,
  flipX: false,
  emphasis: false,
  debug: false,
  followPointer: true,
  autoIdle: true,
  faceColor: GROK_BLUE,
  scene: "companion",
  demoPlaying: false,
  demoName: "idle",
  liveGazeX: 0,
  liveGazeY: 0,
  liveUnitsX: 0,
  liveUnitsY: 0,
  liveState: "idle",
  liveShape: "circle",
  liveExpression: 0,
  set: (p) => set(p),
}));
