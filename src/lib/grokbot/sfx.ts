export type SfxName = "blink" | "land" | "dock";

const MUTE_KEY = "grok-sfx-muted";

let ctx: AudioContext | null = null;
let muted = readMuted();
const listeners = new Set<(on: boolean) => void>();

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
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(
  ac: AudioContext,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType,
  slide = 0,
) {
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function isMuted() {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(on));
}

export function onMute(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function playSfx(name: SfxName) {
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
