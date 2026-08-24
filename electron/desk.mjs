import fs from "node:fs";
import path from "node:path";
import { appIsWork, composeDigest, parseGitStatus, EMPTY_DESK } from "./desk-core.mjs";
import { TOOLS } from "./codex.mjs";

import { grokBotWaitingFromWindows } from "./grok-bot-app.mjs";
import { parseMacScene } from "./nudge.mjs";

export { composeDigest, parseGitStatus, appIsWork, EMPTY_DESK, parseMacScene };

export const MAC_SCENE_SCRIPT = `tell application "System Events"
  set frontName to name of first application process whose frontmost is true
  set appNames to name of every process whose background only is false
  set botWins to ""
  try
    if exists process "Grok Bot" then
      tell process "Grok Bot" to set botWins to (name of every window) as text
    end if
  end try
  return frontName & linefeed & "GROKWIN" & linefeed & botWins & linefeed & "APPS" & linefeed & appNames
end tell`;

export async function detectMacScene(runCmd) {
  if (typeof runCmd !== "function" || process.platform !== "darwin") {
    return { focus: { app: "", workish: false }, meetingApp: false, grokBotWindows: "" };
  }
  const out = await runCmd("osascript", ["-e", MAC_SCENE_SCRIPT], 2200);
  const parsed = parseMacScene(out);
  return {
    focus: { app: parsed.front, workish: appIsWork(parsed.front) },
    meetingApp: parsed.meetingApp,
    grokBotWindows: parsed.grokBotWindows,
    grokBotWaiting: grokBotWaitingFromWindows(parsed.grokBotWindows),
  };
}

function parseMeetingOut(raw) {
  const text = String(raw || "").trim();
  if (!text) return { on: false, next: null, probed: false };
  const [flag, mins, ...rest] = text.split("\t");
  const on = flag === "1";
  const minutes = Number(mins);
  const title = rest.join("\t").replace(/\s+/g, " ").trim().slice(0, 48);
  const next = Number.isFinite(minutes) && minutes >= 0 && title ? { title, minutes: Math.round(minutes) } : null;
  return { on, next, probed: true };
}

const MEETING_SCRIPT = `
set nowDate to current date
set soon to nowDate + 12 * hours
set busyFlag to "0"
set soonMin to -1
set soonName to ""
tell application "Calendar"
  repeat with cal in calendars
    try
      set live to (every event of cal whose start date ≤ nowDate and end date ≥ nowDate)
      if (count of live) > 0 then set busyFlag to "1"
    end try
    try
      set upcoming to (every event of cal whose start date > nowDate and start date < soon)
      repeat with ev in upcoming
        set delta to ((start date of ev) - nowDate) / 60
        if soonMin < 0 or delta < soonMin then
          set soonMin to delta
          set soonName to summary of ev
        end if
      end repeat
    end try
  end repeat
end tell
return busyFlag & tab & (soonMin as integer) & tab & soonName
`;

export async function detectMeetingState(runCmd) {
  if (typeof runCmd !== "function") return { on: false, next: null };
  const out = await runCmd("osascript", ["-e", MEETING_SCRIPT], 3500);
  return parseMeetingOut(out);
}

export { parseMeetingOut };

function readTests(repo) {
  const file = path.join(repo, "test-results", ".last-run.json");
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    const s = String(j.status || "").toLowerCase();
    if (s === "failed" || s === "timedout" || s === "timedOut") return "fail";
    if (s === "passed") return "pass";
  } catch {
    /* ignore */
  }
  return "unknown";
}

export async function scanGit(cwds, runCmd, { max = 4 } = {}) {
  if (typeof runCmd !== "function") return [];
  const seen = new Set();
  const out = [];
  for (const raw of cwds || []) {
    const dir = String(raw || "").trim();
    if (!dir || seen.has(dir) || !fs.existsSync(dir)) continue;
    seen.add(dir);
    const text = await runCmd("git", ["-C", dir, "status", "--porcelain=v1", "-b"], 2500);
    if (!text || text.startsWith("fatal")) continue;
    const parsed = parseGitStatus(text);
    if (!parsed.branch && parsed.dirty === 0) continue;
    out.push({
      repo: path.basename(dir),
      branch: parsed.branch,
      dirty: parsed.dirty,
      ahead: parsed.ahead,
      behind: parsed.behind,
      tests: readTests(dir),
    });
    if (out.length >= max) break;
  }
  return out;
}

export async function openAgent(id, { runExec, cwd } = {}) {
  if (typeof runExec !== "function") return false;
  const tool = TOOLS.find((t) => t.id === id);
  const apps = tool?.apps || ["Terminal"];
  const folder = cwd && fs.existsSync(cwd) ? cwd : "";
  for (const app of apps) {
    const args = folder ? ["-a", app, folder] : ["-a", app];
    const res = await runExec("open", args, 2500);
    if (res?.ok) return true;
  }
  if (folder) {
    const res = await runExec("open", [folder], 2000);
    return Boolean(res?.ok);
  }
  return false;
}

export async function detectFrontApp(runCmd) {
  const scene = await detectMacScene(runCmd);
  return scene.focus;
}

export function buildDesk({ agents = [], meeting, focus, git = [], pomo, grok, perms, quiet = false }) {
  const snap = {
    agents,
    meeting: meeting || EMPTY_DESK.meeting,
    focus: focus || EMPTY_DESK.focus,
    git,
    pomo: pomo || EMPTY_DESK.pomo,
    grok: grok || EMPTY_DESK.grok,
    perms: perms || EMPTY_DESK.perms,
    quiet: Boolean(quiet),
  };
  return {
    ...EMPTY_DESK,
    ...snap,
    digest: composeDigest(snap),
  };
}
