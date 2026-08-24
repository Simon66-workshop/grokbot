export const AGENT_RANK = { idle: 0, done: 1, running: 2, waiting: 3, error: 4 };
export const MOOD_RANK = { idle: 0, look: 1, play: 2, sleep: 2, think: 3, joy: 3, wait: 4, error: 5 };

export function createLatch({ rank = {}, enterMs = 0, exitMs = 8000, init } = {}) {
  let value = init;
  let cand = init;
  let since = 0;
  return {
    value: () => value,
    reset(next, now = Date.now()) {
      value = next;
      cand = next;
      since = now;
      return value;
    },
    sample(next, now = Date.now()) {
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
        if (up && enterMs <= 0) {
          value = next;
        }
        return value;
      }
      const need = up ? enterMs : exitMs;
      if (now - since >= need) value = next;
      return value;
    },
  };
}

export function createGate({ enterMs = 0, exitMs = 8000 } = {}) {
  const latch = createLatch({
    rank: { true: 1, false: 0 },
    enterMs,
    exitMs,
    init: false,
  });
  return {
    value: () => Boolean(latch.value()),
    reset(raw, now) {
      return Boolean(latch.reset(Boolean(raw), now));
    },
    sample(raw, now) {
      return Boolean(latch.sample(Boolean(raw), now));
    },
  };
}

export function schmitt(value, { enter, exit, wasOn }) {
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

export function soonHyst(minutes, wasOn) {
  if (!Number.isFinite(minutes) || minutes < 0) return false;
  return schmitt(minutes, { enter: 15, exit: 20, wasOn });
}

export function stampMeeting(cal, now = Date.now()) {
  const next = cal?.next;
  if (!next || !Number.isFinite(next.minutes)) return { on: Boolean(cal?.on), next: null };
  return {
    on: Boolean(cal.on),
    next: { title: next.title, minutes: next.minutes },
    nextDue: now + Math.max(0, next.minutes) * 60_000,
  };
}

export function tickMeeting(cal, now = Date.now()) {
  if (!cal?.next) return { on: Boolean(cal?.on), next: null };
  if (!cal.nextDue) return { on: Boolean(cal?.on), next: cal.next };
  const minutes = Math.max(0, Math.round((cal.nextDue - now) / 60_000));
  return { on: Boolean(cal.on), next: { title: cal.next.title, minutes }, nextDue: cal.nextDue };
}
