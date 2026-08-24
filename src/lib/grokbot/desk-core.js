export const EMPTY_POMO = {
  running: false,
  phase: "idle",
  remainingMs: 0,
  totalMs: 25 * 60_000,
};

export const EMPTY_DESK = {
  digest: "All quiet.",
  agents: [],
  meeting: { on: false, next: null },
  focus: { app: "", workish: false },
  git: [],
  pomo: { ...EMPTY_POMO },
  grok: { available: false, source: "none" },
  perms: { calendar: true, automation: true, grokBot: true, missing: [] },
  quiet: false,
};

const WORK_APP_RE =
  /cursor|visual studio code|^code$|vscode|vscodium|xcode|terminal|iterm|warp|ghostty|zed|sublime|intellij|webstorm|goland|phpstorm|pycharm|android studio|fleet|windsurf|antigravity|claude|codex|emacs|nvim|macvim|kitty|alacritty|wezterm|rider|grok bot/i;

export function appIsWork(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (/grokbot/i.test(n)) return false;
  return WORK_APP_RE.test(n);
}

export function parseGitStatus(text) {
  const lines = String(text || "").split(/\n/);
  const head = lines[0] || "";
  const branch = (head.match(/^##\s+(\S+?)(?:\.\.\.|$)/) || [])[1] || "";
  const ahead = Number((head.match(/ahead (\d+)/) || [])[1] || 0);
  const behind = Number((head.match(/behind (\d+)/) || [])[1] || 0);
  let dirty = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim()) dirty += 1;
  }
  return { branch, ahead, behind, dirty };
}

export function formatRemain(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function composeDigest(input = {}) {
  const bits = [];
  const agents = input.agents || [];
  const waiting = agents.filter((a) => a.status === "waiting");
  const running = agents.filter((a) => a.status === "running");
  const errored = agents.filter((a) => a.status === "error");
  if (errored.length) bits.push(`${errored[0].name} hit an error`);
  else if (waiting.length) bits.push(`${waiting.slice(0, 2).map((a) => a.name).join(" & ")} waiting`);
  else if (running.length) {
    const first = running[0];
    bits.push(first.cwd ? `${first.name} on ${first.cwd}` : `${first.name} working`);
  }

  const meet = input.meeting;
  if (meet?.on) bits.push("in a meeting");
  else if (meet?.next && meet.next.minutes >= 0) {
    const title = String(meet.next.title || "Meeting").slice(0, 28);
    bits.push(`${title} in ${meet.next.minutes}m`);
  }

  const pomo = input.pomo;
  if (pomo?.running && pomo.phase === "work") bits.push(`focus ${formatRemain(pomo.remainingMs)}`);
  else if (pomo?.running && pomo.phase === "break") bits.push(`break ${formatRemain(pomo.remainingMs)}`);

  const git = input.git || [];
  const fail = git.find((g) => g.tests === "fail");
  if (fail) bits.push(`${fail.repo} tests failed`);
  else {
    const dirty = git.find((g) => g.dirty > 0);
    if (dirty) bits.push(`${dirty.repo} dirty`);
  }

  const perms = input.perms;
  if (perms?.missing?.length) bits.unshift(perms.missing[0].label);

  if (!bits.length) return input.focus?.workish ? "Heads down." : "All quiet.";
  return bits.slice(0, 3).join(" · ");
}

export function demoDesk() {
  const agents = [
    { id: "grok-bot", name: "Grok Bot", status: "waiting", label: "needs you", threads: 1, cwd: "", processOn: true },
    { id: "claude", name: "Claude", status: "waiting", label: "waiting", threads: 1, cwd: "grokbot", processOn: true },
  ];
  const meeting = { on: false, next: { title: "Design review", minutes: 12 } };
  const git = [{ repo: "grokbot", branch: "main", dirty: 3, ahead: 1, behind: 0, tests: "pass" }];
  const focus = { app: "Grok Bot", workish: true };
  const pomo = { ...EMPTY_POMO };
  const perms = {
    calendar: false,
    automation: true,
    grokBot: false,
    missing: [
      { id: "calendar", label: "Allow Calendar" },
      { id: "grok-bot", label: "Allow Grok Bot" },
    ],
  };
  return {
    digest: composeDigest({ agents, meeting, focus, git, pomo, perms }),
    agents,
    meeting,
    focus,
    git,
    pomo,
    grok: { available: true, source: "cli" },
    perms,
    quiet: false,
  };
}

export function grokPromptFor(digest) {
  return `Rewrite this Mac desktop status as one calm spoken sentence. Max 12 words. No emoji, no quotes, no markdown.\n\n${String(digest || "All quiet.").slice(0, 240)}`;
}

export function cleanGrokOut(raw) {
  const stripped = String(raw || "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\r/g, "");
  const lines = stripped
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(thinking|working|loading|grok\s|>)/i.test(l));
  let text = (lines[lines.length - 1] || "").replace(/^["\u201c]|["\u201d]$/g, "").trim();
  if (text.length > 140) text = `${text.slice(0, 137)}…`;
  return text;
}

export function createPomo({ workMs = 25 * 60_000, breakMs = 5 * 60_000 } = {}) {
  const state = {
    running: false,
    phase: "idle",
    endsAt: 0,
    pausedMs: 0,
    totalMs: workMs,
    workMs,
    breakMs,
  };

  function snap(now = Date.now()) {
    if (!state.running) {
      const remainingMs = state.phase === "idle" ? 0 : state.pausedMs;
      return {
        running: false,
        phase: state.phase,
        remainingMs,
        totalMs: state.totalMs,
      };
    }
    const remainingMs = Math.max(0, state.endsAt - now);
    return {
      running: remainingMs > 0,
      phase: state.phase,
      remainingMs,
      totalMs: state.totalMs,
    };
  }

  function begin(phase, now = Date.now()) {
    state.running = true;
    state.phase = phase;
    state.totalMs = phase === "break" ? state.breakMs : state.workMs;
    state.endsAt = now + state.totalMs;
    state.pausedMs = 0;
    return { ...snap(now), justEnded: null };
  }

  function toggle(now = Date.now()) {
    if (state.phase === "idle") return begin("work", now);
    if (state.running) {
      state.pausedMs = Math.max(0, state.endsAt - now);
      state.running = false;
      return { ...snap(now), justEnded: null };
    }
    state.running = true;
    state.endsAt = now + (state.pausedMs || state.totalMs);
    state.pausedMs = 0;
    return { ...snap(now), justEnded: null };
  }

  function skip(now = Date.now()) {
    if (state.phase === "work") return begin("break", now);
    state.running = false;
    state.phase = "idle";
    state.endsAt = 0;
    state.pausedMs = 0;
    return { ...snap(now), justEnded: "break" };
  }

  function tick(now = Date.now()) {
    if (!state.running) return { ...snap(now), justEnded: null };
    if (state.endsAt - now > 0) return { ...snap(now), justEnded: null };
    if (state.phase === "work") {
      const next = begin("break", now);
      return { ...next, justEnded: "work" };
    }
    state.running = false;
    state.phase = "idle";
    state.endsAt = 0;
    state.pausedMs = 0;
    return { ...snap(now), justEnded: "break" };
  }

  return { snap, toggle, skip, tick, begin };
}
