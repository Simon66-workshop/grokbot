import {
  FACE_R,
  GAZE_CLAMP,
  GAZE_GAIN_X,
  GAZE_GAIN_Y,
  type EngineSnapshot,
  type EyeParams,
  type FaceColor,
  type FaceMode,
  type ShapeId,
  type Spring,
  type StateId,
} from "./types";
import { clamp, lerp, projectSphere, snapSpring, springOf, stepSpring } from "./math";
import { EXPRESSIONS, getExpression } from "./expressions";
import { bodyForShape } from "./shapes";
import { exclaimStem, stadiumPath } from "./paths";
import { DEMO_CUES } from "./demo";

/** Child-like ball hop: crouch, three quick bounces, pause, one big jump. */
const BOUNCE_CUES: { at: number; hop: number; squash: number; tilt: number }[] = [
  { at: 0.0, hop: 0, squash: 0.8, tilt: 0 },
  { at: 0.1, hop: 0.56, squash: 1.16, tilt: -0.06 },
  { at: 0.36, hop: 0, squash: 0.7, tilt: 0.02 },
  { at: 0.46, hop: 0.3, squash: 1.1, tilt: 0.05 },
  { at: 0.64, hop: 0, squash: 0.76, tilt: -0.02 },
  { at: 0.72, hop: 0.22, squash: 1.08, tilt: -0.04 },
  { at: 0.86, hop: 0, squash: 0.84, tilt: 0 },
  { at: 1.04, hop: 0, squash: 1, tilt: 0 },
  { at: 1.26, hop: 0, squash: 0.74, tilt: 0.03 },
  { at: 1.38, hop: 0.8, squash: 1.2, tilt: -0.08 },
  { at: 1.8, hop: 0, squash: 0.66, tilt: 0.04 },
  { at: 1.92, hop: 0.14, squash: 1.06, tilt: 0 },
  { at: 2.06, hop: 0, squash: 0.9, tilt: 0 },
  { at: 2.2, hop: 0, squash: 1, tilt: 0 },
];

export type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  len: number;
  ang: number;
};

export type Orbit = {
  rx: number;
  ry: number;
  tilt: number;
  yaw: number;
  speed: number;
  phase: number;
  hueA: number;
  hueB: number;
  width: number;
};

export type TrailPt = { x: number; y: number; t: number; hue: number };

type Targets = {
  gazeX: number;
  gazeY: number;
  yaw: number;
  pitch: number;
  eyeScale: number;
  bodyScale: number;
  faceW: number;
  dotsW: number;
  exclaimW: number;
  satW: number;
  orbitW: number;
  streakW: number;
  eyeAlpha: number;
  blink: number;
  flyX: number;
  flyY: number;
  spin: number;
  hop: number;
  squash: number;
};

function eyeSpring(p: EyeParams) {
  return {
    x: springOf(p.x),
    y: springOf(p.y),
    w: springOf(p.w),
    h: springOf(p.h),
    rot: springOf(p.rot),
    round: springOf(p.round),
    alpha: springOf(p.alpha),
  };
}

type EyeSpring = ReturnType<typeof eyeSpring>;

function stepEye(s: EyeSpring, t: EyeParams, dt: number, speed: number) {
  stepSpring(s.x, t.x, dt, speed);
  stepSpring(s.y, t.y, dt, speed);
  stepSpring(s.w, t.w, dt, speed);
  stepSpring(s.h, t.h, dt, speed);
  stepSpring(s.rot, t.rot, dt, speed);
  stepSpring(s.round, t.round, dt, speed);
  stepSpring(s.alpha, t.alpha, dt, speed);
}

function readEye(s: EyeSpring): EyeParams {
  return {
    x: s.x.value,
    y: s.y.value,
    w: s.w.value,
    h: s.h.value,
    rot: s.rot.value,
    round: s.round.value,
    alpha: s.alpha.value,
  };
}

export class GrokBotEngine {
  expression = 0;
  shape: ShapeId = "circle";
  state: StateId = "idle";
  faceColor: FaceColor = "blue";
  springSpeed = 7;
  flipX = false;
  emphasis = false;
  debug = false;
  followPointer = true;
  autoIdle = true;
  reducedMotion = false;

  readonly left: EyeSpring;
  readonly right: EyeSpring;
  body: ReturnType<typeof bodyForShape>;
  bodyCurr: { x: Spring; y: Spring }[];

  readonly t: { [K in keyof Targets]: Spring };
  tgt: Targets;

  pointer: { x: number; y: number; active: boolean } = {
    x: 0,
    y: 0,
    active: false,
  };

  orbits: Orbit[] = [];
  sparks: Spark[] = [];
  trail: TrailPt[] = [];
  satellites = [
    { ang: 0, dist: 42, r: 7, hue: 0 },
    { ang: 2.1, dist: 48, r: 5.5, hue: 0 },
    { ang: 4.2, dist: 36, r: 4.5, hue: 0 },
  ];

  demoPlaying = false;
  demoName = "idle";
  private demoT0 = 0;
  private demoIdx = 0;

  private last = 0;
  private elapsed = 0;
  private nextBlink = 3.2;
  private stateUntil = 0;
  private lookPhase = 0;
  private bounceT0 = 0;
  private bounceHold = false;

  constructor() {
    const rest = getExpression(0);
    this.left = eyeSpring(rest.left);
    this.right = eyeSpring(rest.right);
    this.body = bodyForShape("circle");
    this.bodyCurr = this.body.map((p) => ({ x: springOf(p.x), y: springOf(p.y) }));
    this.tgt = this.defaultTargets();
    this.t = {
      gazeX: springOf(0),
      gazeY: springOf(0),
      yaw: springOf(0),
      pitch: springOf(0),
      eyeScale: springOf(1),
      bodyScale: springOf(1),
      faceW: springOf(1),
      dotsW: springOf(0),
      exclaimW: springOf(0),
      satW: springOf(0),
      orbitW: springOf(0),
      streakW: springOf(0),
      eyeAlpha: springOf(1),
      blink: springOf(1),
      flyX: springOf(0),
      flyY: springOf(0),
      spin: springOf(0),
      hop: springOf(0),
      squash: springOf(1),
    };
    this.seedOrbits();
  }

  private defaultTargets(): Targets {
    return {
      gazeX: 0,
      gazeY: 0,
      yaw: 0,
      pitch: 0,
      eyeScale: 1,
      bodyScale: 1,
      faceW: 1,
      dotsW: 0,
      exclaimW: 0,
      satW: 0,
      orbitW: 0,
      streakW: 0,
      eyeAlpha: 1,
      blink: 1,
      flyX: 0,
      flyY: 0,
      spin: 0,
      hop: 0,
      squash: 1,
    };
  }

  private seedOrbits() {
    this.orbits = [
      { rx: 118, ry: 42, tilt: 0.7, yaw: 0.2, speed: 0.85, phase: 0, hueA: 12, hueB: 48, width: 5.5 },
      { rx: 108, ry: 54, tilt: -0.55, yaw: 1.1, speed: -0.62, phase: 1.4, hueA: 265, hueB: 200, width: 5 },
      { rx: 96, ry: 70, tilt: 1.05, yaw: 2.2, speed: 0.48, phase: 2.6, hueA: 165, hueB: 195, width: 4.5 },
      { rx: 124, ry: 28, tilt: 0.25, yaw: 0.6, speed: 1.05, phase: 0.8, hueA: 300, hueB: 170, width: 4 },
    ];
  }

  setExpression(id: number) {
    this.expression = ((id % 25) + 25) % 25;
    if (this.state === "sleep") this.goIdle();
  }

  setShape(id: ShapeId) {
    this.shape = id;
    if (id === "dot") this.tgt.bodyScale = 0.18;
    else if (this.tgt.faceW > 0.5) this.tgt.bodyScale = 1;
  }

  setGaze(nx: number, ny: number) {
    this.tgt.gazeX = clamp(nx, -1, 1);
    this.tgt.gazeY = clamp(ny, -1, 1);
  }

  setRotation(yaw: number, pitch: number) {
    this.tgt.yaw = yaw;
    this.tgt.pitch = pitch;
  }

  setEyeScale(s: number) {
    this.tgt.eyeScale = clamp(s, 0.35, 2.2);
  }

  setSpringSpeed(s: number) {
    this.springSpeed = clamp(s, 1, 18);
  }

  setFlipX(v: boolean) {
    this.flipX = v;
  }

  setEmphasis(v: boolean) {
    this.emphasis = v;
  }

  setDebug(v: boolean) {
    this.debug = v;
  }

  setFaceColor(c: FaceColor) {
    this.faceColor = c;
  }

  setFollowPointer(v: boolean) {
    this.followPointer = v;
    if (!v) this.pointer.active = false;
  }

  setAutoIdle(v: boolean) {
    this.autoIdle = v;
  }

  pointerMove(nx: number, ny: number) {
    this.pointer.x = nx;
    this.pointer.y = ny;
    this.pointer.active = true;
  }

  pointerLeave() {
    this.pointer.active = false;
  }

  blink() {
    this.tgt.blink = 0.08;
    this.tgt.bodyScale = 0.965;
    this.stateUntil = this.elapsed + 0.11;
    if (this.state === "idle") this.state = "blink";
  }

  reset() {
    this.stopDemo();
    this.goIdle();
    this.expression = 0;
    this.shape = "circle";
    this.tgt = this.defaultTargets();
    this.pointer.active = false;
    this.sparks.length = 0;
    this.trail.length = 0;
    this.flipX = false;
    this.emphasis = false;
    const rest = getExpression(0);
    snapSpring(this.left.x, rest.left.x);
    snapSpring(this.left.y, rest.left.y);
    snapSpring(this.right.x, rest.right.x);
    snapSpring(this.right.y, rest.right.y);
  }

  goIdle() {
    this.state = "idle";
    this.tgt.faceW = 1;
    this.tgt.dotsW = 0;
    this.tgt.exclaimW = 0;
    this.tgt.satW = 0;
    this.tgt.orbitW = 0;
    this.tgt.streakW = 0;
    this.tgt.eyeAlpha = 1;
    this.tgt.blink = 1;
    this.tgt.bodyScale = this.shape === "dot" ? 0.18 : 1;
    this.tgt.yaw = 0;
    this.tgt.pitch = 0;
    this.tgt.flyX = 0;
    this.tgt.flyY = 0;
    this.tgt.spin = 0;
    this.tgt.gazeX = 0;
    this.tgt.gazeY = 0;
    this.tgt.hop = 0;
    this.tgt.squash = 1;
    this.bounceHold = false;
    this.nextBlink = this.elapsed + 2.4 + Math.random() * 2.6;
  }

  play(state: StateId) {
    this.state = state;
    this.tgt.flyX = 0;
    this.tgt.flyY = 0;

    switch (state) {
      case "idle":
        this.goIdle();
        break;
      case "blink":
        this.blink();
        break;
      case "look":
        this.tgt.faceW = 1;
        this.tgt.dotsW = 0;
        this.tgt.exclaimW = 0;
        this.tgt.eyeAlpha = 1;
        this.tgt.bodyScale = 1;
        this.lookPhase = 0;
        this.stateUntil = this.elapsed + 3.2;
        break;
      case "loading":
        this.tgt.faceW = 0;
        this.tgt.dotsW = 1;
        this.tgt.exclaimW = 0;
        this.tgt.orbitW = 0;
        this.tgt.eyeAlpha = 0;
        this.tgt.bodyScale = 0.22;
        this.stateUntil = this.elapsed + 2.4;
        break;
      case "exclaim":
        this.tgt.faceW = 0;
        this.tgt.dotsW = 0;
        this.tgt.exclaimW = 1;
        this.tgt.eyeAlpha = 0;
        this.tgt.bodyScale = 1;
        this.tgt.orbitW = 0;
        this.stateUntil = this.elapsed + 2.2;
        break;
      case "exclaim-fly":
        this.tgt.faceW = 0;
        this.tgt.dotsW = 0;
        this.tgt.exclaimW = 1;
        this.tgt.eyeAlpha = 0;
        this.tgt.flyX = 1.15;
        this.tgt.flyY = 0.35;
        this.stateUntil = this.elapsed + 1.4;
        break;
      case "focus":
        this.expression = 9;
        this.tgt.faceW = 1;
        this.tgt.dotsW = 0;
        this.tgt.exclaimW = 0;
        this.tgt.satW = 1;
        this.tgt.eyeAlpha = 1;
        this.tgt.bodyScale = 1;
        this.stateUntil = this.elapsed + 2.4;
        break;
      case "shrink":
        this.tgt.faceW = 1;
        this.tgt.eyeAlpha = 0;
        this.tgt.bodyScale = 0.14;
        this.tgt.dotsW = 0;
        this.tgt.exclaimW = 0;
        this.tgt.orbitW = 0;
        this.stateUntil = this.elapsed + 1.6;
        break;
      case "egg":
        this.shape = "egg";
        this.goIdle();
        this.state = "egg";
        break;
      case "hex":
        this.shape = "hex";
        this.goIdle();
        this.state = "hex";
        break;
      case "triangle":
        this.shape = "triangle";
        this.goIdle();
        this.state = "triangle";
        break;
      case "streaks":
        this.shape = "triangle";
        this.tgt.faceW = 1;
        this.tgt.streakW = 1;
        this.tgt.orbitW = 0;
        this.tgt.eyeAlpha = 1;
        this.tgt.bodyScale = 1;
        this.stateUntil = this.elapsed + 2.2;
        break;
      case "orbits":
        this.tgt.orbitW = 1;
        this.tgt.streakW = 0;
        this.tgt.eyeAlpha = 0.15;
        this.tgt.faceW = 1;
        this.tgt.bodyScale = 1;
        this.stateUntil = this.elapsed + 3.4;
        break;
      case "sparkle":
        this.goIdle();
        this.state = "sparkle";
        this.burstSparks(18);
        this.stateUntil = this.elapsed + 1.8;
        break;
      case "sleep":
        this.expression = 7;
        this.tgt.faceW = 1;
        this.tgt.eyeAlpha = 1;
        this.tgt.bodyScale = 1;
        break;
      case "trail":
        this.tgt.faceW = 1;
        this.tgt.eyeAlpha = 0;
        this.tgt.bodyScale = 0.16;
        this.tgt.orbitW = 0;
        this.tgt.flyX = -0.55;
        this.tgt.flyY = -0.2;
        this.stateUntil = this.elapsed + 1.5;
        break;
      case "think":
        this.tgt.orbitW = 1;
        this.tgt.eyeAlpha = 1;
        this.tgt.faceW = 1;
        this.tgt.bodyScale = 1;
        this.stateUntil = this.elapsed + 4;
        break;
      case "bounce":
        this.tgt.faceW = 1;
        this.tgt.dotsW = 0;
        this.tgt.exclaimW = 0;
        this.tgt.orbitW = 0;
        this.tgt.streakW = 0;
        this.tgt.eyeAlpha = 1;
        this.tgt.bodyScale = 1;
        this.tgt.flyX = 0;
        this.tgt.flyY = 0;
        this.expression = 5;
        this.bounceT0 = this.elapsed;
        this.bounceHold = true;
        this.stateUntil = Number.POSITIVE_INFINITY;
        break;
    }
  }

  playDemo() {
    this.demoPlaying = true;
    this.demoT0 = this.elapsed;
    this.demoIdx = 0;
    this.demoName = "tour";
    this.resetSoft();
    DEMO_CUES[0]?.run(this);
  }

  stopDemo() {
    this.demoPlaying = false;
    this.demoName = "idle";
  }

  private resetSoft() {
    this.tgt = this.defaultTargets();
    this.shape = "circle";
    this.expression = 0;
    this.sparks.length = 0;
    this.trail.length = 0;
  }

  burstSparks(n: number) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 70 + Math.random() * 50;
      this.sparks.push({
        x: Math.cos(ang) * d,
        y: Math.sin(ang) * d,
        vx: Math.cos(ang) * (20 + Math.random() * 40),
        vy: Math.sin(ang) * (20 + Math.random() * 40),
        life: 0,
        max: 0.45 + Math.random() * 0.55,
        hue: Math.random() * 360,
        len: 6 + Math.random() * 10,
        ang,
      });
    }
  }

  tick(now: number) {
    if (!this.last) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = clamp(dt, 0, 0.034);
    if (this.reducedMotion) dt *= 0.25;
    this.elapsed += dt;
    const speed = this.reducedMotion ? 18 : this.springSpeed;

    this.tickDemo();
    this.tickBehaviors(dt);
    this.tickGaze();

    const expr = getExpression(this.expression);
    const blink = this.t.blink.value;
    const leftT = { ...expr.left, h: expr.left.h * blink, alpha: expr.left.alpha };
    const rightT = { ...expr.right, h: expr.right.h * blink, alpha: expr.right.alpha };
    stepEye(this.left, leftT, dt, speed);
    stepEye(this.right, rightT, dt, speed);

    const bodyTarget = this.tgt.exclaimW > 0.55 ? exclaimStem() : bodyForShape(this.shape, this.elapsed);
    if (this.bodyCurr.length !== bodyTarget.length) {
      this.bodyCurr = bodyTarget.map((p) => ({ x: springOf(p.x), y: springOf(p.y) }));
    }
    const bodySpeed = speed * (this.tgt.exclaimW > 0.2 ? 0.85 : 1);
    for (let i = 0; i < bodyTarget.length; i++) {
      const p = bodyTarget[i]!;
      const c = this.bodyCurr[i]!;
      stepSpring(c.x, p.x, dt, bodySpeed);
      stepSpring(c.y, p.y, dt, bodySpeed);
    }

    (Object.keys(this.tgt) as (keyof Targets)[]).forEach((k) => {
      const boost = k === "blink" || k === "hop" || k === "squash" ? 2.15 : 1;
      stepSpring(this.t[k], this.tgt[k], dt, speed * boost);
    });

    for (const o of this.orbits) {
      o.phase += o.speed * dt;
      o.yaw += o.speed * 0.35 * dt;
    }
    for (const s of this.satellites) {
      s.ang += dt * 1.4;
    }

    for (const sp of this.sparks) {
      sp.life += dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vx *= 0.96;
      sp.vy *= 0.96;
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);

    const fx = this.t.flyX.value * FACE_R * 1.4;
    const fy = this.t.flyY.value * FACE_R * 1.4;
    if (this.tgt.bodyScale < 0.4 || Math.abs(this.tgt.flyX) > 0.05 || this.t.orbitW.value > 0.2) {
      this.trail.push({
        x: fx,
        y: fy,
        t: this.elapsed,
        hue: (this.elapsed * 140) % 360,
      });
      if (this.trail.length > 48) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }
  }

  private tickDemo() {
    if (!this.demoPlaying) return;
    const t = this.elapsed - this.demoT0;
    while (this.demoIdx < DEMO_CUES.length && t >= DEMO_CUES[this.demoIdx]!.at) {
      const cue = DEMO_CUES[this.demoIdx]!;
      cue.run(this);
      this.demoName = cue.name;
      this.demoIdx++;
    }
    if (this.demoIdx >= DEMO_CUES.length && t > (DEMO_CUES[DEMO_CUES.length - 1]?.at ?? 0) + 1.2) {
      this.demoPlaying = false;
      this.goIdle();
      this.demoName = "idle";
    }
  }

  private tickBehaviors(dt: number) {
    if (
      this.autoIdle &&
      this.state === "idle" &&
      !this.demoPlaying &&
      !this.reducedMotion
    ) {
      this.tgt.bodyScale = 1 + Math.sin(this.elapsed * 1.05) * 0.014;
    }

    if (this.state === "blink" && this.elapsed > this.stateUntil) {
      this.tgt.blink = 1;
      this.tgt.bodyScale = 1;
      if (this.elapsed > this.stateUntil + 0.16) {
        this.state = "idle";
        if (this.nextBlink <= this.elapsed + 0.05) {
          this.nextBlink = this.elapsed + 2.2 + Math.random() * 3.4;
        }
      }
    }

    if (this.state === "look") {
      this.lookPhase += dt;
      const p = this.lookPhase;
      this.tgt.yaw = Math.sin(p * 1.15) * 0.38;
      this.tgt.pitch = Math.sin(p * 0.85 + 0.4) * 0.22;
      if (this.elapsed > this.stateUntil) this.goIdle();
    }

    if (this.state === "sparkle" && Math.random() < dt * 8) {
      this.burstSparks(2);
    }

    if (this.state === "bounce") {
      this.tickBounce();
    }

    if (
      this.autoIdle &&
      this.state === "idle" &&
      !this.demoPlaying &&
      this.elapsed > this.nextBlink
    ) {
      const roll = Math.random();
      if (roll < 0.16) {
        this.play("bounce");
        this.bounceHold = false;
        this.stateUntil = this.elapsed + 2.35;
      } else if (roll < 0.34) {
        this.play("look");
        this.stateUntil = this.elapsed + 1.1;
      } else if (roll < 0.5) {
        this.blink();
        this.nextBlink = this.elapsed + 0.42;
      } else {
        this.blink();
      }
    }

    if (this.state !== "idle" && this.state !== "sleep" && this.state !== "blink") {
      if (this.stateUntil && this.elapsed > this.stateUntil && !this.demoPlaying) {
        if (this.state === "exclaim-fly" || this.state === "trail" || this.state === "bounce") {
          this.tgt.flyX = 0;
          this.tgt.flyY = 0;
          this.tgt.hop = 0;
          this.tgt.squash = 1;
          this.tgt.bodyScale = 1;
          this.tgt.eyeAlpha = 1;
          this.tgt.faceW = 1;
          this.tgt.exclaimW = 0;
          this.expression = 0;
          this.state = "idle";
        } else if (this.state === "loading" || this.state === "shrink") {
          /* hold until user changes */
        } else if (this.state === "orbits" || this.state === "think" || this.state === "streaks") {
          /* hold */
        }
      }
    }
  }

  private tickBounce() {
    const CYCLE = 2.32;
    let t = this.elapsed - this.bounceT0;
    if (this.bounceHold && t > CYCLE) {
      this.bounceT0 = this.elapsed;
      t = 0;
    }
    const cues = BOUNCE_CUES;
    let cue = cues[0]!;
    for (const c of cues) {
      if (c.at <= t) cue = c;
    }
    this.tgt.hop = cue.hop;
    this.tgt.squash = cue.squash;
    this.tgt.yaw = cue.tilt;
    this.tgt.bodyScale = 1;
  }

  private tickGaze() {
    if (this.followPointer && this.pointer.active && !this.demoPlaying) {
      this.tgt.gazeX = this.pointer.x;
      this.tgt.gazeY = this.pointer.y;
    } else if (this.autoIdle && this.state === "idle" && !this.demoPlaying) {
      const t = this.elapsed;
      this.tgt.gazeX = 0.28 * Math.sin(t * 0.33) * Math.sin(t * 0.17);
      this.tgt.gazeY = 0.16 * Math.sin(t * 0.27 + 1.1);
    }
  }

  bodyPoints() {
    return this.bodyCurr.map((p) => ({ x: p.x.value, y: p.y.value }));
  }

  projectedEye(side: "left" | "right") {
    const src = side === "left" ? readEye(this.left) : readEye(this.right);
    const gain = this.emphasis ? 1.18 : 1;
    const gx = clamp(this.t.gazeX.value, -GAZE_CLAMP, GAZE_CLAMP) * GAZE_GAIN_X * gain;
    const gy = clamp(this.t.gazeY.value, -GAZE_CLAMP, GAZE_CLAMP) * GAZE_GAIN_Y * gain;
    let x = src.x + gx;
    let y = src.y + gy;
    if (this.flipX) x = -x;
    const scale = this.t.eyeScale.value * (this.emphasis ? 1.12 : 1);
    const pr = projectSphere(x, y, this.t.yaw.value, this.t.pitch.value, FACE_R);
    const foreshort = lerp(0.28, 1, pr.visible);
    const eye: EyeParams = {
      x: pr.x,
      y: pr.y,
      w: src.w * scale * foreshort,
      h: src.h * scale * lerp(0.55, 1, pr.visible),
      rot: (this.flipX ? -src.rot : src.rot) + this.t.yaw.value * 0.25,
      round: src.round,
      alpha: src.alpha * this.t.eyeAlpha.value * pr.visible,
    };
    return { eye, depth: pr.z, path: stadiumPath(eye), visible: pr.visible };
  }

  snapshot(): EngineSnapshot {
    return {
      expression: this.expression,
      shape: this.shape,
      state: this.state,
      gazeX: this.t.gazeX.value,
      gazeY: this.t.gazeY.value,
      yaw: this.t.yaw.value,
      pitch: this.t.pitch.value,
      eyeScale: this.t.eyeScale.value,
      springSpeed: this.springSpeed,
      bodyScale: this.t.bodyScale.value,
      mode:
        this.t.exclaimW.value > 0.55
          ? "exclaim"
          : this.t.dotsW.value > 0.55
            ? "loading"
            : this.t.satW.value > 0.55
              ? "satellites"
              : "face",
      demoPlaying: this.demoPlaying,
      demoName: this.demoName,
    };
  }

  units() {
    const nx = clamp(this.t.gazeX.value, -GAZE_CLAMP, GAZE_CLAMP);
    const ny = clamp(this.t.gazeY.value, -GAZE_CLAMP, GAZE_CLAMP);
    return {
      nx,
      ny,
      ux: nx * GAZE_GAIN_X,
      uy: ny * GAZE_GAIN_Y,
    };
  }
}

export { EXPRESSIONS };
