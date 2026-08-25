import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const GROK_BOT_APP = "Grok Bot";

const WAIT_WIN =
  /allow once|always allow|approve|approval|take control|needs you|waiting for you|review this|confirm|takeover/i;

const SKIP_FILE = /^(auth|settings|config|credentials|token|secret|keystore|lock|inbox|pet-pos|pet-prefs|nudge)/i;

export function isGrokBotSessionFile(name) {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  if (SKIP_FILE.test(base)) return false;
  return base.endsWith(".json") || base.endsWith(".jsonl");
}

export function isGrokBotProcess(line) {
  const n = String(line || "").toLowerCase();
  if (!n.trim() || n.includes("grokbot")) return false;
  return n.includes("grok bot") || /(?:^|\s)grok-bot(?:\s|$)/.test(n);
}

export function grokBotWaitingFromWindows(text) {
  return String(text || "")
    .split(/[\n,]+/)
    .some((w) => WAIT_WIN.test(w.trim()));
}

export function grokBotSupportRoots(home = os.homedir()) {
  return [
    path.join(home, "Library", "Application Support", "Grok Bot"),
    path.join(home, "Library", "Application Support", "GrokBot"),
    path.join(home, "Library", "Application Support", "ai.x.grok-bot"),
    path.join(home, "Library", "Logs", "Grok Bot"),
  ];
}

function walkJson(dir, out = [], depth = 0) {
  if (depth > 4) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(p, out, depth + 1);
    else if (ent.isFile() && isGrokBotSessionFile(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

export function statusFromGrokBotFiles(files, { now = Date.now(), maxAgeMs = 30 * 60_000 } = {}) {
  let waiting = false;
  let running = false;
  let name = "";
  for (const file of files) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (now - st.mtimeMs > maxAgeMs) continue;
    let text = "";
    try {
      const start = Math.max(0, st.size - 32_000);
      const buf = Buffer.alloc(st.size - start);
      const fd = fs.openSync(file, "r");
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      text = buf.toString("utf8").toLowerCase();
    } catch {
      continue;
    }
    if (/waiting_for_approval|needs_approval|awaiting_approval|"approval"|take_control|takeover/.test(text)) waiting = true;
    if (/"status"\s*:\s*"(running|in_progress|working|active)"/.test(text) || /"running"\s*:\s*true/.test(text)) running = true;
    if (!name) {
      const m = text.match(/"name"\s*:\s*"([^"]{1,40})"/);
      if (m) name = m[1];
    }
  }
  if (waiting) return { status: "waiting", label: "needs you", name };
  if (running) return { status: "running", label: "working", name };
  return { status: "idle", label: "idle", name };
}

export async function readGrokBotApp({ runCmd, now = Date.now(), home = os.homedir(), windows, skipFiles = false } = {}) {
  let processOn = false;
  if (typeof runCmd === "function") {
    const pg = await runCmd("pgrep", ["-il", "Grok Bot|grok-bot"], 1500);
    processOn = String(pg || "")
      .split(/\n+/)
      .some((line) => isGrokBotProcess(line));
  }

  let winText = windows;
  let windowOk = true;
  if (winText == null && processOn && typeof runCmd === "function") {
    winText = await runCmd(
      "osascript",
      [
        "-e",
        'tell application "System Events"',
        "-e",
        `if not (exists process "${GROK_BOT_APP}") then return ""`,
        "-e",
        `tell process "${GROK_BOT_APP}"`,
        "-e",
        "set nm to name of every window",
        "-e",
        "return nm as text",
        "-e",
        "end tell",
        "-e",
        "end tell",
      ],
      1800,
    );
    if (winText === "" && processOn) {
      const probe = await runCmd(
        "osascript",
        ["-e", `tell application "System Events" to exists process "${GROK_BOT_APP}"`],
        800,
      );
      if (!String(probe).toLowerCase().includes("true")) windowOk = false;
    }
  }
  winText = winText || "";

  const files = skipFiles ? [] : grokBotSupportRoots(home).flatMap((root) => walkJson(root));
  const fromFiles = statusFromGrokBotFiles(files, { now });
  const fromWin = grokBotWaitingFromWindows(winText);

  let status = "idle";
  let label = "idle";
  if (fromWin || fromFiles.status === "waiting") {
    status = "waiting";
    label = "needs you";
  } else if (processOn || fromFiles.status === "running") {
    status = "running";
    label = "working";
  }

  return {
    id: "grok-bot",
    name: GROK_BOT_APP,
    status,
    label,
    threads: status === "idle" ? 0 : 1,
    cwd: fromFiles.name || "",
    path: "",
    processOn,
    windowOk,
  };
}
