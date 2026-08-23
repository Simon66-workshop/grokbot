import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CODEX_STATUSES = ["idle", "running", "waiting", "done", "error"];

const SKIP = new Set([
  "token_count",
  "session_meta",
  "event_msg",
  "response_item",
  "turn_context",
]);

const RUNNING_RE =
  /^(task_started|turn_started|exec_command|function_call|custom_tool_call|patch_apply|web_search_begin|mcp_tool|agent_reasoning|collab_agent|tool_call)/i;
const DONE_RE = /^(task_complete|turn_complete)$/i;
const WAIT_RE = /^(agent_message|collab_waiting_begin)$/i;
const ERROR_RE = /^(error|stream_error|turn_aborted)$/i;
const USER_RE = /^user_message$/i;

const LABELS = {
  idle: "idle",
  running: "working",
  waiting: "waiting",
  done: "done",
  error: "error",
};

const RANK = { error: 4, waiting: 3, running: 2, done: 1, idle: 0 };

export function payloadType(row) {
  if (!row || typeof row !== "object") return "";
  const p = row.payload;
  if (p && typeof p === "object" && p.type) return String(p.type);
  if (typeof row.type === "string" && row.type !== "event_msg") return row.type;
  return "";
}

export function classifyRows(rows, { processOn = false, ageMs = Infinity } = {}) {
  let last = "";
  for (let i = rows.length - 1; i >= 0; i--) {
    const t = payloadType(rows[i]).toLowerCase();
    if (!t || SKIP.has(t)) continue;
    last = t;
    break;
  }
  if (ERROR_RE.test(last)) return "error";
  if (RUNNING_RE.test(last)) return "running";
  if (USER_RE.test(last)) {
    if (processOn || ageMs < 90_000) return "running";
    return ageMs < 5 * 60_000 ? "waiting" : "idle";
  }
  if (DONE_RE.test(last) || WAIT_RE.test(last)) {
    if (processOn) return "waiting";
    return ageMs < 5 * 60_000 ? "done" : "idle";
  }
  if (processOn) return "running";
  if (ageMs < 90_000) return "running";
  return "idle";
}

export function parseJsonlTail(text, startedMidLine = false) {
  const lines = String(text || "").split(/\n+/);
  if (startedMidLine && lines.length) lines.shift();
  const rows = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      rows.push(JSON.parse(s));
    } catch {
      /* skip torn lines */
    }
  }
  return rows;
}

export function cwdLabel(rows) {
  for (const row of rows) {
    const p = row?.payload;
    const cwd = p?.cwd || row?.cwd;
    if (typeof cwd === "string" && cwd.trim()) {
      const base = path.basename(cwd.replace(/[/\\]+$/, ""));
      if (base) return base.slice(0, 40);
    }
  }
  return "";
}

export function mergeStatus(a, b) {
  return (RANK[a] || 0) >= (RANK[b] || 0) ? a : b;
}

export function statusLabel(status) {
  return LABELS[status] || "idle";
}

export function notifyCopy(status, name, threads) {
  const who = name || (threads > 1 ? `${threads} threads` : "Codex");
  if (status === "waiting") return { title: "Codex is waiting", body: `${who} needs you.` };
  if (status === "done") return { title: "Codex finished", body: `${who} is done.` };
  if (status === "error") return { title: "Codex hit an error", body: `${who} stopped.` };
  if (status === "running") return { title: "Codex is working", body: who };
  return null;
}

export function walkJsonl(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonl(p, out, depth + 1);
    else if (ent.isFile() && ent.name.endsWith(".jsonl") && ent.name !== "session_index.jsonl") {
      out.push(p);
    }
  }
  return out;
}

export function readTail(file, bytes = 64_000) {
  const st = fs.statSync(file);
  const start = Math.max(0, st.size - bytes);
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return { text: buf.toString("utf8"), mtimeMs: st.mtimeMs, size: st.size, mid: start > 0 };
  } finally {
    fs.closeSync(fd);
  }
}

export function sessionsRoot(home = os.homedir()) {
  const env = process.env.CODEX_HOME;
  if (env && env.trim()) return path.join(env, "sessions");
  return path.join(home, ".codex", "sessions");
}

export function processLooksLikeCodex(line) {
  const n = String(line || "").toLowerCase();
  if (!n.trim()) return false;
  if (n.includes("grokbot") || n.includes("codexorbit")) return false;
  return /(?:^|\s|\/)codex(?:\s|$|\.|-cli)|codex\.app/.test(n);
}

export function snapshotFromFiles(files, { processOn = false, now = Date.now(), maxAgeMs = 6 * 3600_000 } = {}) {
  let status = "idle";
  let name = "";
  let threads = 0;
  for (const file of files) {
    let tail;
    try {
      tail = readTail(file);
    } catch {
      continue;
    }
    const ageMs = Math.max(0, now - tail.mtimeMs);
    if (ageMs > maxAgeMs && !processOn) continue;
    const rows = parseJsonlTail(tail.text, tail.mid);
    const next = classifyRows(rows, { processOn, ageMs });
    if (next === "idle") continue;
    threads += 1;
    status = mergeStatus(status, next);
    if (!name) name = cwdLabel(rows);
  }
  if (status === "idle" && processOn) {
    status = "running";
    threads = Math.max(threads, 1);
  }
  return {
    status,
    label: statusLabel(status),
    name,
    threads,
    processOn: Boolean(processOn),
  };
}

export async function readCodexSnapshot({ runCmd, now = Date.now() } = {}) {
  let processOn = false;
  if (typeof runCmd === "function") {
    try {
      const out = await runCmd("pgrep", ["-il", "codex"], 1500);
      processOn = String(out || "")
        .split(/\n+/)
        .some(processLooksLikeCodex);
    } catch {
      processOn = false;
    }
  }
  const root = sessionsRoot();
  const files = walkJsonl(root);
  return snapshotFromFiles(files, { processOn, now });
}
