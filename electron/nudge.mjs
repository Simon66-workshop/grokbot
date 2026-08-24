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
