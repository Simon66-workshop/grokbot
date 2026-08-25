export const NUDGE_MS = 150_000;
export const OVERLAY_MS = 120_000;

export function waitKey(snap = {}) {
  if (snap.status !== "waiting") return "";
  return `${snap.tool || ""}|${snap.name || ""}|waiting`;
}

export function nextNudge({
  status,
  key = "",
  now = Date.now(),
  lastNudgeAt = 0,
  ackedKey = "",
  interval = NUDGE_MS,
} = {}) {
  if (status !== "waiting") return { fire: false, first: false, reset: true };
  if (key && key === ackedKey) return { fire: false, first: false, reset: false };
  if (!lastNudgeAt) return { fire: true, first: true, reset: false };
  if (now - lastNudgeAt >= interval) return { fire: true, first: false, reset: false };
  return { fire: false, first: false, reset: false };
}

export function bannersQuiet({ meeting = false, meetingOn = false, pomo } = {}) {
  if (meeting || meetingOn) return true;
  return Boolean(pomo?.running && pomo.phase === "work");
}

export function parseNudgeUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let u;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "grokbot:") return null;
  const host = (u.hostname || u.host || "").toLowerCase();
  const pathId = u.pathname.replace(/^\//, "");
  const kind = host || pathId || "nudge";
  if (kind === "open") {
    return { kind: "open", id: u.searchParams.get("id") || "grok-bot" };
  }
  const status = (u.searchParams.get("status") || pathId || "waiting").toLowerCase();
  const allowed = new Set(["waiting", "done", "error", "running"]);
  return {
    kind: "nudge",
    status: allowed.has(status) ? status : "waiting",
    name: (u.searchParams.get("name") || "").slice(0, 48),
    tool: (u.searchParams.get("tool") || "Grok Bot").slice(0, 32),
  };
}

export function overlayAgentId(tool) {
  const id = String(tool || "grok-bot")
    .toLowerCase()
    .replace(/\s+/g, "-");
  return id || "grok-bot";
}

export function overlayWhisper(msg = {}) {
  const tool = msg.tool || "Grok Bot";
  return msg.name ? `${tool} · ${msg.name}` : `${tool} · ${msg.status || "waiting"}`;
}

export function agentChipKey(agent = {}) {
  return `${agent.id || ""}:${agent.status || ""}:${agent.cwd || ""}`;
}

export function overlayChipKey(msg = {}) {
  return agentChipKey({
    id: overlayAgentId(msg.tool),
    status: msg.status,
    cwd: msg.name || "",
  });
}

export function overlayStatusLabel(status) {
  if (status === "error") return "error";
  if (status === "waiting") return "needs you";
  if (status === "done") return "done";
  return "working";
}

export function overlayAsAgent(overlay) {
  if (!overlay || overlay.status === "idle") return null;
  const status = overlay.status || "waiting";
  return {
    id: overlayAgentId(overlay.tool),
    name: overlay.tool || "Grok Bot",
    status,
    label: overlayStatusLabel(status),
    threads: 1,
    cwd: overlay.name || "",
    path: "",
    processOn: true,
  };
}

export function shouldInjectOverlay(overlay, agents = []) {
  const row = overlayAsAgent(overlay);
  if (!row) return false;
  return !(agents || []).some((a) => a.id === row.id && a.status === row.status);
}

function dismissedKeyFor(dismissed, id) {
  if (!dismissed) return "";
  if (typeof dismissed.get === "function") return dismissed.get(id) || "";
  return dismissed[id] || "";
}

export function isAgentChipDismissed(agent, dismissed) {
  if (!agent) return false;
  const prev = dismissedKeyFor(dismissed, agent.id);
  return Boolean(prev) && prev === agentChipKey(agent);
}

export function visibleAgentChips(agents = [], { watch = true, dismissed } = {}) {
  return (agents || []).filter((a) => {
    if (!a || a.status === "idle") return false;
    if (isAgentChipDismissed(a, dismissed)) return false;
    if (watch) return true;
    return a.status === "waiting" || a.status === "error";
  });
}

export function rememberAgentDismiss(dismissed, agent) {
  const key = agentChipKey(agent);
  if (dismissed instanceof Map) {
    dismissed.set(agent.id, key);
    return dismissed;
  }
  const next = { ...(dismissed || {}) };
  next[agent.id] = key;
  return next;
}

export function sameChipSnapshot(a, b) {
  if (!a || !b) return false;
  return agentChipKey(a) === agentChipKey(b);
}

export function parseInbox(raw) {
  try {
    const row = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!row || typeof row !== "object") return null;
    const status = String(row.status || "waiting").toLowerCase();
    return {
      kind: "nudge",
      status: ["waiting", "done", "error", "running"].includes(status) ? status : "waiting",
      name: String(row.name || "").slice(0, 48),
      tool: String(row.tool || "Grok Bot").slice(0, 32),
    };
  } catch {
    return null;
  }
}

export function parseMacScene(raw) {
  const text = String(raw || "");
  const grokMark = "\nGROKWIN\n";
  const appsMark = "\nAPPS\n";
  const grokIdx = text.indexOf(grokMark);
  const appsIdx = text.indexOf(appsMark);
  let front = "";
  let botWins = "";
  let apps = "";
  if (grokIdx >= 0 && appsIdx > grokIdx) {
    front = text.slice(0, grokIdx).trim();
    botWins = text.slice(grokIdx + grokMark.length, appsIdx);
    apps = text.slice(appsIdx + appsMark.length);
  } else {
    front = text.trim().split(/\n/)[0] || "";
    apps = text;
  }
  const meetRe = /zoom(\.us)?|facetime|webex|microsoft teams|^teams$|ciscowebex|google meet/i;
  const meetingApp = String(apps)
    .split(",")
    .some((n) => meetRe.test(n.trim()));
  return { front, grokBotWindows: String(botWins || "").trim(), meetingApp };
}
