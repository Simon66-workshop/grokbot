import type { GrokBotEngine } from "./engine";

export type DemoCue = {
  at: number;
  name: string;
  run: (e: GrokBotEngine) => void;
};

/** Choreography matching the official Grok Bot icon reel. */
export const DEMO_CUES: DemoCue[] = [
  {
    at: 0,
    name: "idle",
    run: (e) => {
      e.goIdle();
      e.setShape("circle");
      e.setExpression(0);
    },
  },
  {
    at: 0.85,
    name: "loading",
    run: (e) => e.play("loading"),
  },
  {
    at: 1.85,
    name: "look-right",
    run: (e) => {
      e.goIdle();
      e.setExpression(1);
      e.setRotation(0.72, 0.12);
    },
  },
  {
    at: 2.85,
    name: "squint-edge",
    run: (e) => {
      e.setExpression(6);
      e.setRotation(0.95, 0.42);
    },
  },
  {
    at: 3.75,
    name: "look-down",
    run: (e) => {
      e.setExpression(6);
      e.setRotation(0.35, 0.72);
    },
  },
  {
    at: 4.7,
    name: "joy",
    run: (e) => {
      e.setRotation(0, 0);
      e.setExpression(5);
    },
  },
  {
    at: 5.75,
    name: "exclaim",
    run: (e) => e.play("exclaim"),
  },
  {
    at: 6.8,
    name: "exclaim-fly",
    run: (e) => e.play("exclaim-fly"),
  },
  {
    at: 7.9,
    name: "idle",
    run: (e) => {
      e.goIdle();
      e.setExpression(0);
    },
  },
  {
    at: 8.85,
    name: "focus",
    run: (e) => e.play("focus"),
  },
  {
    at: 9.95,
    name: "exclaim",
    run: (e) => e.play("exclaim"),
  },
  {
    at: 11.7,
    name: "idle",
    run: (e) => {
      e.goIdle();
      e.setExpression(0);
    },
  },
  {
    at: 12.7,
    name: "shrink",
    run: (e) => e.play("shrink"),
  },
  {
    at: 13.7,
    name: "idle",
    run: (e) => e.goIdle(),
  },
  {
    at: 14.75,
    name: "squint-egg",
    run: (e) => {
      e.setExpression(6);
      e.setShape("egg");
    },
  },
  {
    at: 15.7,
    name: "egg",
    run: (e) => {
      e.setExpression(0);
      e.setShape("egg");
    },
  },
  {
    at: 16.7,
    name: "hex",
    run: (e) => e.setShape("hex"),
  },
  {
    at: 17.7,
    name: "triangle",
    run: (e) => {
      e.setShape("triangle");
      e.play("streaks");
    },
  },
  {
    at: 19.0,
    name: "tri-spin",
    run: (e) => {
      e.setShape("triangle");
      e.setRotation(0.4, 0.15);
      e.tgt.spin = 0.8;
      e.tgt.streakW = 0.7;
      e.tgt.eyeAlpha = 0;
    },
  },
  {
    at: 20.0,
    name: "orbits",
    run: (e) => {
      e.setShape("triangle");
      e.play("orbits");
    },
  },
  {
    at: 21.05,
    name: "orbits-circle",
    run: (e) => {
      e.setShape("circle");
      e.play("orbits");
    },
  },
  {
    at: 22.05,
    name: "sparkle",
    run: (e) => {
      e.setShape("circle");
      e.setRotation(0, 0);
      e.setExpression(2);
      e.play("sparkle");
    },
  },
  {
    at: 23.15,
    name: "idle",
    run: (e) => {
      e.goIdle();
      e.setExpression(0);
    },
  },
  {
    at: 24.0,
    name: "satellites",
    run: (e) => {
      e.play("shrink");
      e.tgt.satW = 1;
      e.tgt.dotsW = 0.35;
    },
  },
  {
    at: 25.0,
    name: "dot",
    run: (e) => {
      e.tgt.satW = 0;
      e.tgt.dotsW = 0;
      e.play("shrink");
    },
  },
  {
    at: 26.0,
    name: "idle",
    run: (e) => e.goIdle(),
  },
  {
    at: 27.05,
    name: "eyes-off",
    run: (e) => {
      e.setExpression(22);
      e.tgt.eyeAlpha = 0;
    },
  },
  {
    at: 27.85,
    name: "trail",
    run: (e) => e.play("trail"),
  },
  {
    at: 29.15,
    name: "grow",
    run: (e) => {
      e.tgt.flyX = 0;
      e.tgt.flyY = 0;
      e.tgt.bodyScale = 1;
      e.tgt.eyeAlpha = 0;
      e.tgt.faceW = 1;
      e.tgt.orbitW = 0.4;
    },
  },
  {
    at: 30.4,
    name: "idle",
    run: (e) => {
      e.goIdle();
      e.setShape("circle");
      e.setExpression(0);
    },
  },
];
