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
  "system",
  "progress",
  "file-history-snapshot",
  "queue-operation",
]);

const SKIP_FILE = /^(auth|settings|config|credentials|token|secret|keystore)/i;

const RUNNING_RE =
  /^(task_started|turn_started|exec_command|function_call|custom_tool_call|patch_apply|web_search_begin|mcp_tool|agent_reasoning|collab_agent|tool_call|tool_use|tool_result)/i;
const DONE_RE = /^(task_complete|turn_complete|result)$/i;
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

function envJoin(envName, home, ...parts) {
  const env = process.env[envName];
  if (env && env.trim()) return path.join(env, ...parts.slice(1));
  return path.join(home, ...parts);
}

export const TOOLS = [
  {
    id: "codex",
    name: "Codex",
    roots: (h) => [envJoin("CODEX_HOME", h, ".codex", "sessions")],
    proc: (n) => /(?:^|\s|\/)codex(?:\s|$|\.|-cli)|codex\.app/.test(n) && !n.includes("codexorbit"),
  },
  {
    id: "claude",
    name: "Claude",
    roots: (h) => [envJoin("CLAUDE_CONFIG_DIR", h, ".claude", "projects")],
    proc: (n) => /(?:^|\s|\/)claude(?:\s|$|\.)|claude-code|claude\.app/.test(n),
  },
  {
    id: "gemini",
    name: "Gemini",
    roots: (h) => [path.join(h, ".gemini", "tmp")],
    proc: (n) => /(?:^|\s|\/)gemini(?:-cli)?(?:\s|$|\.)|antigravity/.test(n),
  },
  {
    id: "cursor",
    name: "Cursor",
    roots: (h) => [path.join(h, ".cursor", "projects")],
    proc: (n) => /cursor-agent|(?:^|\s)cursor(?:\s|$|\.app)/.test(n),
  },
  {
    id: "amp",
    name: "Amp",
    roots: (h) => [path.join(h, ".local", "share", "amp", "threads")],
    proc: (n) => /(?:^|\s|\/)amp(?:\s|$|\.)|sourcegraph-amp/.test(n),
  },
  {
    id: "goose",
    name: "Goose",
    roots: (h) => [path.join(h, ".local", "share", "goose", "sessions")],
    proc: (n) => /(?:^|\s|\/)goose(?:\s|$|\.)|block-goose/.test(n),
  },
  {
    id: "opencode",
    name: "OpenCode",
    roots: (h) => [path.join(h, ".local", "share", "opencode")],
    proc: (n) => /opencode/.test(n),
  },
  {
    id: "aider",
    name: "Aider",
    roots: () => [],
    proc: (n) => /(?:^|\s|\/)aider(?:\s|$)/.test(n),
  },
  {
    id: "copilot",
    name: "Copilot",
    roots: () => [],
    proc: (n) => /copilot/.test(n),
  },
];

function hasToolUse(row) {
  const c = row?.message?.content ?? row?.content;
  if (Array.isArray(c)) {
    return c.some((b) => b && (b.type === "tool_use" || b.type === "tool_result" || b.tool_use_id));
  }
  return Boolean(row?.toolCalls || row?.tool_calls || row?.tool_use);
}

export function payloadType(row) {
  if (!row || typeof row !== "object") return "";
  const p = row.payload;
  if (p && typeof p === "object" && p.type) return String(p.type);
  const t = String(row.type || "").toLowerCase();
  if (t === "event_msg") return "";
  if (t === "assistant" || t === "ai" || t === "model") return hasToolUse(row) ? "tool_call" : "agent_message";
  if (t === "human" || t === "user") return hasToolUse(row) ? "tool_call" : "user_message";
  if (t === "tool" || t === "tool_use" || t === "tool_result") return "tool_call";
  if (t === "result") return row.is_error ? "error" : "task_complete";
  if (typeof row.type === "string") return row.type;
  if (typeof row.role === "string") {
    const role = row.role.toLowerCase();
    if (role === "user" || role === "human") return "user_message";
    if (hasToolUse(row)) return "tool_call";
    return "agent_message";
  }
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
    if (!s.startsWith("{") && !s.startsWith("[")) continue;
    try {
      rows.push(JSON.parse(s));
    } catch {
      /* skip torn lines */
    }
  }
  return rows;
}

export function rowsFromUnknown(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr : [];
    } catch {
      /* fall through */
    }
  }
  if (trimmed.startsWith("{") && !trimmed.includes("\n{")) {
    try {
      return rowsFromObject(JSON.parse(trimmed));
    } catch {
      /* fall through */
    }
  }
  return parseJsonlTail(trimmed, false);
}

export function rowsFromObject(obj) {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj;
  const msgs = obj.messages || obj.history || obj.turns || obj.entries;
  if (Array.isArray(msgs)) {
    return msgs.map((m) => {
      if (m && typeof m === "object") return m;
      return { type: "agent_message" };
    });
  }
  return [obj];
}

export function cwdLabel(rows) {
  for (const row of rows) {
    const p = row?.payload;
    const cwd = p?.cwd || row?.cwd || row?.project || row?.workspace;
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

export function notifyCopy(status, name, threads, tool = "Codex") {
  const who = name || (threads > 1 ? `${threads} threads` : tool);
  if (status === "waiting") return { title: `${tool} is waiting`, body: `${who} needs you.` };
  if (status === "done") return { title: `${tool} finished`, body: `${who} is done.` };
  if (status === "error") return { title: `${tool} hit an error`, body: `${who} stopped.` };
  if (status === "running") return { title: `${tool} is working`, body: who };
  return null;
}

export function walkJsonl(dir, out = [], depth = 0) {
  return walkSessionFiles(dir, out, depth);
}

export function walkSessionFiles(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSessionFiles(p, out, depth + 1);
    else if (ent.isFile() && !SKIP_FILE.test(ent.name) && ent.name !== "session_index.jsonl") {
      if (ent.name.endsWith(".jsonl") || ent.name.endsWith(".json")) out.push(p);
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
  if (!n.trim() || n.includes("grokbot")) return false;
  return TOOLS[0].proc(n);
}

function matchToolProcess(line) {
  const n = String(line || "").toLowerCase();
  if (!n.trim() || n.includes("grokbot") || n.includes("codexorbit")) return null;
  for (const tool of TOOLS) {
    if (tool.proc(n)) return tool.id;
  }
  return null;
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
    const rows = file.endsWith(".json") && !file.endsWith(".jsonl") ? rowsFromUnknown(tail.text) : parseJsonlTail(tail.text, tail.mid);
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
    tool: "",
  };
}

const EMPTY = { status: "idle", label: "idle", name: "", threads: 0, processOn: false, tool: "" };

export async function readCodexSnapshot({ runCmd, now = Date.now(), home = os.homedir() } = {}) {
  let lines = [];
  if (typeof runCmd === "function") {
    try {
      const out = await runCmd("pgrep", ["-il", "codex|claude|gemini|opencode|goose|aider|copilot|cursor|amp"], 2000);
      lines = String(out || "").split(/\n+/);
    } catch {
      lines = [];
    }
  }
  const live = new Set();
  for (const line of lines) {
    const id = matchToolProcess(line);
    if (id) live.add(id);
  }
  let best = { ...EMPTY };
  let threads = 0;
  let anyProc = false;
  for (const tool of TOOLS) {
    const processOn = live.has(tool.id);
    if (processOn) anyProc = true;
    const files = (tool.roots(home) || []).flatMap((root) => walkSessionFiles(root));
    const snap = snapshotFromFiles(files, { processOn, now });
    if (snap.status === "idle") continue;
    threads += snap.threads;
    const next = { ...snap, tool: tool.name, processOn: processOn || snap.processOn };
    if (
      !best.tool ||
      (RANK[next.status] || 0) > (RANK[best.status] || 0) ||
      ((RANK[next.status] || 0) === (RANK[best.status] || 0) && next.threads > best.threads)
    ) {
      best = next;
    }
  }
  if (best.status === "idle" && anyProc) {
    const first = TOOLS.find((t) => live.has(t.id));
    return {
      status: "running",
      label: "working",
      name: "",
      threads: 1,
      processOn: true,
      tool: first?.name || "Agents",
    };
  }
  if (best.status === "idle") return { ...EMPTY };
  return { ...best, threads: Math.max(threads, best.threads) };
}
