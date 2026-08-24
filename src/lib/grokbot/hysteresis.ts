export const AGENT_RANK: Record<string, number> = { idle: 0, done: 1, running: 2, waiting: 3, error: 4 };
export const MOOD_RANK: Record<string, number> = {
  idle: 0,
  look: 1,
  play: 2,
  sleep: 2,
  think: 3,
  joy: 3,
  wait: 4,
  error: 5,
};

type LatchOpts = { rank?: Record<string, number>; enterMs?: number; exitMs?: number; init?: string | boolean };

export function createLatch({ rank = {}, enterMs = 0, exitMs = 8000, init }: LatchOpts = {}) {
  let value: string | boolean | undefined = init;
  let cand: string | boolean | undefined = init;
  let since = 0;
  return {
    value: () => value,
    reset(next: string | boolean, now = Date.now()) {
      value = next;
      cand = next;
      since = now;
      return value;
    },
    sample(next: string | boolean, now = Date.now()) {
      if (value === undefined) {
        value = next;
        cand = next;
        since = now;
        return value;
      }
      if (next === value) {
        cand = next;
        return value;
      }
      const up = (rank[String(next)] || 0) > (rank[String(value)] || 0);
      if (next !== cand) {
        cand = next;
        since = now;
        if (up && enterMs <= 0) value = next;
        return value;
      }
      const need = up ? enterMs : exitMs;
      if (now - since >= need) value = next;
      return value;
    },
  };
}

export function createGate({ enterMs = 0, exitMs = 8000 } = {}) {
  const latch = createLatch({ rank: { true: 1, false: 0 }, enterMs, exitMs, init: false });
  return {
    value: () => Boolean(latch.value()),
    reset(raw: boolean, now?: number) {
      return Boolean(latch.reset(Boolean(raw), now));
    },
    sample(raw: boolean, now?: number) {
      return Boolean(latch.sample(Boolean(raw), now));
    },
  };
}

export function schmitt(value: number, { enter, exit, wasOn }: { enter: number; exit: number; wasOn: boolean }) {
  if (!Number.isFinite(value)) return false;
  return wasOn ? value <= exit : value <= enter;
}

export function inWorkHoursHyst(d = new Date(), wasOn = false) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  if (wasOn) return m >= 8 * 60 + 45 && m < 18 * 60 + 20;
  return m >= 9 * 60 && m < 18 * 60;
}

export function soonHyst(minutes: number | null | undefined, wasOn: boolean) {
  if (!Number.isFinite(minutes) || (minutes as number) < 0) return false;
  return schmitt(minutes as number, { enter: 15, exit: 20, wasOn });
}
