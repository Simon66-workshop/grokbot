"use strict";
(() => {
  // src/lib/grokbot/types.ts
  var PATH_N = 64;
  var EYE_N = 48;
  var FACE_R = 100;
  var GAZE_CLAMP = 0.6;
  var GAZE_GAIN_X = 22;
  var GAZE_GAIN_Y = 14;

  // src/lib/grokbot/math.ts
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerpPoint(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }
  function springOf(value = 0) {
    return { value, vel: 0 };
  }
  function stepSpring(s, target, dt, speed, zeta = 0.9) {
    const omega = Math.max(0.4, speed);
    const acc = (target - s.value) * omega * omega - 2 * zeta * omega * s.vel;
    s.vel += acc * dt;
    s.value += s.vel * dt;
    if (Math.abs(target - s.value) < 6e-4 && Math.abs(s.vel) < 4e-3) {
      s.value = target;
      s.vel = 0;
    }
  }
  function snapSpring(s, value) {
    s.value = value;
    s.vel = 0;
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function projectSphere(x, y, yaw, pitch, radius) {
    const r2 = x * x + y * y;
    const maxR = radius * 0.96;
    const clamped = r2 > maxR * maxR ? maxR / Math.sqrt(r2) : 1;
    const px = x * clamped;
    const py = y * clamped;
    const z0 = Math.sqrt(Math.max(0, radius * radius - px * px - py * py));
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x1 = px * cy + z0 * sy;
    const z1 = -px * sy + z0 * cy;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y2 = py * cp - z1 * sp;
    const z2 = py * sp + z1 * cp;
    const persp = 1 / (1 + (radius - z2) * 32e-4);
    const visible = clamp((z2 / radius + 0.35) / 1.15, 0.35, 1);
    return { x: x1 * persp, y: y2 * persp, z: z2 / radius, visible };
  }
  function polyRadius(theta, sides, R, turn = 0) {
    const a = Math.PI * 2 / sides;
    const t = theta + turn;
    const half = a / 2;
    const sector = ((t + half) % a + a) % a - half;
    return R * Math.cos(half) / Math.cos(sector);
  }
  function resampleClosed(pts, count) {
    if (pts.length === 0) return Array.from({ length: count }, () => ({ x: 0, y: 0 }));
    const closed = pts[0] && pts[pts.length - 1] ? [...pts, pts[0]] : pts;
    const segs = [0];
    let total = 0;
    for (let i = 1; i < closed.length; i++) {
      total += dist(closed[i - 1], closed[i]);
      segs.push(total);
    }
    if (total < 1e-6) {
      return Array.from({ length: count }, () => ({ ...pts[0] }));
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const target = i / count * total;
      let lo = 0;
      while (lo < segs.length - 2 && segs[lo + 1] < target) lo++;
      const a = segs[lo];
      const b = segs[lo + 1];
      const t = b === a ? 0 : (target - a) / (b - a);
      out.push(lerpPoint(closed[lo], closed[lo + 1], t));
    }
    return out;
  }

  // src/lib/grokbot/expressions.ts
  var e = (x, y, w, h, deg, round = 1, alpha = 1) => ({
    x,
    y,
    w,
    h,
    rot: deg * Math.PI / 180,
    round,
    alpha
  });
  var EXPRESSIONS = [
    {
      id: 0,
      name: "Rest",
      // Chubby ovals, generous gap — cute twins, not quotation marks.
      left: e(-10, -15, 12.8, 17.6, 11),
      right: e(50, -13, 11.8, 16.2, 11)
    },
    {
      id: 1,
      name: "Glance R",
      left: e(8, -18, 12.2, 18.4, 14),
      right: e(62, -14, 10.8, 16.6, 16)
    },
    {
      id: 2,
      name: "Glance L",
      left: e(-38, -17, 11.4, 18, -4),
      right: e(16, -16, 12.6, 18.8, 0)
    },
    {
      id: 3,
      name: "Up",
      left: e(-12, -40, 12, 16.2, 10),
      right: e(48, -38, 11, 15.2, 11)
    },
    {
      id: 4,
      name: "Down",
      left: e(-10, 16, 13, 14.8, 12),
      right: e(50, 18, 11.8, 13.6, 12)
    },
    {
      id: 5,
      name: "Joy",
      left: e(-10, -6, 15.2, 28, 11),
      right: e(52, -3, 14, 26, 11)
    },
    {
      id: 6,
      name: "Squint",
      left: e(-10, -10, 16, 6.2, 8),
      right: e(52, -8, 14.6, 5.6, 8)
    },
    {
      id: 7,
      name: "Shut",
      left: e(-10, -16, 14.2, 2.4, 10),
      right: e(50, -14, 13, 2.2, 10)
    },
    {
      id: 8,
      name: "Dots",
      left: e(8, -8, 16, 16, 0, 1),
      right: e(38, -6, 20, 20, 0, 1)
    },
    {
      id: 9,
      name: "Focus",
      left: e(-8, 4, 14, 16, -8, 1),
      right: e(22, 2, 22, 22, 0, 1)
    },
    {
      id: 10,
      name: "Surprise",
      left: e(6, -18, 20, 24, 6, 1),
      right: e(40, -16, 18, 22, 8, 1)
    },
    {
      id: 11,
      name: "Wink L",
      left: e(-10, -20, 14, 2.4, 12),
      right: e(50, -16, 12, 19.5, 12)
    },
    {
      id: 12,
      name: "Wink R",
      left: e(-10, -20, 12.4, 20.5, 12),
      right: e(50, -14, 13.2, 2.4, 10)
    },
    {
      id: 13,
      name: "Side-eye",
      left: e(28, -8, 8, 14, 8),
      right: e(58, -6, 7, 12, 12)
    },
    {
      id: 14,
      name: "Curious",
      left: e(8, -36, 10, 20, 8),
      right: e(40, -14, 11, 24, 24)
    },
    {
      id: 15,
      name: "Sleepy",
      left: e(-10, -12, 14, 8.6, 9),
      right: e(50, -10, 12.8, 7.8, 9)
    },
    {
      id: 16,
      name: "Low",
      left: e(14, 8, 12, 10, 22),
      right: e(40, 12, 11, 9, 20)
    },
    {
      id: 17,
      name: "Stern",
      left: e(12, -28, 13, 8, -18),
      right: e(40, -28, 13, 8, 18)
    },
    {
      id: 18,
      name: "Scan",
      left: e(12, -18, 18, 4.5, 0),
      right: e(46, -18, 16, 4.5, 0)
    },
    {
      id: 19,
      name: "Tiny",
      left: e(-4, -18, 5.5, 8, 14),
      right: e(48, -15, 5, 7.5, 14)
    },
    {
      id: 20,
      name: "Wide",
      left: e(-12, -10, 16.8, 26, 10),
      right: e(52, -8, 15.4, 24, 10)
    },
    {
      id: 21,
      name: "Dizzy",
      left: e(-6, -30, 10, 18, -28),
      right: e(48, 8, 12, 14, 40)
    },
    {
      id: 22,
      name: "Hidden",
      left: e(16, -24, 10, 20, 20, 1, 0),
      right: e(42, -18, 9, 18, 20, 1, 0)
    },
    {
      id: 23,
      name: "Cross",
      left: e(16, -22, 4, 16, 42),
      right: e(40, -18, 4, 16, -42)
    },
    {
      id: 24,
      name: "Corner",
      left: e(48, -40, 8, 14, 38),
      right: e(68, -28, 6, 10, 42)
    }
  ];
  function getExpression(id) {
    return EXPRESSIONS[(id % 25 + 25) % 25];
  }

  // src/lib/grokbot/paths.ts
  function stadiumPath(eye, n = EYE_N) {
    const pts = [];
    const hw = Math.max(0.4, eye.w);
    const hh = Math.max(0.4, eye.h);
    const r = Math.min(hw, hh) * lerp(0.35, 1, eye.round);
    const innerW = Math.max(0, hw - r);
    const innerH = Math.max(0, hh - r);
    const c = Math.cos(eye.rot);
    const s = Math.sin(eye.rot);
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      const sx = Math.sign(ca) || 1;
      const sy = Math.sign(sa) || 1;
      const lx = innerW * sx + r * Math.abs(ca) * sx;
      const ly = innerH * sy + r * Math.abs(sa) * sy;
      pts.push({
        x: eye.x + lx * c - ly * s,
        y: eye.y + lx * s + ly * c
      });
    }
    return pts;
  }
  function polarBody(radiusFn, n = PATH_N) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const theta = i / n * Math.PI * 2 - Math.PI / 2;
      const r = radiusFn(theta);
      pts.push({ x: Math.cos(theta) * r, y: Math.sin(theta) * r });
    }
    return pts;
  }
  function circleBody(r = FACE_R) {
    return polarBody(() => r);
  }
  function blobBody(r = FACE_R, time = 0) {
    return polarBody((th) => {
      const wobble = 0.018 * Math.sin(2 * th + 0.35 + time * 0.15) + 0.01 * Math.sin(3 * th + 1.1);
      return r * (1 + wobble);
    });
  }
  function eggBody(r = FACE_R) {
    return polarBody((th) => {
      const taper = 1 - 0.2 * Math.sin(th);
      const stretch = 1 + 0.14 * Math.sin(th);
      return r * taper * stretch * 0.96;
    });
  }
  function hexBody(r = FACE_R) {
    return polarBody((th) => {
      const sharp = polyRadius(th, 6, r, Math.PI / 6);
      return lerp(sharp, r, 0.38);
    });
  }
  function triangleBody(r = FACE_R) {
    return polarBody((th) => {
      const sharp = polyRadius(th, 3, r * 1.12, Math.PI / 2);
      return lerp(sharp, r, 0.46);
    });
  }
  function dotBody(r = 14) {
    return circleBody(r);
  }
  function exclaimStem(r = FACE_R) {
    const topW = r * 0.105;
    const botW = r * 0.048;
    const y0 = -r * 0.6;
    const y1 = r * 0.2;
    const raw = [];
    for (let i = 0; i <= 22; i++) {
      const a = Math.PI + i / 22 * Math.PI;
      raw.push({ x: Math.cos(a) * topW, y: y0 + Math.sin(a) * topW * 0.85 });
    }
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      raw.push({ x: lerp(topW, botW, t), y: lerp(y0, y1, t) });
    }
    for (let i = 0; i <= 18; i++) {
      const a = i / 18 * Math.PI;
      raw.push({ x: Math.cos(a) * botW, y: y1 + Math.sin(a) * botW });
    }
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      raw.push({ x: lerp(-botW, -topW, t), y: lerp(y1, y0, t) });
    }
    return resampleClosed(raw, PATH_N);
  }

  // src/lib/grokbot/shapes.ts
  function bodyForShape(shape, time = 0) {
    switch (shape) {
      case "circle":
        return circleBody();
      case "egg":
        return eggBody();
      case "hex":
        return hexBody();
      case "triangle":
        return triangleBody();
      case "dot":
        return dotBody(16);
      case "blob":
      default:
        return blobBody(100, time);
    }
  }

  // src/lib/grokbot/demo.ts
  var DEMO_CUES = [
    {
      at: 0,
      name: "idle",
      run: (e2) => {
        e2.goIdle();
        e2.setShape("circle");
        e2.setExpression(0);
      }
    },
    {
      at: 0.85,
      name: "loading",
      run: (e2) => e2.play("loading")
    },
    {
      at: 1.85,
      name: "look-right",
      run: (e2) => {
        e2.goIdle();
        e2.setExpression(1);
        e2.setRotation(0.72, 0.12);
      }
    },
    {
      at: 2.85,
      name: "squint-edge",
      run: (e2) => {
        e2.setExpression(6);
        e2.setRotation(0.95, 0.42);
      }
    },
    {
      at: 3.75,
      name: "look-down",
      run: (e2) => {
        e2.setExpression(6);
        e2.setRotation(0.35, 0.72);
      }
    },
    {
      at: 4.7,
      name: "joy",
      run: (e2) => {
        e2.setRotation(0, 0);
        e2.setExpression(5);
      }
    },
    {
      at: 5.75,
      name: "exclaim",
      run: (e2) => e2.play("exclaim")
    },
    {
      at: 6.8,
      name: "exclaim-fly",
      run: (e2) => e2.play("exclaim-fly")
    },
    {
      at: 7.9,
      name: "idle",
      run: (e2) => {
        e2.goIdle();
        e2.setExpression(0);
      }
    },
    {
      at: 8.85,
      name: "focus",
      run: (e2) => e2.play("focus")
    },
    {
      at: 9.95,
      name: "exclaim",
      run: (e2) => e2.play("exclaim")
    },
    {
      at: 11.7,
      name: "idle",
      run: (e2) => {
        e2.goIdle();
        e2.setExpression(0);
      }
    },
    {
      at: 12.7,
      name: "shrink",
      run: (e2) => e2.play("shrink")
    },
    {
      at: 13.7,
      name: "idle",
      run: (e2) => e2.goIdle()
    },
    {
      at: 14.75,
      name: "squint-egg",
      run: (e2) => {
        e2.setExpression(6);
        e2.setShape("egg");
      }
    },
    {
      at: 15.7,
      name: "egg",
      run: (e2) => {
        e2.setExpression(0);
        e2.setShape("egg");
      }
    },
    {
      at: 16.7,
      name: "hex",
      run: (e2) => e2.setShape("hex")
    },
    {
      at: 17.7,
      name: "triangle",
      run: (e2) => {
        e2.setShape("triangle");
        e2.play("streaks");
      }
    },
    {
      at: 19,
      name: "tri-spin",
      run: (e2) => {
        e2.setShape("triangle");
        e2.setRotation(0.4, 0.15);
        e2.tgt.spin = 0.8;
        e2.tgt.streakW = 0.7;
        e2.tgt.eyeAlpha = 0;
      }
    },
    {
      at: 20,
      name: "orbits",
      run: (e2) => {
        e2.setShape("triangle");
        e2.play("orbits");
      }
    },
    {
      at: 21.05,
      name: "orbits-circle",
      run: (e2) => {
        e2.setShape("circle");
        e2.play("orbits");
      }
    },
    {
      at: 22.05,
      name: "sparkle",
      run: (e2) => {
        e2.setShape("circle");
        e2.setRotation(0, 0);
        e2.setExpression(2);
        e2.play("sparkle");
      }
    },
    {
      at: 23.15,
      name: "idle",
      run: (e2) => {
        e2.goIdle();
        e2.setExpression(0);
      }
    },
    {
      at: 24,
      name: "satellites",
      run: (e2) => {
        e2.play("shrink");
        e2.tgt.satW = 1;
        e2.tgt.dotsW = 0.35;
      }
    },
    {
      at: 25,
      name: "dot",
      run: (e2) => {
        e2.tgt.satW = 0;
        e2.tgt.dotsW = 0;
        e2.play("shrink");
      }
    },
    {
      at: 26,
      name: "idle",
      run: (e2) => e2.goIdle()
    },
    {
      at: 27.05,
      name: "eyes-off",
      run: (e2) => {
        e2.setExpression(22);
        e2.tgt.eyeAlpha = 0;
      }
    },
    {
      at: 27.85,
      name: "trail",
      run: (e2) => e2.play("trail")
    },
    {
      at: 29.15,
      name: "grow",
      run: (e2) => {
        e2.tgt.flyX = 0;
        e2.tgt.flyY = 0;
        e2.tgt.bodyScale = 1;
        e2.tgt.eyeAlpha = 0;
        e2.tgt.faceW = 1;
        e2.tgt.orbitW = 0.4;
      }
    },
    {
      at: 30.4,
      name: "idle",
      run: (e2) => {
        e2.goIdle();
        e2.setShape("circle");
        e2.setExpression(0);
      }
    }
  ];

  // src/lib/grokbot/scenes.ts
  var SCENES = {
    work: {
      label: "Work",
      hint: "Quiet. Breath and blink only.",
      idle: {
        breathe: 8e-3,
        blink: true,
        autoLook: false,
        autoBounce: 0,
        followPointer: false,
        sfx: false,
        sleepAfter: 0
      }
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
        sleepAfter: 90
      }
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
        sleepAfter: 0
      }
    }
  };
  var SCENE_KEY = "grok-scene";
  function readScene() {
    try {
      const v = localStorage.getItem(SCENE_KEY);
      if (v === "work" || v === "companion" || v === "demo") return v;
    } catch {
    }
    return "companion";
  }
  function writeScene(id) {
    try {
      localStorage.setItem(SCENE_KEY, id);
    } catch {
    }
  }
  function isSceneId(v) {
    return v === "work" || v === "companion" || v === "demo";
  }

  // src/lib/grokbot/engine.ts
  var BOUNCE_DIRS = [
    { x: 0, y: 1, faces: [5, 3, 20, 10] },
    { x: 0, y: -0.42, faces: [4, 6, 7, 15] },
    { x: -1, y: 0.22, faces: [2, 13, 11, 21] },
    { x: 1, y: 0.22, faces: [1, 13, 12, 21] },
    { x: -0.78, y: 0.86, faces: [2, 5, 14, 3] },
    { x: 0.78, y: 0.86, faces: [1, 5, 14, 3] },
    { x: -0.72, y: -0.34, faces: [4, 2, 6, 16] },
    { x: 0.72, y: -0.34, faces: [4, 1, 6, 16] }
  ];
  function pick(xs) {
    return xs[Math.floor(Math.random() * xs.length)];
  }
  function composeBounce() {
    const hops = [];
    let t = 0;
    hops.push({
      at: t,
      hopX: 0,
      hopY: 0,
      squash: 0.78 + Math.random() * 0.06,
      tilt: 0,
      expression: pick([6, 15, 0, 19])
    });
    t += 0.08 + Math.random() * 0.06;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const dir = pick(BOUNCE_DIRS);
      const big = i === n - 1 || Math.random() < 0.22;
      const mag = big ? 0.58 + Math.random() * 0.34 : 0.2 + Math.random() * 0.28;
      hops.push({
        at: t,
        hopX: dir.x * mag,
        hopY: dir.y * mag,
        squash: 1.06 + mag * 0.18,
        tilt: -dir.x * (0.08 + mag * 0.08),
        expression: pick(dir.faces)
      });
      t += 0.15 + mag * 0.4;
      hops.push({
        at: t,
        hopX: 0,
        hopY: 0,
        squash: 0.66 + Math.random() * 0.1,
        tilt: dir.x * 0.05,
        expression: pick([6, 5, 15, 0, pick(dir.faces)])
      });
      t += 0.07 + Math.random() * 0.08;
      if (Math.random() < 0.28) t += 0.1 + Math.random() * 0.18;
    }
    hops.push({
      at: t,
      hopX: 0,
      hopY: 0,
      squash: 1,
      tilt: 0,
      expression: pick([0, 5, 15])
    });
    return hops;
  }
  function eyeSpring(p) {
    return {
      x: springOf(p.x),
      y: springOf(p.y),
      w: springOf(p.w),
      h: springOf(p.h),
      rot: springOf(p.rot),
      round: springOf(p.round),
      alpha: springOf(p.alpha)
    };
  }
  function stepEye(s, t, dt, speed) {
    stepSpring(s.x, t.x, dt, speed);
    stepSpring(s.y, t.y, dt, speed);
    stepSpring(s.w, t.w, dt, speed);
    stepSpring(s.h, t.h, dt, speed);
    stepSpring(s.rot, t.rot, dt, speed);
    stepSpring(s.round, t.round, dt, speed);
    stepSpring(s.alpha, t.alpha, dt, speed);
  }
  function readEye(s) {
    return {
      x: s.x.value,
      y: s.y.value,
      w: s.w.value,
      h: s.h.value,
      rot: s.rot.value,
      round: s.round.value,
      alpha: s.alpha.value
    };
  }
  var GrokBotEngine = class {
    expression = 0;
    shape = "circle";
    state = "idle";
    faceColor = "blue";
    springSpeed = 7;
    flipX = false;
    emphasis = false;
    debug = false;
    followPointer = true;
    autoIdle = true;
    reducedMotion = false;
    paused = false;
    left;
    right;
    body;
    bodyCurr;
    t;
    tgt;
    pointer = {
      x: 0,
      y: 0,
      active: false
    };
    orbits = [];
    sparks = [];
    trail = [];
    satellites = [
      { ang: 0, dist: 42, r: 7, hue: 0 },
      { ang: 2.1, dist: 48, r: 5.5, hue: 0 },
      { ang: 4.2, dist: 36, r: 4.5, hue: 0 }
    ];
    demoPlaying = false;
    demoName = "idle";
    demoT0 = 0;
    demoIdx = 0;
    last = 0;
    elapsed = 0;
    nextBlink = 3.2;
    stateUntil = 0;
    lookPhase = 0;
    bounceT0 = 0;
    bounceHold = false;
    bounceCues = [];
    bounceDur = 2.3;
    lastAir = false;
    scene = "companion";
    listeners = /* @__PURE__ */ new Map();
    touchedAt = 0;
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
        hopX: springOf(0),
        squash: springOf(1)
      };
      this.seedOrbits();
    }
    defaultTargets() {
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
        hopX: 0,
        squash: 1
      };
    }
    seedOrbits() {
      this.orbits = [
        { rx: 118, ry: 42, tilt: 0.7, yaw: 0.2, speed: 0.85, phase: 0, hueA: 12, hueB: 48, width: 5.5 },
        { rx: 108, ry: 54, tilt: -0.55, yaw: 1.1, speed: -0.62, phase: 1.4, hueA: 265, hueB: 200, width: 5 },
        { rx: 96, ry: 70, tilt: 1.05, yaw: 2.2, speed: 0.48, phase: 2.6, hueA: 165, hueB: 195, width: 4.5 },
        { rx: 124, ry: 28, tilt: 0.25, yaw: 0.6, speed: 1.05, phase: 0.8, hueA: 300, hueB: 170, width: 4 }
      ];
    }
    on(ev, fn) {
      let set = this.listeners.get(ev);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        this.listeners.set(ev, set);
      }
      set.add(fn);
      return () => set.delete(fn);
    }
    emit(ev) {
      this.listeners.get(ev)?.forEach((fn) => fn());
    }
    setScene(id) {
      this.scene = id;
      writeScene(id);
      const policy = SCENES[id].idle;
      this.setFollowPointer(policy.followPointer);
      this.setAutoIdle(true);
      this.noteInput();
      if (id === "demo") {
        this.playDemo();
        return;
      }
      this.stopDemo();
      this.goIdle();
    }
    setExpression(id) {
      this.expression = (id % 25 + 25) % 25;
      if (this.state === "sleep") this.goIdle();
    }
    setShape(id) {
      this.shape = id;
      if (id === "dot") this.tgt.bodyScale = 0.18;
      else if (this.tgt.faceW > 0.5) this.tgt.bodyScale = 1;
    }
    setGaze(nx, ny) {
      this.tgt.gazeX = clamp(nx, -1, 1);
      this.tgt.gazeY = clamp(ny, -1, 1);
    }
    setRotation(yaw, pitch) {
      this.tgt.yaw = yaw;
      this.tgt.pitch = pitch;
    }
    setEyeScale(s) {
      this.tgt.eyeScale = clamp(s, 0.35, 2.2);
    }
    setSpringSpeed(s) {
      this.springSpeed = clamp(s, 1, 18);
    }
    setFlipX(v) {
      this.flipX = v;
    }
    setEmphasis(v) {
      this.emphasis = v;
    }
    setDebug(v) {
      this.debug = v;
    }
    setFaceColor(c) {
      this.faceColor = c;
    }
    setFollowPointer(v) {
      this.followPointer = v;
      if (!v) this.pointer.active = false;
    }
    setAutoIdle(v) {
      this.autoIdle = v;
    }
    pointerMove(nx, ny) {
      this.pointer.x = nx;
      this.pointer.y = ny;
      this.pointer.active = true;
    }
    pointerLeave() {
      this.pointer.active = false;
    }
    blink(opts) {
      this.tgt.blink = 0.08;
      this.tgt.bodyScale = 0.965;
      this.stateUntil = this.elapsed + 0.11;
      if (this.state === "idle") this.state = "blink";
      if (!opts?.silent) this.emit("blink");
    }
    noteInput() {
      this.touchedAt = this.elapsed;
      if (this.state === "sleep") this.wake();
    }
    wake() {
      if (this.state !== "sleep") return;
      this.goIdle();
      this.expression = 0;
    }
    setPaused(on) {
      this.paused = on;
      if (on) this.last = 0;
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
      this.tgt.hopX = 0;
      this.tgt.squash = 1;
      this.bounceHold = false;
      this.nextBlink = this.elapsed + 2.4 + Math.random() * 2.6;
      this.stateUntil = 0;
    }
    play(state) {
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
          this.rollBounce();
          this.bounceT0 = this.elapsed;
          this.bounceHold = true;
          this.stateUntil = Number.POSITIVE_INFINITY;
          break;
      }
    }
    bounceOnce() {
      this.play("bounce");
      this.bounceHold = false;
      this.stateUntil = this.elapsed + this.bounceDur;
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
    resetSoft() {
      this.tgt = this.defaultTargets();
      this.shape = "circle";
      this.expression = 0;
      this.sparks.length = 0;
      this.trail.length = 0;
    }
    burstSparks(n) {
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
          ang
        });
      }
    }
    tick(now) {
      if (this.paused) {
        this.last = 0;
        return;
      }
      if (!this.last) this.last = now;
      let dt = (now - this.last) / 1e3;
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
        const p = bodyTarget[i];
        const c = this.bodyCurr[i];
        stepSpring(c.x, p.x, dt, bodySpeed);
        stepSpring(c.y, p.y, dt, bodySpeed);
      }
      Object.keys(this.tgt).forEach((k) => {
        const boost = k === "blink" || k === "hop" || k === "hopX" || k === "squash" ? 2.15 : 1;
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
          hue: this.elapsed * 140 % 360
        });
        if (this.trail.length > 48) this.trail.shift();
      } else if (this.trail.length) {
        this.trail.shift();
      }
    }
    tickDemo() {
      if (!this.demoPlaying) return;
      const t = this.elapsed - this.demoT0;
      while (this.demoIdx < DEMO_CUES.length && t >= DEMO_CUES[this.demoIdx].at) {
        const cue = DEMO_CUES[this.demoIdx];
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
    tickBehaviors(dt) {
      const policy = SCENES[this.scene].idle;
      if (this.autoIdle && this.state === "idle" && !this.demoPlaying && !this.reducedMotion) {
        this.tgt.bodyScale = 1 + Math.sin(this.elapsed * 1.05) * policy.breathe;
      }
      if (this.state === "sleep" && !this.reducedMotion) {
        this.tgt.bodyScale = 1 + Math.sin(this.elapsed * 0.7) * 0.012;
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
      if (this.autoIdle && this.state === "idle" && !this.demoPlaying && this.elapsed > this.nextBlink) {
        if (this.reducedMotion) {
          if (policy.blink) this.blink({ silent: true });
          else this.nextBlink = this.elapsed + 4;
          return;
        }
        const roll = Math.random();
        if (policy.autoBounce > 0 && roll < policy.autoBounce) {
          this.play("bounce");
          this.bounceHold = false;
          this.stateUntil = this.elapsed + this.bounceDur;
        } else if (policy.autoLook && roll < policy.autoBounce + 0.18) {
          this.play("look");
          this.stateUntil = this.elapsed + 1.1;
        } else if (policy.blink) {
          this.blink({ silent: true });
          if (roll < 0.5) this.nextBlink = this.elapsed + 0.42;
        } else {
          this.nextBlink = this.elapsed + 3 + Math.random() * 4;
        }
      }
      if (policy.sleepAfter > 0 && this.autoIdle && this.state === "idle" && !this.demoPlaying && !this.reducedMotion && this.elapsed - this.touchedAt > policy.sleepAfter) {
        this.play("sleep");
      }
      if (this.state !== "idle" && this.state !== "sleep" && this.state !== "blink") {
        if (this.stateUntil && this.elapsed > this.stateUntil && !this.demoPlaying) {
          if (this.state === "egg" || this.state === "hex" || this.state === "triangle") return;
          this.tgt.flyX = 0;
          this.tgt.flyY = 0;
          this.tgt.hop = 0;
          this.tgt.hopX = 0;
          this.tgt.squash = 1;
          this.tgt.bodyScale = 1;
          this.tgt.eyeAlpha = 1;
          this.tgt.faceW = 1;
          this.tgt.exclaimW = 0;
          this.tgt.dotsW = 0;
          this.tgt.orbitW = 0;
          this.tgt.streakW = 0;
          this.tgt.satW = 0;
          this.state = "idle";
          this.nextBlink = this.elapsed + 2.2 + Math.random() * 2;
        }
      }
    }
    rollBounce() {
      this.bounceCues = composeBounce();
      const last = this.bounceCues[this.bounceCues.length - 1];
      this.bounceDur = (last?.at ?? 2) + 0.16;
    }
    tickBounce() {
      let t = this.elapsed - this.bounceT0;
      if (this.bounceHold && t > this.bounceDur) {
        this.rollBounce();
        this.bounceT0 = this.elapsed;
        t = 0;
      }
      const cues = this.bounceCues.length ? this.bounceCues : composeBounce();
      let cue = cues[0];
      for (const c of cues) {
        if (c.at <= t) cue = c;
      }
      this.tgt.hop = cue.hopY;
      this.tgt.hopX = cue.hopX;
      this.tgt.squash = cue.squash;
      this.tgt.yaw = cue.tilt;
      this.tgt.bodyScale = 1;
      if (this.expression !== cue.expression) this.expression = cue.expression;
      const air = Math.hypot(cue.hopX, cue.hopY) > 0.12;
      if (this.lastAir && !air) this.emit("land");
      this.lastAir = air;
    }
    tickGaze() {
      if (this.state === "sleep") {
        this.tgt.gazeX = 0;
        this.tgt.gazeY = 0.12;
        this.tgt.yaw = 0;
        this.tgt.pitch = 0.1;
        return;
      }
      const policy = SCENES[this.scene].idle;
      if (this.followPointer && this.pointer.active && !this.demoPlaying) {
        this.tgt.gazeX = this.pointer.x;
        this.tgt.gazeY = this.pointer.y;
        if (this.state !== "bounce") {
          this.tgt.yaw = this.pointer.x * 0.48;
          this.tgt.pitch = this.pointer.y * 0.32;
        }
      } else if (policy.autoLook && this.autoIdle && this.state === "idle" && !this.demoPlaying) {
        const t = this.elapsed;
        this.tgt.gazeX = 0.28 * Math.sin(t * 0.33) * Math.sin(t * 0.17);
        this.tgt.gazeY = 0.16 * Math.sin(t * 0.27 + 1.1);
      }
    }
    bodyPoints() {
      return this.bodyCurr.map((p) => ({ x: p.x.value, y: p.y.value }));
    }
    projectedEye(side) {
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
      const eye = {
        x: pr.x,
        y: pr.y,
        w: src.w * scale * foreshort,
        h: src.h * scale * lerp(0.55, 1, pr.visible),
        rot: (this.flipX ? -src.rot : src.rot) + this.t.yaw.value * 0.25,
        round: src.round,
        alpha: src.alpha * this.t.eyeAlpha.value * pr.visible
      };
      return { eye, depth: pr.z, path: stadiumPath(eye), visible: pr.visible };
    }
    snapshot() {
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
        mode: this.t.exclaimW.value > 0.55 ? "exclaim" : this.t.dotsW.value > 0.55 ? "loading" : this.t.satW.value > 0.55 ? "satellites" : "face",
        demoPlaying: this.demoPlaying,
        demoName: this.demoName
      };
    }
    units() {
      const nx = clamp(this.t.gazeX.value, -GAZE_CLAMP, GAZE_CLAMP);
      const ny = clamp(this.t.gazeY.value, -GAZE_CLAMP, GAZE_CLAMP);
      return {
        nx,
        ny,
        ux: nx * GAZE_GAIN_X,
        uy: ny * GAZE_GAIN_Y
      };
    }
  };

  // src/lib/grokbot/color.ts
  var GROK_BLUE = "#1b56f3";
  var INK = "#161513";
  var FACE_PRESETS = [
    { name: "Grok", hex: GROK_BLUE },
    { name: "Ink", hex: INK },
    { name: "Coral", hex: "#e85d4c" },
    { name: "Gold", hex: "#e2a116" },
    { name: "Mint", hex: "#2bb673" },
    { name: "Violet", hex: "#7b5cff" },
    { name: "Sky", hex: "#3db7e8" },
    { name: "Rose", hex: "#e85a9b" }
  ];
  function resolveFaceHex(c) {
    if (!c || c === "blue") return GROK_BLUE;
    if (c === "ink") return INK;
    return c;
  }
  function hexToRgb(hex) {
    const h = resolveFaceHex(hex).replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }
  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = (g - b) / d % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }
  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = v - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
  }
  function hsvToHex(h, s, v) {
    const { r, g, b } = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
  }
  function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHsv(r, g, b);
  }
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  function hitColorWheel(x, y, size, current) {
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    const outer = size / 2 - 1;
    const ringIn = outer - 16;
    const disc = ringIn - 7;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const hue = (ang + 360 + 90) % 360;
    if (r <= outer && r >= ringIn - 2) {
      return { zone: "ring", hsv: { h: hue, s: Math.max(current.s, 0.55), v: Math.max(current.v, 0.72) } };
    }
    if (r <= disc) {
      return { zone: "disc", hsv: { h: current.h, s: Math.min(1, r / disc), v: current.v } };
    }
    return null;
  }
  function drawColorWheel(ctx2, size, current) {
    const cx = size / 2;
    const cy = size / 2;
    const outer = size / 2 - 1;
    const ringIn = outer - 16;
    const disc = ringIn - 7;
    ctx2.clearRect(0, 0, size, size);
    const img = ctx2.createImageData(size, size);
    const data = img.data;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const rr = Math.hypot(dx, dy);
        if (rr > disc) continue;
        const { r, g, b } = hsvToRgb(current.h, Math.min(1, rr / disc), current.v);
        const i = (py * size + px) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx2.putImageData(img, 0, 0);
    const segs = 96;
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2 - Math.PI / 2;
      const a1 = (i + 1.15) / segs * Math.PI * 2 - Math.PI / 2;
      ctx2.beginPath();
      ctx2.arc(cx, cy, outer, a0, a1);
      ctx2.arc(cx, cy, ringIn, a1, a0, true);
      ctx2.closePath();
      ctx2.fillStyle = hsvToHex(i / segs * 360, 1, 1);
      ctx2.fill();
    }
    ctx2.beginPath();
    ctx2.arc(cx, cy, disc + 0.5, 0, Math.PI * 2);
    ctx2.strokeStyle = "rgba(255,255,255,0.35)";
    ctx2.lineWidth = 1;
    ctx2.stroke();
    const ringA = (current.h - 90) * Math.PI / 180;
    const ringR = (outer + ringIn) / 2;
    ctx2.beginPath();
    ctx2.arc(cx + Math.cos(ringA) * ringR, cy + Math.sin(ringA) * ringR, 5.5, 0, Math.PI * 2);
    ctx2.fillStyle = "#fff";
    ctx2.fill();
    ctx2.strokeStyle = "rgba(20,18,16,0.45)";
    ctx2.lineWidth = 1;
    ctx2.stroke();
    const discA = (current.h - 90) * Math.PI / 180;
    const discR = current.s * disc;
    ctx2.beginPath();
    ctx2.arc(cx + Math.cos(discA) * discR, cy + Math.sin(discA) * discR, 4.5, 0, Math.PI * 2);
    ctx2.fillStyle = "#fff";
    ctx2.fill();
    ctx2.strokeStyle = "rgba(20,18,16,0.45)";
    ctx2.lineWidth = 1;
    ctx2.stroke();
  }

  // src/lib/grokbot/renderer.ts
  function fillPath(ctx2, pts) {
    if (!pts.length) return;
    ctx2.beginPath();
    ctx2.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx2.lineTo(pts[i].x, pts[i].y);
    ctx2.closePath();
  }
  function hueStroke(h, a = 1) {
    return `hsla(${h}, 72%, 62%, ${a})`;
  }
  function drawGrokBot(ctx2, engine, cssSize, theme, opts) {
    const dpr = cssSize;
    ctx2.clearRect(0, 0, dpr, dpr);
    ctx2.save();
    ctx2.translate(dpr / 2, dpr / 2);
    const faceScale = opts?.faceScale ?? 0.31;
    const scale = dpr * faceScale / FACE_R;
    ctx2.scale(scale, scale);
    if (faceScale > 0.28) ctx2.translate(0, -FACE_R * 0.06);
    const face = resolveFaceHex(engine.faceColor);
    const eyeFill = theme.eye;
    const spin = engine.t.spin.value;
    if (spin) ctx2.rotate(spin * Math.sin(performance.now() / 900) * 0.35);
    const flyX = engine.t.flyX.value * FACE_R * 1.45;
    const flyY = engine.t.flyY.value * FACE_R * 1.45;
    const hop = engine.t.hop.value;
    const hopX = engine.t.hopX.value;
    const squash = Math.max(0.45, engine.t.squash.value);
    ctx2.translate(flyX + hopX * FACE_R * 0.7, flyY - hop * FACE_R * 0.78);
    const orbitW = engine.t.orbitW.value;
    const streakW = engine.t.streakW.value;
    const bodyScale = Math.max(0.04, engine.t.bodyScale.value);
    const dotsW = engine.t.dotsW.value;
    const exclaimW = engine.t.exclaimW.value;
    const satW = engine.t.satW.value;
    const faceW = engine.t.faceW.value;
    const lookX = engine.t.gazeX.value + engine.t.yaw.value * 0.55;
    const lookY = engine.t.gazeY.value + engine.t.pitch.value * 0.45;
    drawTrail(ctx2, engine);
    if (orbitW > 0.02) drawOrbits(ctx2, engine, orbitW, -1);
    if (streakW > 0.02) drawStreaks(ctx2, engine, streakW, -1);
    const hideBody = dotsW > 0.45;
    if (!hideBody && faceW > 0.08) {
      drawContactShadow(ctx2, faceW, bodyScale, hop, hopX, lookX, lookY);
    }
    ctx2.save();
    ctx2.translate(lookX * 4, lookY * 3.5);
    ctx2.rotate(lookX * 0.04);
    ctx2.scale(
      1 + lookX * lookX * 0.03 - lookY * lookY * 0.015,
      1 + lookY * lookY * 0.025 - lookX * lookX * 0.018
    );
    ctx2.scale(bodyScale * (1 / squash), bodyScale * squash);
    const body = engine.bodyPoints();
    if (!hideBody && (faceW > 0.02 || exclaimW > 0.02)) {
      ctx2.globalAlpha = Math.max(faceW, exclaimW);
      fillPath(ctx2, body);
      ctx2.fillStyle = face;
      ctx2.fill();
      shadeSphere(ctx2, body, face, lookX, lookY);
      ctx2.globalAlpha = 1;
    }
    if (!hideBody && faceW > 0.05 && engine.t.eyeAlpha.value > 0.02) {
      ctx2.save();
      fillPath(ctx2, body);
      ctx2.clip();
      const L = engine.projectedEye("left");
      const R = engine.projectedEye("right");
      const eyes = L.depth <= R.depth ? [L, R] : [R, L];
      for (const eye of eyes) {
        if (eye.eye.alpha < 0.02) continue;
        const a = clamp(eye.eye.alpha * faceW, 0, 1);
        ctx2.globalAlpha = a;
        fillPath(ctx2, eye.path);
        ctx2.fillStyle = eyeFill;
        ctx2.fill();
      }
      ctx2.restore();
      ctx2.globalAlpha = 1;
    }
    ctx2.restore();
    if (exclaimW > 0.05) {
      drawExclaimDot(ctx2, face, exclaimW, bodyScale);
    }
    if (dotsW > 0.04) drawLoadingDots(ctx2, engine, face, theme, dotsW);
    if (satW > 0.04) drawSatellites(ctx2, engine, face, theme, satW);
    if (orbitW > 0.02) drawOrbits(ctx2, engine, orbitW, 1);
    if (streakW > 0.02) drawStreaks(ctx2, engine, streakW, 1);
    drawSparks(ctx2, engine);
    if (engine.debug) drawDebug(ctx2, engine, theme);
    ctx2.restore();
  }
  function drawContactShadow(ctx2, faceW, bodyScale, hop, hopX, lookX, lookY) {
    const fade = faceW * bodyScale * (1 - hop * 0.45);
    const x = lookX * 8 - hopX * FACE_R * 0.22;
    const y = FACE_R * 0.94 * bodyScale + 6 + lookY * 3 + hop * FACE_R * 0.78;
    ctx2.save();
    ctx2.fillStyle = "#1a1814";
    ctx2.globalAlpha = 0.09 * fade;
    ctx2.beginPath();
    ctx2.ellipse(x, y + 4, 68 * bodyScale, 11 * bodyScale, 0, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.globalAlpha = 0.07 * fade;
    ctx2.beginPath();
    ctx2.ellipse(x, y + 1, 42 * bodyScale, 6.5 * bodyScale, 0, 0, Math.PI * 2);
    ctx2.fill();
    ctx2.restore();
  }
  function shadeSphere(ctx2, body, faceHex, lookX, lookY) {
    ctx2.save();
    fillPath(ctx2, body);
    ctx2.clip();
    const lx = -40 - lookX * 36;
    const ly = -48 - lookY * 28;
    const lum = luminance(faceHex);
    const hi = 0.12 + (1 - lum) * 0.2;
    const sh = 0.16 + lum * 0.22;
    const volume = ctx2.createRadialGradient(lx, ly, 6, lx * 0.15, ly * 0.1, FACE_R * 1.38);
    volume.addColorStop(0, `rgba(255,255,255,${hi})`);
    volume.addColorStop(0.18, `rgba(255,255,255,${hi * 0.42})`);
    volume.addColorStop(0.48, "rgba(255,255,255,0)");
    volume.addColorStop(0.78, `rgba(8,10,24,${sh * 0.55})`);
    volume.addColorStop(1, `rgba(4,6,16,${sh})`);
    ctx2.fillStyle = volume;
    ctx2.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);
    const spec = ctx2.createRadialGradient(lx * 0.72, ly * 0.72, 0, lx * 0.72, ly * 0.72, 34);
    spec.addColorStop(0, `rgba(255,255,255,${hi})`);
    spec.addColorStop(0.35, `rgba(255,255,255,${hi * 0.3})`);
    spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx2.fillStyle = spec;
    ctx2.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);
    const rimX = 52 + lookX * 20;
    const rimY = 18 + lookY * 16;
    const rim = ctx2.createRadialGradient(rimX, rimY, FACE_R * 0.35, 0, 0, FACE_R * 1.02);
    rim.addColorStop(0, "rgba(255,255,255,0)");
    rim.addColorStop(0.72, "rgba(255,255,255,0)");
    rim.addColorStop(0.9, `rgba(255,255,255,${0.08 + (1 - lum) * 0.12})`);
    rim.addColorStop(1, "rgba(255,255,255,0)");
    ctx2.fillStyle = rim;
    ctx2.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);
    ctx2.restore();
  }
  function drawExclaimDot(ctx2, face, w, bodyScale) {
    ctx2.save();
    ctx2.globalAlpha = w;
    const y = FACE_R * 0.48 * bodyScale;
    ctx2.beginPath();
    ctx2.ellipse(0, y, 8.5 * Math.max(bodyScale, 0.7), 8.5 * Math.max(bodyScale, 0.7), 0, 0, Math.PI * 2);
    ctx2.fillStyle = face;
    ctx2.fill();
    ctx2.restore();
  }
  function drawLoadingDots(ctx2, engine, face, theme, w) {
    const t = performance.now() / 1e3;
    const spacing = 52;
    const items = [
      { x: -spacing, k: 0.62, r: 18 },
      { x: 0, k: 1, r: 24 },
      { x: spacing, k: 0.62, r: 18 }
    ];
    ctx2.save();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pulse = 0.88 + 0.12 * Math.sin(t * 3.6 + i * 0.95);
      ctx2.globalAlpha = w * it.k;
      ctx2.beginPath();
      ctx2.arc(it.x, 0, it.r * pulse, 0, Math.PI * 2);
      ctx2.fillStyle = face;
      ctx2.fill();
    }
    ctx2.restore();
  }
  function drawSatellites(ctx2, engine, face, theme, w) {
    ctx2.save();
    const scale = engine.t.bodyScale.value;
    for (let i = 0; i < engine.satellites.length; i++) {
      const s = engine.satellites[i];
      const x = Math.cos(s.ang + i) * s.dist * Math.max(scale, 0.25);
      const y = Math.sin(s.ang * 0.85 + i) * s.dist * 0.55 * Math.max(scale, 0.25);
      ctx2.globalAlpha = w * (i === 0 ? 1 : 0.55);
      ctx2.beginPath();
      ctx2.arc(x, y - 10, s.r * (i === 0 ? 1.15 : 0.85), 0, Math.PI * 2);
      if (i === 0 && engine.state === "focus") {
        ctx2.fillStyle = theme.grok;
        ctx2.fill();
        ctx2.lineWidth = 3.2;
        ctx2.strokeStyle = theme.paper;
        ctx2.stroke();
      } else {
        ctx2.fillStyle = face;
        ctx2.globalAlpha = w * 0.45;
        ctx2.fill();
      }
    }
    ctx2.restore();
  }
  function drawOrbits(ctx2, engine, w, hemisphere) {
    const samples = 72;
    for (const o of engine.orbits) {
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        const a = i / samples * Math.PI * 2 + o.phase;
        const x0 = Math.cos(a) * o.rx;
        const y0 = Math.sin(a) * o.ry;
        const z0 = 0;
        const ct = Math.cos(o.tilt);
        const st = Math.sin(o.tilt);
        const y1 = y0 * ct - z0 * st;
        const z1 = y0 * st + z0 * ct;
        const cy = Math.cos(o.yaw);
        const sy = Math.sin(o.yaw);
        const x2 = x0 * cy + z1 * sy;
        const z2 = -x0 * sy + z1 * cy;
        pts.push({ x: x2, y: y1, z: z2 });
      }
      ctx2.save();
      ctx2.lineCap = "round";
      ctx2.lineJoin = "round";
      ctx2.lineWidth = o.width;
      ctx2.globalAlpha = w * 0.92;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const midZ = (a.z + b.z) / 2;
        if (hemisphere < 0 && midZ > 8) continue;
        if (hemisphere > 0 && midZ < -8) continue;
        const u = i / (pts.length - 1);
        const h = lerp(o.hueA, o.hueB, u);
        ctx2.beginPath();
        ctx2.strokeStyle = hueStroke(h, 0.95);
        ctx2.moveTo(a.x, a.y);
        ctx2.lineTo(b.x, b.y);
        ctx2.stroke();
      }
      ctx2.restore();
    }
  }
  function drawStreaks(ctx2, engine, w, hemisphere) {
    if (hemisphere < 0) return;
    const t = performance.now() / 1e3;
    const streaks = [
      { y: -36, rot: -0.45, h0: 12, h1: 55, len: 150 },
      { y: -18, rot: -0.38, h0: 165, h1: 200, len: 120 },
      { y: -50, rot: -0.52, h0: 280, h1: 330, len: 110 }
    ];
    ctx2.save();
    ctx2.globalAlpha = w;
    ctx2.lineCap = "round";
    for (const s of streaks) {
      ctx2.save();
      ctx2.rotate(s.rot + Math.sin(t) * 0.04);
      ctx2.translate(-20, s.y);
      const g = ctx2.createLinearGradient(-s.len / 2, 0, s.len / 2, 0);
      g.addColorStop(0, hueStroke(s.h0, 0));
      g.addColorStop(0.25, hueStroke(s.h0, 0.95));
      g.addColorStop(0.7, hueStroke(s.h1, 0.95));
      g.addColorStop(1, hueStroke(s.h1, 0));
      ctx2.strokeStyle = g;
      ctx2.lineWidth = 6.5;
      ctx2.beginPath();
      ctx2.moveTo(-s.len / 2, 0);
      ctx2.quadraticCurveTo(0, -18, s.len / 2, 8);
      ctx2.stroke();
      ctx2.restore();
    }
    ctx2.restore();
  }
  function drawTrail(ctx2, engine) {
    const tr = engine.trail;
    if (tr.length < 2) return;
    ctx2.save();
    ctx2.lineCap = "round";
    ctx2.lineJoin = "round";
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1];
      const b = tr[i];
      const u = i / tr.length;
      ctx2.strokeStyle = hueStroke(b.hue, u * 0.85);
      ctx2.lineWidth = lerp(2, 10, u);
      ctx2.beginPath();
      ctx2.moveTo(a.x, a.y);
      ctx2.lineTo(b.x, b.y);
      ctx2.stroke();
    }
    ctx2.restore();
  }
  function drawSparks(ctx2, engine) {
    for (const s of engine.sparks) {
      const u = 1 - s.life / s.max;
      ctx2.save();
      ctx2.translate(s.x, s.y);
      ctx2.rotate(s.ang);
      ctx2.strokeStyle = hueStroke(s.hue, u);
      ctx2.lineWidth = 2.4;
      ctx2.lineCap = "round";
      ctx2.beginPath();
      ctx2.moveTo(-s.len * u, 0);
      ctx2.lineTo(s.len * u, 0);
      ctx2.stroke();
      ctx2.restore();
    }
  }
  function drawDebug(ctx2, engine, theme) {
    ctx2.save();
    ctx2.strokeStyle = theme.grok;
    ctx2.lineWidth = 1.2;
    ctx2.globalAlpha = 0.55;
    ctx2.beginPath();
    ctx2.arc(0, 0, FACE_R, 0, Math.PI * 2);
    ctx2.stroke();
    const L = engine.projectedEye("left");
    const R = engine.projectedEye("right");
    for (const eye of [L, R]) {
      ctx2.beginPath();
      ctx2.arc(eye.eye.x, eye.eye.y, 3.2, 0, Math.PI * 2);
      ctx2.fillStyle = theme.grok;
      ctx2.globalAlpha = 0.9;
      ctx2.fill();
      ctx2.beginPath();
      ctx2.moveTo(eye.eye.x - 8, eye.eye.y);
      ctx2.lineTo(eye.eye.x + 8, eye.eye.y);
      ctx2.moveTo(eye.eye.x, eye.eye.y - 8);
      ctx2.lineTo(eye.eye.x, eye.eye.y + 8);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  // src/lib/grokbot/sfx.ts
  var MUTE_KEY = "grok-sfx-muted";
  var ctx = null;
  var muted = readMuted();
  var listeners = /* @__PURE__ */ new Set();
  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  }
  function audio() {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  function beep(ac, freq, dur, gain, type, slide = 0) {
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(8e-4, t + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function isMuted() {
    return muted;
  }
  function setMuted(on) {
    muted = on;
    try {
      localStorage.setItem(MUTE_KEY, on ? "1" : "0");
    } catch {
    }
    listeners.forEach((fn) => fn(on));
  }
  function onMute(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }
  function playSfx(name) {
    if (muted) return;
    const ac = audio();
    if (!ac) return;
    if (name === "blink") beep(ac, 880, 0.045, 0.035, "sine", 40);
    else if (name === "land") {
      beep(ac, 140, 0.09, 0.055, "triangle", -50);
      beep(ac, 70, 0.12, 0.03, "sine", -20);
    } else {
      beep(ac, 520, 0.07, 0.04, "sine", 180);
    }
  }

  // src/lib/grokbot/sizes.ts
  var BOT_SIZES = {
    menubar: { box: 22, faceScale: 0.46, label: "Menu bar" },
    pet: { box: 200, faceScale: 0.3, label: "Small" },
    medium: { box: 320, faceScale: 0.26, label: "Medium" },
    companion: { box: 440, faceScale: 0.24, label: "Large" },
    hero: { box: 720, faceScale: 0.22, label: "Hero" }
  };

  // src/lib/grokbot/registry.ts
  var stack = [];
  function registerEngine(engine) {
    if (engine) stack.push(engine);
    else stack.pop();
  }

  // src/lib/grokbot/layout.ts
  var PET_SIZES = {
    s: { box: 200, faceScale: 0.3, label: "S", hint: "Small \xB7 200" },
    m: { box: 320, faceScale: 0.26, label: "M", hint: "Medium \xB7 320" },
    l: { box: 440, faceScale: 0.24, label: "L", hint: "Large \xB7 440" }
  };
  var STAGE_W = 580;
  var DOCK_ROOM = 160;
  var SIZE_KEY = "grok-pet-size";
  var AUTO_WORK_KEY = "grok-auto-work";
  var CODEX_WATCH_KEY = "grok-codex-watch";
  function isPetSize(id) {
    return id === "s" || id === "m" || id === "l";
  }
  function readPetSize() {
    try {
      const v = localStorage.getItem(SIZE_KEY);
      if (isPetSize(v ?? "")) return v;
    } catch {
    }
    return "l";
  }
  function writePetSize(id) {
    try {
      localStorage.setItem(SIZE_KEY, id);
    } catch {
    }
  }
  function readAutoWork() {
    try {
      const v = localStorage.getItem(AUTO_WORK_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch {
    }
    return true;
  }
  function writeAutoWork(on) {
    try {
      localStorage.setItem(AUTO_WORK_KEY, on ? "1" : "0");
    } catch {
    }
  }
  function readCodexWatch() {
    try {
      const v = localStorage.getItem(CODEX_WATCH_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch {
    }
    return true;
  }
  function writeCodexWatch(on) {
    try {
      localStorage.setItem(CODEX_WATCH_KEY, on ? "1" : "0");
    } catch {
    }
  }
  function layoutFor(id) {
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
      dockMain: box - 40,
      faceSideTop: Math.round((h - box) / 2),
      ball: {
        bottom: { x: STAGE_W / 2, y: box / 2 },
        top: { x: STAGE_W / 2, y: h - box / 2 },
        right: { x: box / 2, y: h / 2 },
        left: { x: STAGE_W - box / 2, y: h / 2 }
      }
    };
  }
  function inWorkHours(d = /* @__PURE__ */ new Date()) {
    const day = d.getDay();
    if (day === 0 || day === 6) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    return m >= 9 * 60 && m < 18 * 60;
  }

  // src/lib/grokbot/pet-shell.ts
  var HOLD_MS = 220;
  var TAP_MS = 280;
  var DBL_MS = 340;
  var DRAG_ARM_PX = 6;
  var COLOR_KEY = "grok-face-color";
  var POS_KEY = "grok-companion-pos";
  var first = layoutFor("l");
  var STAGE = { w: first.w, h: first.h };
  var BALL_IN_STAGE = {
    bottom: { ...first.ball.bottom },
    top: { ...first.ball.top },
    right: { ...first.ball.right },
    left: { ...first.ball.left }
  };
  function adoptLayout(id) {
    const L = layoutFor(id);
    STAGE.w = L.w;
    STAGE.h = L.h;
    BALL_IN_STAGE.bottom = L.ball.bottom;
    BALL_IN_STAGE.top = L.ball.top;
    BALL_IN_STAGE.right = L.ball.right;
    BALL_IN_STAGE.left = L.ball.left;
    return L;
  }
  function pickDockSide(bx, by, area, edge = 110) {
    const l = bx - area.x;
    const r = area.x + area.w - bx;
    const t = by - area.y;
    const b = area.y + area.h - by;
    if (b < edge && b <= t) return "top";
    if (t < edge && t < b) return "bottom";
    if (l < edge && l <= r) return "right";
    if (r < edge && r < l) return "left";
    return "bottom";
  }
  function clampPoint(x, y, area, pad = 8) {
    return {
      x: Math.min(area.x + area.w - pad, Math.max(area.x + pad, x)),
      y: Math.min(area.y + area.h - pad, Math.max(area.y + pad, y))
    };
  }
  function gazeFromRect(clientX, clientY, r) {
    const nx = Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / Math.max(72, r.width * 0.42)));
    const ny = Math.max(-1, Math.min(1, (clientY - (r.top + r.height / 2)) / Math.max(72, r.height * 0.42)));
    return { x: nx, y: ny };
  }
  function readFaceColor() {
    try {
      return localStorage.getItem(COLOR_KEY) || GROK_BLUE;
    } catch {
      return GROK_BLUE;
    }
  }
  function writeFaceColor(hex) {
    try {
      localStorage.setItem(COLOR_KEY, hex);
    } catch {
    }
  }
  function createPetGesture() {
    let press = null;
    let tapAt = 0;
    let tapTimer = 0;
    let holding = false;
    return {
      get holding() {
        return holding;
      },
      get dragging() {
        return Boolean(press?.moved);
      },
      get pressed() {
        return Boolean(press);
      },
      markMoved() {
        if (!press) return;
        press.moved = true;
        holding = true;
      },
      onDown(e2) {
        press = {
          sx: e2.screenX,
          sy: e2.screenY,
          ox: e2.screenX,
          oy: e2.screenY,
          moved: false,
          timer: window.setTimeout(() => {
            if (!press) return;
            holding = true;
          }, HOLD_MS)
        };
      },
      onMove(e2) {
        if (!press) return null;
        const travel = Math.hypot(e2.screenX - press.ox, e2.screenY - press.oy);
        if (!press.moved && travel < DRAG_ARM_PX) return null;
        press.moved = true;
        holding = true;
        const dx = e2.screenX - press.sx;
        const dy = e2.screenY - press.sy;
        press.sx = e2.screenX;
        press.sy = e2.screenY;
        return { dx, dy, clientX: e2.clientX, clientY: e2.clientY };
      },
      onUp() {
        if (press) window.clearTimeout(press.timer);
        const p = press;
        press = null;
        holding = false;
        if (!p) return "none";
        if (p.moved) return "drag";
        const now = performance.now();
        if (now - tapAt < DBL_MS) {
          window.clearTimeout(tapTimer);
          tapAt = 0;
          return "dbl";
        }
        tapAt = now;
        return "tap";
      },
      scheduleTap(fn) {
        window.clearTimeout(tapTimer);
        tapTimer = window.setTimeout(fn, TAP_MS);
      },
      cancelTap() {
        window.clearTimeout(tapTimer);
      },
      dispose() {
        if (press) window.clearTimeout(press.timer);
        window.clearTimeout(tapTimer);
        press = null;
        holding = false;
      }
    };
  }
  var THEME = {
    ink: "#161513",
    paper: "#f3f1ea",
    grok: "#1b56f3",
    eye: "#fffdf8",
    muted: "#6e6a62"
  };
  var ACTIONS = [
    { id: "idle", label: "Idle", run: (e2) => e2.reset() },
    { id: "blink", label: "Blink", run: (e2) => e2.blink() },
    { id: "look", label: "Look", run: (e2) => e2.play("look") },
    { id: "joy", label: "Joy", run: (e2) => e2.setExpression(5) },
    { id: "think", label: "Think", run: (e2) => e2.play("think") },
    { id: "wow", label: "Wow", run: (e2) => e2.play("exclaim") },
    { id: "orbit", label: "Orbit", run: (e2) => e2.play("orbits") },
    { id: "bounce", label: "Bounce", run: (e2) => e2.bounceOnce() },
    { id: "tour", label: "Tour", run: (e2) => e2.setScene("demo") }
  ];
  var STYLE_ID = "grok-pet-style";
  var PET_CSS = `
.grok-stage {
  position: relative;
  width: var(--stage-w, 580px);
  height: var(--stage-h, 600px);
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
.grok-stage .face,
.grok-stage .dock { pointer-events: auto; }
.grok-stage .face {
  position: absolute;
  width: var(--face-box, 440px);
  height: var(--face-box, 440px);
  cursor: grab;
  touch-action: none;
}
.grok-stage .face.hold { transform: scale(1.04); }
.grok-stage .face:active { cursor: grabbing; }
.grok-stage canvas.bot { display: block; width: 100%; height: 100%; }
.grok-stage #wheel { display: block; width: 72px; height: 72px; cursor: crosshair; }
.grok-stage .dock {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}
.grok-stage.open .dock {
  opacity: 1;
  pointer-events: auto;
}
.grok-stage .presets { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.grok-stage .presets button {
  width: 14px; height: 14px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.35);
  padding: 0; cursor: pointer;
}
.grok-stage .bar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
  gap: 1px;
  padding: 4px 6px;
  background: rgba(22, 21, 19, 0.55);
  border-radius: 999px;
  backdrop-filter: blur(16px);
  white-space: nowrap;
}
.grok-stage .bar button {
  border: 0;
  background: transparent;
  color: #fffcf6;
  font: 500 9px/1 "SF Pro Text", "Helvetica Neue", sans-serif;
  padding: 6px 6px;
  border-radius: 999px;
  cursor: pointer;
  flex: none;
}
.grok-stage .bar button:hover { background: rgba(255,255,255,0.12); }
.grok-stage .presets button.on {
  box-shadow: 0 0 0 2px #fffcf6;
}
.grok-stage .bar button.on { background: rgba(255,255,255,0.2); }
.grok-stage #prefs { flex-wrap: wrap; }
.grok-stage .watch {
  max-width: 220px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(27, 86, 243, 0.62);
  color: #fffcf6;
  font: 500 10px/1.3 "SF Pro Text", "Helvetica Neue", sans-serif;
  text-align: center;
}
.grok-stage .watch[hidden] { display: none; }
.grok-stage .studio {
  border-radius: 999px;
  background: rgba(22, 21, 19, 0.4);
  color: rgba(255,252,246,0.85);
  font: 500 11px/1 "SF Pro Text", "Helvetica Neue", sans-serif;
  padding: 6px 10px;
  text-decoration: none;
  backdrop-filter: blur(12px);
}
.grok-stage .studio:hover { background: rgba(22, 21, 19, 0.6); }
.grok-stage[data-side="bottom"] .face { left: var(--face-inset, 70px); top: 0; }
.grok-stage[data-side="bottom"] .dock { left: 0; right: 0; top: var(--dock-main, 400px); }
.grok-stage[data-side="top"] .face { left: var(--face-inset, 70px); bottom: 0; top: auto; }
.grok-stage[data-side="top"] .dock { left: 0; right: 0; bottom: var(--dock-main, 400px); top: auto; }
.grok-stage[data-side="right"] .face { left: 0; top: var(--face-side-top, 80px); }
.grok-stage[data-side="right"] .dock {
  left: var(--dock-main, 400px); top: 50%; transform: translateY(-50%);
  width: 168px;
}
.grok-stage[data-side="left"] .face { right: 0; left: auto; top: var(--face-side-top, 80px); }
.grok-stage[data-side="left"] .dock {
  right: var(--dock-main, 400px); left: auto; top: 50%; transform: translateY(-50%);
  width: 168px;
}
.grok-stage[data-side="right"] .bar,
.grok-stage[data-side="left"] .bar {
  flex-direction: column;
  border-radius: 16px;
  white-space: normal;
  padding: 6px 8px;
}
.grok-stage[data-side="right"] .bar button,
.grok-stage[data-side="left"] .bar button {
  width: 100%;
  text-align: center;
  padding: 5px 8px;
}
`;
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = PET_CSS;
    document.head.appendChild(el);
  }
  function ensureStage(root) {
    let stage = root.id === "stage" || root.classList.contains("grok-stage") ? root : root.querySelector("#stage") || root.querySelector(".grok-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "stage";
      root.appendChild(stage);
    }
    stage.classList.add("grok-stage");
    if (!stage.dataset.side) stage.dataset.side = "bottom";
    if (!stage.querySelector("#face")) {
      stage.replaceChildren();
      stage.insertAdjacentHTML(
        "afterbegin",
        `<div class="face" id="drag">
        <canvas id="face" class="bot" aria-label="Grok Bot"></canvas>
      </div>
      <div class="dock" id="dock">
        <canvas id="wheel" width="108" height="108" aria-label="Body color"></canvas>
        <div class="presets" id="presets"></div>
        <div class="bar" id="scenes"></div>
        <div class="bar" id="actions"></div>
        <div class="bar" id="prefs"></div>
        <div class="watch" id="watch" hidden></div>
        <a class="studio" id="studio" hidden>Studio</a>
      </div>`
      );
    }
    return stage;
  }
  function bootMacCompanion(opts = {}) {
    injectStyle();
    const pet = Boolean(window.pet?.isPet || new URLSearchParams(location.search).has("pet"));
    const web = !pet;
    if (pet) document.documentElement.classList.add("pet");
    const host = opts.root ?? document.querySelector("#stage") ?? document.body;
    const stage = ensureStage(host);
    const engine = new GrokBotEngine();
    engine.setScene(readScene());
    registerEngine(engine);
    let faceHex = readFaceColor();
    engine.setFaceColor(faceHex);
    const wrap = stage.querySelector("#drag");
    const canvas = stage.querySelector("#face");
    const dock = stage.querySelector("#dock");
    const wheel = stage.querySelector("#wheel");
    const presets = stage.querySelector("#presets");
    const sceneBar = stage.querySelector("#scenes");
    const actionBar = stage.querySelector("#actions");
    const prefBar = stage.querySelector("#prefs");
    const watchEl = stage.querySelector("#watch");
    const studio = stage.querySelector("#studio");
    const menuBot = document.querySelector("#menu-bot");
    const gesture = createPetGesture();
    let dockOpen = false;
    let raf = 0;
    let disposed = false;
    let loopOn = false;
    let pos = { x: 0, y: 0 };
    let vel = { x: 0, y: 0 };
    let last = { x: 0, y: 0, t: 0 };
    let dragging = false;
    let inertiaRaf = 0;
    let webSide = "bottom";
    const faceCtx = canvas.getContext("2d");
    const wheelCtx = wheel.getContext("2d");
    const menuCtx = menuBot?.getContext("2d") ?? null;
    const setThrough = (on) => window.pet?.setClickThrough?.(on);
    if (pet) setThrough(true);
    let petDrag = false;
    let pointerGen = 0;
    let finishing = false;
    function canClickThrough() {
      return !dockOpen && !gesture.pressed && !gesture.holding && !petDrag && !dragging;
    }
    function interactOn() {
      setThrough(false);
    }
    function interactOff() {
      if (canClickThrough()) setThrough(true);
    }
    function paintScene() {
      sceneBar.querySelectorAll("[data-scene]").forEach((btn) => {
        btn.classList.toggle("on", btn.dataset.scene === engine.scene);
      });
    }
    function paintPresets() {
      presets.querySelectorAll("button").forEach((btn) => {
        btn.classList.toggle("on", btn.dataset.hex === faceHex);
      });
    }
    function paintMute() {
      const btn = prefBar?.querySelector("[data-pref=mute]");
      if (!btn) return;
      btn.textContent = "Mute";
      btn.classList.toggle("on", isMuted());
      btn.setAttribute("aria-pressed", isMuted() ? "true" : "false");
      btn.title = isMuted() ? "Sound off \xB7 M" : "Sound on \xB7 M";
    }
    function paintSize() {
      prefBar?.querySelectorAll("[data-size]").forEach((btn) => {
        btn.classList.toggle("on", btn.dataset.size === petSize);
      });
    }
    function paintAuto() {
      const btn = prefBar?.querySelector("[data-pref=auto]");
      if (btn) btn.textContent = autoWork ? "Auto" : "Manual";
      btn?.classList.toggle("on", autoWork);
    }
    function paintCodex() {
      const btn = prefBar?.querySelector("[data-pref=codex]");
      if (btn) {
        btn.textContent = "Agents";
        btn.classList.toggle("on", watchCodex);
        btn.setAttribute("aria-pressed", watchCodex ? "true" : "false");
      }
      if (!watchEl) return;
      if (!watchCodex || !codexSnap || codexSnap.status === "idle") {
        watchEl.hidden = true;
        watchEl.textContent = "";
        return;
      }
      const bits = [codexSnap.tool || "Agents", codexSnap.label];
      if (codexSnap.name) bits.push(codexSnap.name);
      watchEl.textContent = bits.join(" \xB7 ");
      watchEl.hidden = false;
    }
    function applyCodexSnap(snap, fromWatch = true) {
      const prev = codexSnap?.status;
      codexSnap = snap;
      paintCodex();
      if (!watchCodex || !fromWatch) return;
      if (snap.status === prev) return;
      engine.noteInput();
      if (snap.status === "running") engine.play("think");
      else if (snap.status === "waiting") {
        engine.play("exclaim");
        engine.bounceOnce();
        playSfx("dock");
      } else if (snap.status === "done") {
        engine.setExpression(5);
        engine.bounceOnce();
        playSfx("land");
      } else if (snap.status === "error") engine.play("think");
    }
    function sceneSfx() {
      return SCENES[engine.scene].idle.sfx;
    }
    let petSize = readPetSize();
    let autoWork = readAutoWork();
    let watchCodex = readCodexWatch();
    let meetingOn = false;
    let codexSnap = null;
    let sceneBeforeAuto = null;
    let userPinned = false;
    let lastTrayAt = 0;
    const trayCanvas = document.createElement("canvas");
    trayCanvas.width = 44;
    trayCanvas.height = 44;
    const trayCtx = trayCanvas.getContext("2d");
    function shouldAutoWork() {
      return autoWork && (meetingOn || inWorkHours());
    }
    function applyScene(id, fromUser = true) {
      if (fromUser && shouldAutoWork() && id !== "work") userPinned = true;
      if (fromUser && id === "work") userPinned = false;
      engine.setScene(id);
      paintScene();
      window.pet?.setScene?.(id);
    }
    function syncAutoWork() {
      const need = shouldAutoWork();
      if (need) {
        if (engine.scene !== "work" && !userPinned) {
          sceneBeforeAuto = engine.scene;
          engine.setScene("work");
          paintScene();
          window.pet?.setScene?.("work");
        }
      } else {
        userPinned = false;
        if (engine.scene === "work" && sceneBeforeAuto && sceneBeforeAuto !== "work") {
          const back = sceneBeforeAuto;
          sceneBeforeAuto = null;
          applyScene(back, false);
        }
      }
    }
    function applyPetSize(id, persist = true) {
      petSize = id;
      const L = adoptLayout(id);
      stage.style.setProperty("--stage-w", `${L.w}px`);
      stage.style.setProperty("--stage-h", `${L.h}px`);
      stage.style.setProperty("--face-box", `${L.box}px`);
      stage.style.setProperty("--face-inset", `${L.inset}px`);
      stage.style.setProperty("--dock-main", `${L.dockMain}px`);
      stage.style.setProperty("--face-side-top", `${L.faceSideTop}px`);
      sizeCanvas();
      paintSize();
      if (persist) writePetSize(id);
      window.pet?.setSize?.(id);
      if (!pet) placeWeb();
    }
    function showDock(open) {
      dockOpen = open;
      stage.classList.toggle("open", open);
      if (open) {
        interactOn();
        if (sceneSfx()) playSfx("dock");
      } else {
        interactOff();
      }
    }
    const offBlink = engine.on("blink", () => {
      if (sceneSfx()) playSfx("blink");
    });
    const offLand = engine.on("land", () => {
      if (sceneSfx()) playSfx("land");
    });
    const offMute = onMute((on) => {
      paintMute();
      window.pet?.setMuted?.(on);
    });
    const offSide = window.pet?.onSide?.((s) => {
      stage.dataset.side = s;
    });
    const offScene = window.pet?.onScene?.((s) => {
      if (isSceneId(s)) applyScene(s, true);
    });
    const offVisible = window.pet?.onVisible?.((v) => setPaused(!v));
    const offTrayMute = window.pet?.onMute?.((on) => {
      if (on !== isMuted()) setMuted(on);
    });
    const offMeeting = window.pet?.onMeeting?.((on) => {
      meetingOn = Boolean(on);
      syncAutoWork();
    });
    const offSize = window.pet?.onSize?.((id) => {
      if (isPetSize(id) && id !== petSize) applyPetSize(id, true);
    });
    const offAuto = window.pet?.onAutoWork?.((on) => {
      if (on === autoWork) return;
      autoWork = on;
      writeAutoWork(on);
      paintAuto();
      if (!on) userPinned = false;
      syncAutoWork();
    });
    const offCodex = window.pet?.onCodex?.((snap) => {
      applyCodexSnap(snap);
    });
    const offCodexWatch = window.pet?.onCodexWatch?.((on) => {
      if (on === watchCodex) return;
      watchCodex = on;
      writeCodexWatch(on);
      paintCodex();
    });
    if (pet) {
      wrap.addEventListener("pointerenter", onFaceEnter);
      wrap.addEventListener("pointerleave", onFaceLeave);
      dock.addEventListener("pointerenter", onFaceEnter);
      dock.addEventListener("pointerleave", onFaceLeave);
    }
    function onFaceEnter() {
      interactOn();
    }
    function onFaceLeave() {
      interactOff();
    }
    function sizeCanvas() {
      const fit = (el, fallback) => {
        const css = el.clientWidth || fallback;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const px = Math.round(css * dpr);
        if (el.width !== px) {
          el.width = px;
          el.height = px;
        }
      };
      fit(canvas, layoutFor(petSize).box);
      if (menuBot) fit(menuBot, BOT_SIZES.menubar.box);
    }
    function paintWheel() {
      if (wheelCtx) drawColorWheel(wheelCtx, 108, hexToHsv(resolveFaceHex(faceHex)));
    }
    function setColor(hex) {
      faceHex = hex;
      engine.setFaceColor(hex);
      paintWheel();
      paintPresets();
      writeFaceColor(hex);
    }
    function setPaused(on) {
      engine.setPaused(on);
      if (!on && !disposed) startLoop();
    }
    function startLoop() {
      if (loopOn || disposed) return;
      loopOn = true;
      const tick = (now) => {
        if (disposed || engine.paused) {
          loopOn = false;
          raf = 0;
          return;
        }
        engine.tick(now);
        const scale = layoutFor(petSize).faceScale;
        if (faceCtx) {
          drawGrokBot(faceCtx, engine, canvas.width || 480, THEME, {
            faceScale: scale
          });
        }
        if (menuCtx && menuBot) {
          drawGrokBot(menuCtx, engine, menuBot.width || 22, THEME, {
            faceScale: BOT_SIZES.menubar.faceScale
          });
        }
        if (pet && trayCtx && now - lastTrayAt > 120) {
          lastTrayAt = now;
          drawGrokBot(trayCtx, engine, 44, THEME, {
            faceScale: BOT_SIZES.menubar.faceScale
          });
          window.pet?.setTrayIcon?.(trayCanvas.toDataURL("image/png"));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(wrap);
    if (menuBot) ro.observe(menuBot);
    sizeCanvas();
    paintWheel();
    applyPetSize(petSize, false);
    startLoop();
    syncAutoWork();
    const autoTimer = window.setInterval(syncAutoWork, 3e4);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      engine.reducedMotion = motion.matches;
    };
    onMotion();
    motion.addEventListener("change", onMotion);
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    if (document.hidden) setPaused(true);
    function lookAt(clientX, clientY) {
      const g = gazeFromRect(clientX, clientY, canvas.getBoundingClientRect());
      engine.pointerMove(g.x, g.y);
    }
    const onCursor = (x, y) => engine.pointerMove(x, y);
    const onPointerGaze = (e2) => lookAt(e2.clientX, e2.clientY);
    let offCursor;
    if (pet && window.pet?.onCursor) {
      offCursor = window.pet.onCursor(onCursor);
    } else {
      window.addEventListener("pointermove", onPointerGaze, { passive: true });
    }
    const onKey = (e2) => {
      const tag = e2.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      engine.noteInput();
      if (e2.code === "Space") {
        e2.preventDefault();
        engine.blink();
      } else if (e2.key === "d" || e2.key === "D") applyScene("demo");
      else if (e2.key === "r" || e2.key === "R") engine.reset();
      else if (e2.key === "1") applyScene("work");
      else if (e2.key === "2") applyScene("companion");
      else if (e2.key === "m" || e2.key === "M") setMuted(!isMuted());
    };
    window.addEventListener("keydown", onKey);
    sceneBar.replaceChildren();
    Object.keys(SCENES).forEach((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.scene = id;
      b.textContent = SCENES[id].label;
      b.title = SCENES[id].hint;
      b.addEventListener("click", () => applyScene(id));
      sceneBar.appendChild(b);
    });
    paintScene();
    actionBar.replaceChildren();
    ACTIONS.forEach((act) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.act = act.id;
      b.textContent = act.label;
      b.addEventListener("click", () => {
        engine.noteInput();
        act.run(engine);
        paintScene();
      });
      actionBar.appendChild(b);
    });
    presets.replaceChildren();
    FACE_PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = p.name;
      b.dataset.hex = p.hex;
      b.style.background = p.hex;
      b.addEventListener("click", () => setColor(p.hex));
      presets.appendChild(b);
    });
    paintPresets();
    if (prefBar) {
      prefBar.replaceChildren();
      Object.keys(PET_SIZES).forEach((id) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.size = id;
        b.textContent = PET_SIZES[id].label;
        b.title = PET_SIZES[id].hint;
        b.addEventListener("click", () => applyPetSize(id));
        prefBar.appendChild(b);
      });
      const muteBtn = document.createElement("button");
      muteBtn.type = "button";
      muteBtn.dataset.pref = "mute";
      muteBtn.title = "Sound on \xB7 M";
      muteBtn.addEventListener("click", () => setMuted(!isMuted()));
      prefBar.appendChild(muteBtn);
      const autoBtn = document.createElement("button");
      autoBtn.type = "button";
      autoBtn.dataset.pref = "auto";
      autoBtn.title = "Work hours 9\u201318 and meetings switch to Work";
      autoBtn.addEventListener("click", () => {
        autoWork = !autoWork;
        writeAutoWork(autoWork);
        paintAuto();
        window.pet?.setAutoWork?.(autoWork);
        if (!autoWork) userPinned = false;
        syncAutoWork();
      });
      prefBar.appendChild(autoBtn);
      const codexBtn = document.createElement("button");
      codexBtn.type = "button";
      codexBtn.dataset.pref = "codex";
      codexBtn.title = "Watch local Codex, Claude, Cursor, Gemini, and other agents";
      codexBtn.addEventListener("click", () => {
        watchCodex = !watchCodex;
        writeCodexWatch(watchCodex);
        paintCodex();
        window.pet?.setCodexWatch?.(watchCodex);
        if (!watchCodex) applyCodexSnap({ status: "idle", label: "idle", name: "", threads: 0 }, false);
      });
      prefBar.appendChild(codexBtn);
      paintMute();
      paintSize();
      paintAuto();
      paintCodex();
    }
    window.pet?.setScene?.(engine.scene);
    window.pet?.setMuted?.(isMuted());
    window.pet?.setAutoWork?.(autoWork);
    window.pet?.setCodexWatch?.(watchCodex);
    if (studio && opts.studioHref) {
      studio.hidden = false;
      studio.href = opts.studioHref;
    }
    const pickWheel = (e2) => {
      const r = wheel.getBoundingClientRect();
      const hit = hitColorWheel(
        (e2.clientX - r.left) / r.width * 108,
        (e2.clientY - r.top) / r.height * 108,
        108,
        hexToHsv(resolveFaceHex(faceHex))
      );
      if (hit) setColor(hsvToHex(hit.hsv.h, hit.hsv.s, hit.hsv.v));
    };
    const onWheelDown = (e2) => {
      wheel.setPointerCapture(e2.pointerId);
      pickWheel(e2);
    };
    const onWheelMove = (e2) => {
      if (e2.buttons) pickWheel(e2);
    };
    wheel.addEventListener("pointerdown", onWheelDown);
    wheel.addEventListener("pointermove", onWheelMove);
    function area() {
      return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    }
    function fitScale() {
      return Math.min(1, window.innerWidth / STAGE.w, window.innerHeight / (STAGE.h * 0.92));
    }
    function applyWebPos() {
      if (!web) return;
      const o = BALL_IN_STAGE[webSide];
      const scale = fitScale();
      stage.style.position = "absolute";
      stage.style.left = "0";
      stage.style.top = "0";
      stage.style.transformOrigin = `${o.x}px ${o.y}px`;
      stage.style.transform = `translate(${pos.x - o.x}px, ${pos.y - o.y}px) scale(${scale})`;
      stage.dataset.side = webSide;
    }
    function placeWeb() {
      if (!web) return;
      webSide = pickDockSide(pos.x, pos.y, area());
      applyWebPos();
    }
    function saveWebPos() {
      if (!web) return;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
      }
    }
    if (web) {
      let placed = false;
      try {
        const raw = localStorage.getItem(POS_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
            pos = clampPoint(p.x, p.y, area());
            placed = true;
          }
        }
      } catch {
      }
      if (!placed) pos = clampPoint(window.innerWidth / 2, window.innerHeight / 2, area());
      placeWeb();
      const step = () => {
        if (disposed) return;
        if (!dragging && (Math.abs(vel.x) > 0.12 || Math.abs(vel.y) > 0.12)) {
          let { x, y } = pos;
          x += vel.x;
          y += vel.y;
          const next = clampPoint(x, y, area());
          if (next.x !== x) vel.x *= -0.52;
          if (next.y !== y) vel.y *= -0.52;
          pos = next;
          vel.x *= 0.9;
          vel.y *= 0.9;
          placeWeb();
          if (Math.abs(vel.x) <= 0.12 && Math.abs(vel.y) <= 0.12) {
            vel = { x: 0, y: 0 };
            saveWebPos();
          }
        }
        inertiaRaf = requestAnimationFrame(step);
      };
      inertiaRaf = requestAnimationFrame(step);
    }
    const onResize = () => {
      if (!web) return;
      pos = clampPoint(pos.x, pos.y, area());
      placeWeb();
    };
    window.addEventListener("resize", onResize);
    const onBg = (e2) => {
      if (!dockOpen) return;
      if (stage.contains(e2.target)) return;
      showDock(false);
    };
    if (web) window.addEventListener("pointerdown", onBg);
    let waking = false;
    const onDown = (e2) => {
      if (e2.button !== 0) return;
      e2.preventDefault();
      pointerGen += 1;
      finishing = false;
      waking = engine.state === "sleep";
      engine.noteInput();
      vel = { x: 0, y: 0 };
      dragging = false;
      last = { x: e2.screenX, y: e2.screenY, t: performance.now() };
      gesture.onDown(e2);
      interactOn();
      if (pet && window.pet?.dragStart) {
        petDrag = true;
        window.pet.dragStart();
      } else {
        try {
          wrap.setPointerCapture(e2.pointerId);
        } catch {
        }
      }
    };
    const onMove = (e2) => {
      const move = gesture.onMove(e2);
      if (!move) return;
      wrap.classList.add("hold");
      const now = performance.now();
      const dt = Math.max(8, now - last.t);
      vel = {
        x: (e2.screenX - last.x) / dt * 16,
        y: (e2.screenY - last.y) / dt * 16
      };
      last = { x: e2.screenX, y: e2.screenY, t: now };
      dragging = true;
      if (pet) return;
      pos = clampPoint(pos.x + move.dx, pos.y + move.dy, area());
      placeWeb();
    };
    function applyPointerKind(kind) {
      if (kind === "dbl") {
        gesture.cancelTap();
        engine.noteInput();
        engine.bounceOnce();
        vel = { x: 0, y: 0 };
      } else if (kind === "tap") {
        if (waking) {
          engine.blink();
          vel = { x: 0, y: 0 };
        } else {
          gesture.scheduleTap(() => {
            engine.blink();
            showDock(!dockOpen);
          });
          vel = { x: 0, y: 0 };
        }
      } else if (kind === "drag" && web) {
        vel.x = Math.max(-38, Math.min(38, vel.x));
        vel.y = Math.max(-38, Math.min(38, vel.y));
      }
      dragging = false;
      saveWebPos();
      if (web) placeWeb();
      interactOff();
    }
    async function finishPointer(mainMoved) {
      if (finishing) return;
      if (!gesture.pressed && !petDrag) return;
      finishing = true;
      const my = pointerGen;
      wrap.classList.remove("hold");
      let kind = gesture.onUp();
      if (pet && window.pet?.dragEnd && petDrag) {
        petDrag = false;
        try {
          const result = await window.pet.dragEnd();
          if (result?.moved) kind = "drag";
        } catch {
        }
      }
      petDrag = false;
      if (mainMoved) kind = "drag";
      if (my !== pointerGen) return;
      applyPointerKind(kind);
      finishing = false;
    }
    const onUp = (e2) => {
      if (e2.button !== 0) return;
      void finishPointer();
    };
    const onCancel = () => {
      if (pet && (petDrag || gesture.dragging || gesture.pressed)) return;
      void finishPointer();
    };
    const onWinUp = (e2) => {
      if (!gesture.pressed && !petDrag) return;
      if ("button" in e2 && e2.button !== 0) return;
      void finishPointer();
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onCancel);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onWinUp, true);
    window.addEventListener("mouseup", onWinUp, true);
    const onMenu = (e2) => {
      e2.preventDefault();
      if (pet) window.pet?.hide?.();
    };
    wrap.addEventListener("contextmenu", onMenu);
    const offDragArmed = window.pet?.onDragArmed?.(() => {
      wrap.classList.add("hold");
      gesture.markMoved();
      dragging = true;
    });
    const offDragFinished = window.pet?.onDragFinished?.((result) => {
      void finishPointer(Boolean(result?.moved));
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(inertiaRaf);
      ro.disconnect();
      offBlink();
      offLand();
      offMute();
      gesture.dispose();
      registerEngine(null);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointerGaze);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onBg);
      document.removeEventListener("visibilitychange", onVis);
      motion.removeEventListener("change", onMotion);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onWinUp, true);
      window.removeEventListener("mouseup", onWinUp, true);
      wrap.removeEventListener("contextmenu", onMenu);
      wrap.removeEventListener("pointerenter", onFaceEnter);
      wrap.removeEventListener("pointerleave", onFaceLeave);
      dock.removeEventListener("pointerenter", onFaceEnter);
      dock.removeEventListener("pointerleave", onFaceLeave);
      wheel.removeEventListener("pointerdown", onWheelDown);
      wheel.removeEventListener("pointermove", onWheelMove);
      if (typeof offCursor === "function") offCursor();
      if (typeof offSide === "function") offSide();
      if (typeof offScene === "function") offScene();
      if (typeof offVisible === "function") offVisible();
      if (typeof offTrayMute === "function") offTrayMute();
      if (typeof offMeeting === "function") offMeeting();
      if (typeof offSize === "function") offSize();
      if (typeof offAuto === "function") offAuto();
      if (typeof offCodex === "function") offCodex();
      if (typeof offCodexWatch === "function") offCodexWatch();
      if (typeof offDragArmed === "function") offDragArmed();
      if (typeof offDragFinished === "function") offDragFinished();
      window.clearInterval(autoTimer);
    };
  }

  // mac/companion.ts
  bootMacCompanion();
})();
