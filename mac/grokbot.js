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
      this.tgt.hopX = 0;
      this.tgt.squash = 1;
      this.bounceHold = false;
      this.nextBlink = this.elapsed + 2.4 + Math.random() * 2.6;
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
      if (this.autoIdle && this.state === "idle" && !this.demoPlaying && !this.reducedMotion) {
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
      if (this.autoIdle && this.state === "idle" && !this.demoPlaying && this.elapsed > this.nextBlink) {
        const roll = Math.random();
        if (roll < 0.16) {
          this.play("bounce");
          this.bounceHold = false;
          this.stateUntil = this.elapsed + this.bounceDur;
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
            this.tgt.hopX = 0;
            this.tgt.squash = 1;
            this.tgt.bodyScale = 1;
            this.tgt.eyeAlpha = 1;
            this.tgt.faceW = 1;
            this.tgt.exclaimW = 0;
            this.expression = 0;
            this.state = "idle";
          } else if (this.state === "loading" || this.state === "shrink") {
          } else if (this.state === "orbits" || this.state === "think" || this.state === "streaks") {
          }
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
    }
    tickGaze() {
      if (this.followPointer && this.pointer.active && !this.demoPlaying) {
        this.tgt.gazeX = this.pointer.x;
        this.tgt.gazeY = this.pointer.y;
        if (this.state !== "bounce") {
          this.tgt.yaw = this.pointer.x * 0.48;
          this.tgt.pitch = this.pointer.y * 0.32;
        }
      } else if (this.autoIdle && this.state === "idle" && !this.demoPlaying) {
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
  function drawColorWheel(ctx, size, current) {
    const cx = size / 2;
    const cy = size / 2;
    const outer = size / 2 - 1;
    const ringIn = outer - 16;
    const disc = ringIn - 7;
    ctx.clearRect(0, 0, size, size);
    const img = ctx.createImageData(size, size);
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
    ctx.putImageData(img, 0, 0);
    const segs = 96;
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2 - Math.PI / 2;
      const a1 = (i + 1.15) / segs * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, a0, a1);
      ctx.arc(cx, cy, ringIn, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = hsvToHex(i / segs * 360, 1, 1);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, disc + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const ringA = (current.h - 90) * Math.PI / 180;
    const ringR = (outer + ringIn) / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ringA) * ringR, cy + Math.sin(ringA) * ringR, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,18,16,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const discA = (current.h - 90) * Math.PI / 180;
    const discR = current.s * disc;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(discA) * discR, cy + Math.sin(discA) * discR, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,18,16,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // src/lib/grokbot/renderer.ts
  function fillPath(ctx, pts) {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }
  function hueStroke(h, a = 1) {
    return `hsla(${h}, 72%, 62%, ${a})`;
  }
  function drawGrokBot(ctx, engine2, cssSize, theme, opts) {
    const dpr = cssSize;
    ctx.clearRect(0, 0, dpr, dpr);
    ctx.save();
    ctx.translate(dpr / 2, dpr / 2);
    const faceScale = opts?.faceScale ?? 0.31;
    const scale = dpr * faceScale / FACE_R;
    ctx.scale(scale, scale);
    if (faceScale > 0.28) ctx.translate(0, -FACE_R * 0.06);
    const face = resolveFaceHex(engine2.faceColor);
    const eyeFill = theme.eye;
    const spin = engine2.t.spin.value;
    if (spin) ctx.rotate(spin * Math.sin(performance.now() / 900) * 0.35);
    const flyX = engine2.t.flyX.value * FACE_R * 1.45;
    const flyY = engine2.t.flyY.value * FACE_R * 1.45;
    const hop = engine2.t.hop.value;
    const hopX = engine2.t.hopX.value;
    const squash = Math.max(0.45, engine2.t.squash.value);
    ctx.translate(flyX + hopX * FACE_R * 0.7, flyY - hop * FACE_R * 0.78);
    const orbitW = engine2.t.orbitW.value;
    const streakW = engine2.t.streakW.value;
    const bodyScale = Math.max(0.04, engine2.t.bodyScale.value);
    const dotsW = engine2.t.dotsW.value;
    const exclaimW = engine2.t.exclaimW.value;
    const satW = engine2.t.satW.value;
    const faceW = engine2.t.faceW.value;
    const lookX = engine2.t.gazeX.value + engine2.t.yaw.value * 0.55;
    const lookY = engine2.t.gazeY.value + engine2.t.pitch.value * 0.45;
    drawTrail(ctx, engine2);
    if (orbitW > 0.02) drawOrbits(ctx, engine2, orbitW, -1);
    if (streakW > 0.02) drawStreaks(ctx, engine2, streakW, -1);
    const hideBody = dotsW > 0.45;
    if (!hideBody && faceW > 0.08) {
      drawContactShadow(ctx, faceW, bodyScale, hop, hopX, lookX, lookY);
    }
    ctx.save();
    ctx.translate(lookX * 4, lookY * 3.5);
    ctx.rotate(lookX * 0.04);
    ctx.scale(
      1 + lookX * lookX * 0.03 - lookY * lookY * 0.015,
      1 + lookY * lookY * 0.025 - lookX * lookX * 0.018
    );
    ctx.scale(bodyScale * (1 / squash), bodyScale * squash);
    const body = engine2.bodyPoints();
    if (!hideBody && (faceW > 0.02 || exclaimW > 0.02)) {
      ctx.globalAlpha = Math.max(faceW, exclaimW);
      fillPath(ctx, body);
      ctx.fillStyle = face;
      ctx.fill();
      shadeSphere(ctx, body, face, lookX, lookY);
      ctx.globalAlpha = 1;
    }
    if (!hideBody && faceW > 0.05 && engine2.t.eyeAlpha.value > 0.02) {
      ctx.save();
      fillPath(ctx, body);
      ctx.clip();
      const L = engine2.projectedEye("left");
      const R = engine2.projectedEye("right");
      const eyes = L.depth <= R.depth ? [L, R] : [R, L];
      for (const eye of eyes) {
        if (eye.eye.alpha < 0.02) continue;
        const a = clamp(eye.eye.alpha * faceW, 0, 1);
        ctx.globalAlpha = a;
        fillPath(ctx, eye.path);
        ctx.fillStyle = eyeFill;
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (exclaimW > 0.05) {
      drawExclaimDot(ctx, face, exclaimW, bodyScale);
    }
    if (dotsW > 0.04) drawLoadingDots(ctx, engine2, face, theme, dotsW);
    if (satW > 0.04) drawSatellites(ctx, engine2, face, theme, satW);
    if (orbitW > 0.02) drawOrbits(ctx, engine2, orbitW, 1);
    if (streakW > 0.02) drawStreaks(ctx, engine2, streakW, 1);
    drawSparks(ctx, engine2);
    if (engine2.debug) drawDebug(ctx, engine2, theme);
    ctx.restore();
  }
  function drawContactShadow(ctx, faceW, bodyScale, hop, hopX, lookX, lookY) {
    const fade = faceW * bodyScale * (1 - hop * 0.45);
    const x = lookX * 8 - hopX * FACE_R * 0.22;
    const y = FACE_R * 0.94 * bodyScale + 6 + lookY * 3 + hop * FACE_R * 0.78;
    ctx.save();
    ctx.fillStyle = "#1a1814";
    ctx.globalAlpha = 0.09 * fade;
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 68 * bodyScale, 11 * bodyScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.07 * fade;
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 42 * bodyScale, 6.5 * bodyScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function shadeSphere(ctx, body, faceHex2, lookX, lookY) {
    ctx.save();
    fillPath(ctx, body);
    ctx.clip();
    const lx = -40 - lookX * 36;
    const ly = -48 - lookY * 28;
    const lum = luminance(faceHex2);
    const hi = 0.12 + (1 - lum) * 0.2;
    const sh = 0.16 + lum * 0.22;
    const volume = ctx.createRadialGradient(lx, ly, 6, lx * 0.15, ly * 0.1, FACE_R * 1.38);
    volume.addColorStop(0, `rgba(255,255,255,${hi})`);
    volume.addColorStop(0.18, `rgba(255,255,255,${hi * 0.42})`);
    volume.addColorStop(0.48, "rgba(255,255,255,0)");
    volume.addColorStop(0.78, `rgba(8,10,24,${sh * 0.55})`);
    volume.addColorStop(1, `rgba(4,6,16,${sh})`);
    ctx.fillStyle = volume;
    ctx.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);
    const spec = ctx.createRadialGradient(lx * 0.72, ly * 0.72, 0, lx * 0.72, ly * 0.72, 34);
    spec.addColorStop(0, `rgba(255,255,255,${hi})`);
    spec.addColorStop(0.35, `rgba(255,255,255,${hi * 0.3})`);
    spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spec;
    ctx.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);
    const rimX = 52 + lookX * 20;
    const rimY = 18 + lookY * 16;
    const rim = ctx.createRadialGradient(rimX, rimY, FACE_R * 0.35, 0, 0, FACE_R * 1.02);
    rim.addColorStop(0, "rgba(255,255,255,0)");
    rim.addColorStop(0.72, "rgba(255,255,255,0)");
    rim.addColorStop(0.9, `rgba(255,255,255,${0.08 + (1 - lum) * 0.12})`);
    rim.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(-FACE_R * 1.5, -FACE_R * 1.5, FACE_R * 3, FACE_R * 3);
    ctx.restore();
  }
  function drawExclaimDot(ctx, face, w, bodyScale) {
    ctx.save();
    ctx.globalAlpha = w;
    const y = FACE_R * 0.48 * bodyScale;
    ctx.beginPath();
    ctx.ellipse(0, y, 8.5 * Math.max(bodyScale, 0.7), 8.5 * Math.max(bodyScale, 0.7), 0, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.restore();
  }
  function drawLoadingDots(ctx, engine2, face, theme, w) {
    const t = performance.now() / 1e3;
    const spacing = 52;
    const items = [
      { x: -spacing, k: 0.62, r: 18 },
      { x: 0, k: 1, r: 24 },
      { x: spacing, k: 0.62, r: 18 }
    ];
    ctx.save();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pulse = 0.88 + 0.12 * Math.sin(t * 3.6 + i * 0.95);
      ctx.globalAlpha = w * it.k;
      ctx.beginPath();
      ctx.arc(it.x, 0, it.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = face;
      ctx.fill();
    }
    ctx.restore();
  }
  function drawSatellites(ctx, engine2, face, theme, w) {
    ctx.save();
    const scale = engine2.t.bodyScale.value;
    for (let i = 0; i < engine2.satellites.length; i++) {
      const s = engine2.satellites[i];
      const x = Math.cos(s.ang + i) * s.dist * Math.max(scale, 0.25);
      const y = Math.sin(s.ang * 0.85 + i) * s.dist * 0.55 * Math.max(scale, 0.25);
      ctx.globalAlpha = w * (i === 0 ? 1 : 0.55);
      ctx.beginPath();
      ctx.arc(x, y - 10, s.r * (i === 0 ? 1.15 : 0.85), 0, Math.PI * 2);
      if (i === 0 && engine2.state === "focus") {
        ctx.fillStyle = theme.grok;
        ctx.fill();
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = theme.paper;
        ctx.stroke();
      } else {
        ctx.fillStyle = face;
        ctx.globalAlpha = w * 0.45;
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawOrbits(ctx, engine2, w, hemisphere) {
    const samples = 72;
    for (const o of engine2.orbits) {
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
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = o.width;
      ctx.globalAlpha = w * 0.92;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const midZ = (a.z + b.z) / 2;
        if (hemisphere < 0 && midZ > 8) continue;
        if (hemisphere > 0 && midZ < -8) continue;
        const u = i / (pts.length - 1);
        const h = lerp(o.hueA, o.hueB, u);
        ctx.beginPath();
        ctx.strokeStyle = hueStroke(h, 0.95);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawStreaks(ctx, engine2, w, hemisphere) {
    if (hemisphere < 0) return;
    const t = performance.now() / 1e3;
    const streaks = [
      { y: -36, rot: -0.45, h0: 12, h1: 55, len: 150 },
      { y: -18, rot: -0.38, h0: 165, h1: 200, len: 120 },
      { y: -50, rot: -0.52, h0: 280, h1: 330, len: 110 }
    ];
    ctx.save();
    ctx.globalAlpha = w;
    ctx.lineCap = "round";
    for (const s of streaks) {
      ctx.save();
      ctx.rotate(s.rot + Math.sin(t) * 0.04);
      ctx.translate(-20, s.y);
      const g = ctx.createLinearGradient(-s.len / 2, 0, s.len / 2, 0);
      g.addColorStop(0, hueStroke(s.h0, 0));
      g.addColorStop(0.25, hueStroke(s.h0, 0.95));
      g.addColorStop(0.7, hueStroke(s.h1, 0.95));
      g.addColorStop(1, hueStroke(s.h1, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-s.len / 2, 0);
      ctx.quadraticCurveTo(0, -18, s.len / 2, 8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawTrail(ctx, engine2) {
    const tr = engine2.trail;
    if (tr.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1];
      const b = tr[i];
      const u = i / tr.length;
      ctx.strokeStyle = hueStroke(b.hue, u * 0.85);
      ctx.lineWidth = lerp(2, 10, u);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawSparks(ctx, engine2) {
    for (const s of engine2.sparks) {
      const u = 1 - s.life / s.max;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      ctx.strokeStyle = hueStroke(s.hue, u);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-s.len * u, 0);
      ctx.lineTo(s.len * u, 0);
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawDebug(ctx, engine2, theme) {
    ctx.save();
    ctx.strokeStyle = theme.grok;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, FACE_R, 0, Math.PI * 2);
    ctx.stroke();
    const L = engine2.projectedEye("left");
    const R = engine2.projectedEye("right");
    for (const eye of [L, R]) {
      ctx.beginPath();
      ctx.arc(eye.eye.x, eye.eye.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = theme.grok;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(eye.eye.x - 8, eye.eye.y);
      ctx.lineTo(eye.eye.x + 8, eye.eye.y);
      ctx.moveTo(eye.eye.x, eye.eye.y - 8);
      ctx.lineTo(eye.eye.x, eye.eye.y + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // mac/companion.ts
  var THEME = {
    ink: "#161513",
    paper: "#f3f1ea",
    grok: "#1b56f3",
    eye: "#fffdf8",
    muted: "#6e6a62"
  };
  var COLOR_KEY = "grok-face-color";
  var HOLD_MS = 220;
  var pet = Boolean(window.pet?.isPet || new URLSearchParams(location.search).has("pet"));
  if (pet) document.documentElement.classList.add("pet");
  function setThrough(on) {
    window.pet?.setClickThrough?.(on);
  }
  if (pet) setThrough(true);
  var engine = new GrokBotEngine();
  engine.setFollowPointer(true);
  engine.setAutoIdle(true);
  var faceHex = GROK_BLUE;
  try {
    faceHex = localStorage.getItem(COLOR_KEY) || GROK_BLUE;
  } catch {
  }
  engine.setFaceColor(faceHex);
  var stage = document.querySelector("#stage");
  var canvas = document.querySelector("#face");
  var wrap = canvas.parentElement;
  var dock = document.querySelector("#dock");
  var wheel = document.querySelector("#wheel");
  var presets = document.querySelector("#presets");
  function showDock(open) {
    stage.classList.toggle("open", open);
    if (open) setThrough(false);
    else if (!press) setThrough(true);
  }
  var hideTimer = 0;
  function armHide() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (press) return;
      showDock(false);
    }, 480);
  }
  function cancelHide() {
    window.clearTimeout(hideTimer);
    showDock(true);
  }
  if (pet) {
    stage.addEventListener("pointerenter", cancelHide);
    stage.addEventListener("pointerleave", () => {
      if (!press) armHide();
    });
  }
  function sizeCanvas() {
    const css = canvas.clientWidth || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
  }
  function paintWheel() {
    const ctx = wheel.getContext("2d");
    if (ctx) drawColorWheel(ctx, 108, hexToHsv(resolveFaceHex(faceHex)));
  }
  function setColor(hex) {
    faceHex = hex;
    engine.setFaceColor(hex);
    paintWheel();
    try {
      localStorage.setItem(COLOR_KEY, hex);
    } catch {
    }
  }
  var tick = (now) => {
    engine.tick(now);
    const ctx = canvas.getContext("2d");
    if (ctx) drawGrokBot(ctx, engine, canvas.width || 480, THEME, { faceScale: 0.24 });
    requestAnimationFrame(tick);
  };
  new ResizeObserver(sizeCanvas).observe(wrap);
  sizeCanvas();
  paintWheel();
  requestAnimationFrame(tick);
  function lookAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / Math.max(72, r.width * 0.42)));
    const ny = Math.max(-1, Math.min(1, (clientY - (r.top + r.height / 2)) / Math.max(72, r.height * 0.42)));
    engine.pointerMove(nx, ny);
  }
  if (pet && window.pet?.onCursor) {
    window.pet.onCursor((x, y) => engine.pointerMove(x, y));
  } else {
    window.addEventListener("pointermove", (e2) => lookAt(e2.clientX, e2.clientY), { passive: true });
  }
  window.addEventListener("keydown", (e2) => {
    if (e2.code === "Space") {
      e2.preventDefault();
      engine.blink();
    } else if (e2.key === "d" || e2.key === "D") engine.playDemo();
    else if (e2.key === "r" || e2.key === "R") engine.reset();
  });
  var actions = {
    idle: () => engine.reset(),
    blink: () => engine.blink(),
    look: () => engine.play("look"),
    joy: () => engine.setExpression(5),
    think: () => engine.play("loading"),
    wow: () => engine.play("exclaim"),
    orbit: () => engine.play("orbits"),
    bounce: () => engine.play("bounce"),
    tour: () => engine.playDemo()
  };
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => actions[btn.dataset.act ?? ""]?.());
  });
  FACE_PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = p.name;
    b.style.background = p.hex;
    b.addEventListener("click", () => setColor(p.hex));
    presets.appendChild(b);
  });
  var pickWheel = (e2) => {
    const r = wheel.getBoundingClientRect();
    const hit = hitColorWheel(
      (e2.clientX - r.left) / r.width * 108,
      (e2.clientY - r.top) / r.height * 108,
      108,
      hexToHsv(resolveFaceHex(faceHex))
    );
    if (hit) setColor(hsvToHex(hit.hsv.h, hit.hsv.s, hit.hsv.v));
  };
  wheel.addEventListener("pointerdown", (e2) => {
    wheel.setPointerCapture(e2.pointerId);
    pickWheel(e2);
  });
  wheel.addEventListener("pointermove", (e2) => {
    if (e2.buttons) pickWheel(e2);
  });
  var press = null;
  var tapAt = 0;
  var tapTimer = 0;
  wrap.addEventListener("pointerdown", (e2) => {
    press = {
      x: e2.screenX,
      y: e2.screenY,
      armed: false,
      moved: false,
      timer: window.setTimeout(() => {
        if (!press) return;
        press.armed = true;
        wrap.classList.add("hold");
        setThrough(false);
      }, HOLD_MS)
    };
    wrap.setPointerCapture(e2.pointerId);
  });
  wrap.addEventListener("pointermove", (e2) => {
    if (!press) return;
    const dx = e2.screenX - press.x;
    const dy = e2.screenY - press.y;
    if (!press.armed) return;
    if (Math.hypot(dx, dy) > 3) press.moved = true;
    if (pet && window.pet) window.pet.moveBy(dx, dy);
    press.x = e2.screenX;
    press.y = e2.screenY;
  });
  wrap.addEventListener("pointerup", () => {
    if (press) window.clearTimeout(press.timer);
    wrap.classList.remove("hold");
    if (press && !press.armed && !press.moved) {
      const now = performance.now();
      if (now - tapAt < 340) {
        window.clearTimeout(tapTimer);
        tapAt = 0;
        engine.bounceOnce();
      } else {
        tapAt = now;
        tapTimer = window.setTimeout(() => engine.blink(), 280);
      }
    }
    press = null;
    if (pet && !stage.matches(":hover")) armHide();
  });
})();
