export const PERM_PANES = {
  calendar: [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Calendars",
  ],
  automation: [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Automation",
  ],
  notifications: [
    "x-apple.systempreferences:com.apple.preference.notifications",
    "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
  ],
};

export const PERM_LABELS = {
  calendar: "Allow Calendar",
  automation: "Allow Automation",
  "grok-bot": "Allow Grok Bot",
};

const DENIED_RE =
  /not authori[sz]ed|not allowed to send apple events|osascript is not allowed|-1743|-25211|errsecinternalcomponent/i;
const TIMEOUT_RE = /^(timeout|timed ?out|etimedout)$/i;

const GRANTED = "granted";
const DENIED = "denied";
const UNKNOWN = "unknown";

export function unwrapPermCmd(result) {
  if (result == null) return "";
  if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (typeof result === "object") {
    if (result.timedOut) return "timeout";
    const out = String(result.out ?? result.stdout ?? "").trim();
    if (out) return out;
    return String(result.err ?? result.stderr ?? "").trim();
  }
  return "";
}

export function classifyPermOut(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return UNKNOWN;
  if (TIMEOUT_RE.test(t)) return UNKNOWN;
  const lower = t.toLowerCase();
  if (lower === "1" || lower === "true") return GRANTED;
  if (lower === "0" || lower === "false") return DENIED;
  if (DENIED_RE.test(t)) return DENIED;
  return UNKNOWN;
}

function chip(id) {
  return { id, label: PERM_LABELS[id] };
}

function finalizePerms({ calendarState, automationState, grokBotState, grokBotRunning = false }) {
  const calendar = calendarState === GRANTED;
  const automation = automationState === GRANTED;
  const grokBot = grokBotState === GRANTED;
  const missing = [];
  if (calendarState === DENIED) missing.push(chip("calendar"));
  if (automationState === DENIED) missing.push(chip("automation"));
  if (grokBotRunning && grokBotState === DENIED) missing.push(chip("grok-bot"));
  return {
    calendar,
    automation,
    grokBot,
    missing,
    states: {
      calendar: calendarState,
      automation: automationState,
      grokBot: grokBotState,
    },
  };
}

function stateOf(next, key, fallbackBool) {
  const fromStates = next?.states?.[key];
  if (fromStates === GRANTED || fromStates === DENIED || fromStates === UNKNOWN) return fromStates;
  if (fallbackBool === true) return GRANTED;
  return UNKNOWN;
}

export function parsePermProbe(calendarOut, eventsOut, grokBotOut, { grokBotRunning = false } = {}) {
  return finalizePerms({
    calendarState: classifyPermOut(calendarOut),
    automationState: classifyPermOut(eventsOut),
    grokBotState: grokBotRunning ? classifyPermOut(grokBotOut) : GRANTED,
    grokBotRunning,
  });
}

export function resolvePerms(next, { previous, dismissed } = {}) {
  const src = next || {};
  const dismissedSet = dismissed instanceof Set ? dismissed : new Set(dismissed || []);
  const prevStates = previous?.states || {};

  const inherit = (key, state) => {
    if (state === GRANTED || state === DENIED) return state;
    if (previous?.[key] === true || prevStates[key] === GRANTED) return GRANTED;
    return UNKNOWN;
  };

  const calendarState = inherit("calendar", stateOf(src, "calendar", src.calendar));
  const automationState = inherit("automation", stateOf(src, "automation", src.automation));
  const grokBotState = inherit("grokBot", stateOf(src, "grokBot", src.grokBot));
  const grokBotRunning = grokBotState === DENIED || Boolean(src.missing?.some((m) => m.id === "grok-bot"));

  const resolved = finalizePerms({
    calendarState,
    automationState,
    grokBotState,
    grokBotRunning,
  });
  resolved.missing = resolved.missing.filter((m) => !dismissedSet.has(m.id));
  return resolved;
}

async function readProbe(runCmd, args, timeout) {
  return unwrapPermCmd(await runCmd("osascript", args, timeout));
}

export async function probePerms(
  runCmd,
  { grokBotRunning = false, sceneOk = false, calendarProbed = false, force = false } = {},
) {
  if (typeof runCmd !== "function") {
    return parsePermProbe("1", "1", "1", { grokBotRunning });
  }
  if (process.platform !== "darwin" && !force) {
    return parsePermProbe("1", "1", "1", { grokBotRunning });
  }

  const eventsOut = sceneOk
    ? "1"
    : await readProbe(
        runCmd,
        ["-e", 'tell application "System Events" to if (count of processes) > 0 then return "1" else return "0"'],
        1500,
      );
  const automationState = classifyPermOut(eventsOut);

  let calendarOut = "";
  if (calendarProbed) {
    calendarOut = "1";
  } else if (automationState === GRANTED) {
    const running = await readProbe(
      runCmd,
      ["-e", 'tell application "System Events" to if exists process "Calendar" then return "1" else return ""'],
      1200,
    );
    if (classifyPermOut(running) === GRANTED) {
      calendarOut = await readProbe(runCmd, ["-e", 'tell application "Calendar" to return "1"'], 2000);
    } else {
      calendarOut = running;
    }
  }

  let grokBotOut = "1";
  if (grokBotRunning) {
    grokBotOut = await readProbe(
      runCmd,
      [
        "-e",
        'tell application "System Events"',
        "-e",
        'if exists process "Grok Bot" then return "1"',
        "-e",
        'return "0"',
        "-e",
        "end tell",
      ],
      1500,
    );
  }

  return parsePermProbe(calendarOut, eventsOut, grokBotOut, { grokBotRunning });
}

export async function openPerm(id, { runExec, runCmd } = {}) {
  if (id === "grok-bot") {
    if (typeof runExec === "function") await runExec("open", ["-a", "Grok Bot"], 2500);
    if (typeof runCmd === "function") {
      await runCmd(
        "osascript",
        ["-e", 'tell application "System Events" to exists process "Grok Bot"'],
        1500,
      );
    }
    return;
  }
  const panes = PERM_PANES[id] || PERM_PANES.automation;
  if (typeof runExec === "function") {
    for (const url of panes) {
      const r = await runExec("open", [url], 2000);
      if (r?.ok) break;
    }
  }
  if (id === "calendar" && typeof runCmd === "function") {
    await runCmd("osascript", ["-e", 'tell application "Calendar" to get name of first calendar'], 2000);
  }
  if (id === "automation" && typeof runCmd === "function") {
    await runCmd("osascript", ["-e", 'tell application "System Events" to get name of first process'], 1500);
  }
}
