import assert from "node:assert/strict";
import test from "node:test";
import {
  appIsWork,
  cleanGrokOut,
  composeDigest,
  createPomo,
  formatRemain,
  grokPromptFor,
  parseGitStatus,
} from "../electron/desk-core.mjs";
import { parseMeetingOut, buildDesk } from "../electron/desk.mjs";
import { notifyCopy } from "../electron/codex.mjs";
import { grokBotWaitingFromWindows, isGrokBotProcess } from "../electron/grok-bot-app.mjs";
import { parsePermProbe } from "../electron/perms.mjs";
import { bannersQuiet, nextNudge, parseInbox, parseMacScene, parseNudgeUrl, waitKey } from "../electron/nudge.mjs";
import { AGENT_RANK, createGate, createLatch, inWorkHoursHyst, soonHyst, stampMeeting, tickMeeting } from "../electron/hysteresis.mjs";

test("composeDigest: waiting agents beat quiet", () => {
  const text = composeDigest({
    agents: [
      { name: "Claude", status: "waiting", cwd: "grokbot" },
      { name: "Codex", status: "running", cwd: "api" },
    ],
  });
  assert.equal(text, "Claude waiting");
});

test("composeDigest: meeting soon and dirty repo", () => {
  const text = composeDigest({
    meeting: { on: false, next: { title: "Design review", minutes: 12 } },
    git: [{ repo: "grokbot", dirty: 3, tests: "pass" }],
  });
  assert.match(text, /Design review in 12m/);
  assert.match(text, /grokbot dirty/);
});

test("composeDigest: all quiet vs heads down", () => {
  assert.equal(composeDigest({}), "All quiet.");
  assert.equal(composeDigest({ focus: { app: "Cursor", workish: true } }), "Heads down.");
});

test("parseGitStatus reads branch and dirty files", () => {
  const s = parseGitStatus("## main...origin/main [ahead 2, behind 1]\n M a.ts\n?? b.md\n");
  assert.equal(s.branch, "main");
  assert.equal(s.ahead, 2);
  assert.equal(s.behind, 1);
  assert.equal(s.dirty, 2);
});

test("formatRemain pads seconds", () => {
  assert.equal(formatRemain(0), "0:00");
  assert.equal(formatRemain(90_000), "1:30");
});

test("appIsWork matches coding tools, ignores GrokBot", () => {
  assert.equal(appIsWork("Cursor"), true);
  assert.equal(appIsWork("iTerm2"), true);
  assert.equal(appIsWork("Grok Bot"), true);
  assert.equal(appIsWork("GrokBot"), false);
  assert.equal(appIsWork("Safari"), false);
});

test("pomo work then break", () => {
  const p = createPomo({ workMs: 1000, breakMs: 500 });
  const t0 = 1_000_000;
  const started = p.toggle(t0);
  assert.equal(started.phase, "work");
  assert.equal(started.running, true);
  const mid = p.tick(t0 + 400);
  assert.equal(mid.justEnded, null);
  const end = p.tick(t0 + 1000);
  assert.equal(end.justEnded, "work");
  assert.equal(end.phase, "break");
  const done = p.tick(t0 + 1500);
  assert.equal(done.justEnded, "break");
  assert.equal(done.phase, "idle");
});

test("cleanGrokOut strips chatter", () => {
  assert.equal(cleanGrokOut('Thinking...\n"Claude is waiting on grokbot."\n'), "Claude is waiting on grokbot.");
});

test("grokPromptFor stays small", () => {
  const p = grokPromptFor("Claude waiting · Design review in 12m");
  assert.match(p, /Max 12 words/);
  assert.match(p, /Claude waiting/);
});

test("parseMeetingOut reads tab fields", () => {
  const m = parseMeetingOut("0\t12\tDesign review");
  assert.equal(m.on, false);
  assert.equal(m.next?.minutes, 12);
  assert.equal(m.next?.title, "Design review");
});

test("buildDesk stamps a digest", () => {
  const desk = buildDesk({
    agents: [{ name: "Claude", status: "waiting", cwd: "grokbot" }],
    meeting: { on: false, next: null },
  });
  assert.equal(desk.digest, "Claude waiting");
});

test("notifyCopy still names the tool", () => {
  const copy = notifyCopy("waiting", "grokbot", 1, "Claude");
  assert.equal(copy.title, "Claude is waiting");
});

test("Grok Bot process is not this pet", () => {
  assert.equal(isGrokBotProcess("4321 Grok Bot"), true);
  assert.equal(isGrokBotProcess("99 grokbot"), false);
  assert.equal(isGrokBotProcess("12 grok"), false);
});

test("Grok Bot waiting from Allow once window", () => {
  assert.equal(grokBotWaitingFromWindows("Allow once"), true);
  assert.equal(grokBotWaitingFromWindows("Take control"), true);
  assert.equal(grokBotWaitingFromWindows("Chat"), false);
});

test("perm probe marks calendar missing", () => {
  const p = parsePermProbe("", "1", "1", { grokBotRunning: false });
  assert.equal(p.calendar, false);
  assert.equal(p.missing[0].id, "calendar");
});

test("perm probe asks for Grok Bot control when the app is running", () => {
  const p = parsePermProbe("1", "1", "", { grokBotRunning: true });
  assert.equal(p.grokBot, false);
  assert.ok(p.missing.some((m) => m.id === "grok-bot"));
});

test("notifyCopy for Grok Bot approval", () => {
  const copy = notifyCopy("waiting", "", 1, "Grok Bot");
  assert.equal(copy.title, "Grok Bot is waiting");
  assert.match(copy.body, /needs you/);
});

test("parseNudgeUrl reads grokbot scheme", () => {
  const msg = parseNudgeUrl("grokbot://nudge?status=waiting&name=deploy");
  assert.equal(msg.status, "waiting");
  assert.equal(msg.name, "deploy");
});

test("parseInbox reads hook file", () => {
  const msg = parseInbox('{"status":"done","name":"tests","tool":"Grok Bot"}');
  assert.equal(msg.status, "done");
});

test("nextNudge repeats after interval, stops when acked", () => {
  const key = waitKey({ status: "waiting", tool: "Grok Bot", name: "" });
  const first = nextNudge({ status: "waiting", key, now: 1000, lastNudgeAt: 0, ackedKey: "" });
  assert.equal(first.fire, true);
  assert.equal(first.first, true);
  const wait = nextNudge({ status: "waiting", key, now: 2000, lastNudgeAt: 1000, ackedKey: "", interval: 150_000 });
  assert.equal(wait.fire, false);
  const again = nextNudge({ status: "waiting", key, now: 200_000, lastNudgeAt: 1000, ackedKey: "", interval: 150_000 });
  assert.equal(again.fire, true);
  assert.equal(again.first, false);
  const acked = nextNudge({ status: "waiting", key, now: 200_000, lastNudgeAt: 1000, ackedKey: key, interval: 150_000 });
  assert.equal(acked.fire, false);
});

test("bannersQuiet in meeting or focus work", () => {
  assert.equal(bannersQuiet({ meetingOn: true, pomo: { running: false, phase: "idle" } }), true);
  assert.equal(bannersQuiet({ pomo: { running: true, phase: "work" } }), true);
  assert.equal(bannersQuiet({ pomo: { running: true, phase: "break" } }), false);
});

test("parseMacScene splits front app and Grok Bot windows", () => {
  const scene = parseMacScene("Cursor\nGROKWIN\nAllow once\nAPPS\nCursor, Grok Bot, Safari");
  assert.equal(scene.front, "Cursor");
  assert.match(scene.grokBotWindows, /Allow once/);
  assert.equal(scene.meetingApp, false);
});

function lerpHue(a, b, t) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

test("lerpHue takes the short way around", () => {
  assert.ok(Math.abs(lerpHue(350, 10, 0.5) - 0) < 1);
});

test("higher-rank states win", () => {
  const rank = { idle: 0, look: 2, think: 4, exclaim: 5 };
  assert.equal((rank.exclaim >= rank.think), true);
  assert.equal((rank.look >= rank.think), false);
});

test("latch rises immediately and holds on the way down", () => {
  const L = createLatch({ rank: AGENT_RANK, enterMs: 0, exitMs: 1000 });
  assert.equal(L.sample("waiting", 0), "waiting");
  assert.equal(L.sample("idle", 200), "waiting");
  assert.equal(L.sample("idle", 999), "waiting");
  assert.equal(L.sample("idle", 1200), "idle");
});

test("latch does not drop if the high state returns", () => {
  const L = createLatch({ rank: AGENT_RANK, enterMs: 0, exitMs: 1000 });
  L.sample("waiting", 0);
  L.sample("idle", 400);
  assert.equal(L.sample("waiting", 500), "waiting");
  assert.equal(L.sample("idle", 900), "waiting");
});

test("gate needs dwell time to turn on when enterMs is set", () => {
  const g = createGate({ enterMs: 500, exitMs: 800 });
  assert.equal(g.sample(true, 0), false);
  assert.equal(g.sample(true, 400), false);
  assert.equal(g.sample(true, 500), true);
  assert.equal(g.sample(false, 600), true);
  assert.equal(g.sample(false, 1399), true);
  assert.equal(g.sample(false, 1400), false);
});

test("soonHyst hides after 20m, shows at 15m", () => {
  assert.equal(soonHyst(16, false), false);
  assert.equal(soonHyst(15, false), true);
  assert.equal(soonHyst(18, true), true);
  assert.equal(soonHyst(21, true), false);
});

test("work hours stay on a little after 18:00", () => {
  const mon = (h, m) => new Date(2026, 7, 24, h, m); // Monday
  assert.equal(inWorkHoursHyst(mon(8, 59), false), false);
  assert.equal(inWorkHoursHyst(mon(9, 0), false), true);
  assert.equal(inWorkHoursHyst(mon(18, 10), true), true);
  assert.equal(inWorkHoursHyst(mon(18, 10), false), false);
});

test("tickMeeting counts down between calendar polls", () => {
  const stamped = stampMeeting({ on: false, next: { title: "Design review", minutes: 12 } }, 0);
  assert.equal(tickMeeting(stamped, 3 * 60_000).next.minutes, 9);
  const crossed = tickMeeting(stampMeeting({ on: false, next: { title: "Standup", minutes: 16 } }, 0), 60_000);
  assert.equal(crossed.next.minutes, 15);
  assert.equal(soonHyst(crossed.next.minutes, false), true);
});




