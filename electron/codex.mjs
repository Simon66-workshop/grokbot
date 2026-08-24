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
    apps: ["Terminal", "iTerm", "Ghostty", "Warp", "Codex"],
  },
  {
    id: "claude",
    name: "Claude",
    roots: (h) => [envJoin("CLAUDE_CONFIG_DIR", h, ".claude", "projects")],
    proc: (n) => /(?:^|\s|\/)claude(?:\s|$|\.)|claude-code|claude\.app/.test(n),
    apps: ["Claude", "Terminal", "iTerm", "Ghostty", "Warp"],
  },
  {
    id: "gemini",
    name: "Gemini",
    roots: (h) => [path.join(h, ".gemini", "tmp")],
    proc: (n) => /(?:^|\s|\/)gemini(?:-cli)?(?:\s|$|\.)|antigravity/.test(n),
    apps: ["Terminal", "iTerm", "Ghostty", "Warp"],
  },
  {
    id: "cursor",
    name: "Cursor",
    roots: (h) => [path.join(h, ".cursor", "projects")],
    proc: (n) => /cursor-agent|(?:^|\s)cursor(?:\s|$|\.app)/.test(n),
    apps: ["Cursor"],
  },
  {
    id: "amp",
    name: "Amp",
    roots: (h) => [path.join(h, ".local", "share", "amp", "threads")],
    proc: (n) => /(?:^|\s|\/)amp(?:\s|$|\.)|sourcegraph-amp/.test(n),
    apps: ["Amp", "Terminal"],
  },
  {
    id: "goose",
    name: "Goose",
    roots: (h) => [path.join(h, ".local", "share", "goose", "sessions")],
    proc: (n) => /(?:^|\s|\/)goose(?:\s|$|\.)|block-goose/.test(n),
    apps: ["Goose", "Terminal"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    roots: (h) => [path.join(h, ".local", "share", "opencode")],
    proc: (n) => /opencode/.test(n),
    apps: ["Terminal", "iTerm"],
  },
  {
    id: "aider",
    name: "Aider",
    roots: () => [],
    proc: (n) => /(?:^|\s|\/)aider(?:\s|$)/.test(n),
    apps: ["Terminal", "iTerm"],
  },
  {
    id: "copilot",
    name: "Copilot",
    roots: () => [],
    proc: (n) => /copilot/.test(n),
    apps: ["Visual Studio Code", "Code", "Terminal"],
  },
  {
    id: "grok-bot",
    name: "Grok Bot",
    roots: (h) => [path.join(h, "Library", "Application Support", "Grok Bot")],
    proc: (n) => n.includes("grok bot") || /(?:^|\s)grok-bot(?:\s|$)/.test(n),
    apps: ["Grok Bot"],
  },
  {
    id: "grok",
    name: "Grok",
    roots: (h) => [path.join(h, ".grok"), path.join(h, ".grok-build")],
    proc: (n) => /(?:^|\s|\/)grok(?:\s|$)/.test(n) && !n.includes("grokbot") && !n.includes("grok bot"),
    apps: ["Terminal", "iTerm", "Ghostty", "Warp"],
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

export function ageStatus(status, { processOn = false, ageMs = Infinity } = {}) {
  if (status === "error") return processOn || ageMs < 5 * 60_000 ? "error" : "idle";
  if (status === "done" || status === "waiting") {
    if (processOn) return "waiting";
    return ageMs < 5 * 60_000 ? status : "idle";
  }
  if (status === "running") {
    if (processOn || ageMs < 90_000) return "running";
    return ageMs < 5 * 60_000 ? "waiting" : "idle";
  }
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
  const full = cwdFull(rows);
  if (!full) return "";
  const base = path.basename(full.replace(/[/\\]+$/, ""));
  return base ? base.slice(0, 40) : "";
}

export function cwdFull(rows) {
  for (const row of rows) {
    const p = row?.payload;
    const cwd = p?.cwd || row?.cwd || row?.project || row?.workspace;
    if (typeof cwd === "string" && cwd.trim()) return cwd.trim();
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

const FILE_SNAP = new Map();
const WALK_CACHE = new Map();
const WALK_TTL_MS = 12_000;

export function resetSessionCaches() {
  FILE_SNAP.clear();
  WALK_CACHE.clear();
}

function walkSessionFilesInner(dir, out, depth) {
  if (depth > 6) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSessionFilesInner(p, out, depth + 1);
    else if (ent.isFile() && !SKIP_FILE.test(ent.name) && ent.name !== "session_index.jsonl") {
      if (ent.name.endsWith(".jsonl") || ent.name.endsWith(".json")) out.push(p);
    }
  }
  return out;
}

export function walkJsonl(dir, out = [], depth = 0) {
  return walkSessionFiles(dir, out, depth);
}

export function walkSessionFiles(dir, out = [], depth = 0) {
  if (depth === 0) {
    const now = Date.now();
    const hit = WALK_CACHE.get(dir);
    if (hit && now - hit.at < WALK_TTL_MS) {
      for (const f of hit.files) out.push(f);
      return out;
    }
    const collected = [];
    walkSessionFilesInner(dir, collected, 0);
    WALK_CACHE.set(dir, { at: now, files: collected });
    for (const f of collected) out.push(f);
    return out;
  }
  return walkSessionFilesInner(dir, out, depth);
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
  let cwd = "";
  let threads = 0;
  const seen = new Set();
  for (const file of files) {
    seen.add(file);
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      FILE_SNAP.delete(file);
      continue;
    }
    const ageMs = Math.max(0, now - st.mtimeMs);
    if (ageMs > maxAgeMs && !processOn) continue;
    const prev = FILE_SNAP.get(file);
    let next;
    let fileName = "";
    let fileCwd = "";
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
      next = ageStatus(prev.status, { processOn, ageMs });
      fileName = prev.name;
      fileCwd = prev.cwd;
      if (next !== prev.status) FILE_SNAP.set(file, { ...prev, status: next });
    } else {
      let tail;
      try {
        tail = readTail(file);
      } catch {
        continue;
      }
      const rows = file.endsWith(".json") && !file.endsWith(".jsonl") ? rowsFromUnknown(tail.text) : parseJsonlTail(tail.text, tail.mid);
      next = classifyRows(rows, { processOn, ageMs });
      fileCwd = cwdFull(rows);
      fileName = cwdLabel(rows);
      FILE_SNAP.set(file, { mtimeMs: st.mtimeMs, size: st.size, status: next, name: fileName, cwd: fileCwd });
    }
    if (next === "idle") continue;
    threads += 1;
    status = mergeStatus(status, next);
    if (!cwd) cwd = fileCwd;
    if (!name) name = fileName;
  }
  if (FILE_SNAP.size > 240) {
    for (const key of FILE_SNAP.keys()) {
      if (!seen.has(key)) FILE_SNAP.delete(key);
    }
  }
  if (WALK_CACHE.size > 48) {
    const extra = WALK_CACHE.size - 48;
    const keys = [...WALK_CACHE.keys()].slice(0, extra);
    for (const key of keys) WALK_CACHE.delete(key);
  }
  if (status === "idle" && processOn) {
    status = "running";
    threads = Math.max(threads, 1);
  }
  return {
    status,
    label: statusLabel(status),
    name,
    cwd,
    threads,
    processOn: Boolean(processOn),
    tool: "",
  };
}

const EMPTY = { status: "idle", label: "idle", name: "", cwd: "", threads: 0, processOn: false, tool: "", agents: [] };

export async function readCodexSnapshot({ runCmd, now = Date.now(), home = os.homedir() } = {}) {
  let lines = [];
  if (typeof runCmd === "function") {
    try {
      const out = await runCmd("pgrep", ["-il", "codex|claude|gemini|opencode|goose|aider|copilot|cursor|amp|grok"], 2000);
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
  let best = { ...EMPTY, agents: [] };
  let threads = 0;
  let anyProc = false;
  const agents = [];
  for (const tool of TOOLS) {
    const processOn = live.has(tool.id);
    if (processOn) anyProc = true;
    const files = (tool.roots(home) || []).flatMap((root) => walkSessionFiles(root));
    const snap = snapshotFromFiles(files, { processOn, now });
    if (snap.status === "idle") continue;
    threads += snap.threads;
    const agent = {
      id: tool.id,
      name: tool.name,
      status: snap.status,
      label: snap.label,
      threads: snap.threads,
      cwd: snap.name,
      path: snap.cwd || "",
      processOn: processOn || snap.processOn,
    };
    agents.push(agent);
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
    const agent = {
      id: first?.id || "agents",
      name: first?.name || "Agents",
      status: "running",
      label: "working",
      threads: 1,
      cwd: "",
      path: "",
      processOn: true,
    };
    return {
      status: "running",
      label: "working",
      name: "",
      cwd: "",
      threads: 1,
      processOn: true,
      tool: first?.name || "Agents",
      agents: [agent],
    };
  }
  if (best.status === "idle") return { ...EMPTY };
  return { ...best, threads: Math.max(threads, best.threads), agents };
}
