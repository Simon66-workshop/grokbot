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

export function parsePermProbe(calendarOut, eventsOut, grokBotOut, { grokBotRunning = false } = {}) {
  const calendar = String(calendarOut || "").trim() === "1";
  const automation = String(eventsOut || "").trim() === "1";
  let grokBot = true;
  if (grokBotRunning) {
    const t = String(grokBotOut || "").trim().toLowerCase();
    grokBot = t === "1" || t === "true";
  }
  const missing = [];
  if (!calendar) missing.push({ id: "calendar", label: "Allow Calendar" });
  if (!automation) missing.push({ id: "automation", label: "Allow Automation" });
  if (grokBotRunning && !grokBot) missing.push({ id: "grok-bot", label: "Allow Grok Bot" });
  return { calendar, automation, grokBot, missing };
}

export async function probePerms(runCmd, { grokBotRunning = false } = {}) {
  if (typeof runCmd !== "function") {
    return { calendar: true, automation: true, grokBot: true, missing: [] };
  }
  const calendarOut = await runCmd(
    "osascript",
    ["-e", 'tell application "Calendar" to if (count of calendars) > 0 then return "1" else return "1"'],
    2500,
  );
  const eventsOut = await runCmd(
    "osascript",
    ["-e", 'tell application "System Events" to if (count of processes) > 0 then return "1" else return "0"'],
    1500,
  );
  let grokBotOut = "1";
  if (grokBotRunning) {
    grokBotOut = await runCmd(
      "osascript",
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
