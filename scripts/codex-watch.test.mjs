import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyRows,
  parseJsonlTail,
  payloadType,
  processLooksLikeCodex,
  snapshotFromFiles,
  statusLabel,
  notifyCopy,
  mergeStatus,
  ageStatus,
} from "../electron/codex.mjs";

test("payloadType reads event_msg.payload.type", () => {
  assert.equal(payloadType({ type: "event_msg", payload: { type: "task_complete" } }), "task_complete");
  assert.equal(payloadType({ type: "session_meta", payload: { cwd: "/x" } }), "session_meta");
});

test("classifyRows: tool activity is running", () => {
  const rows = [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "exec_command_begin" } },
  ];
  assert.equal(classifyRows(rows, { processOn: true, ageMs: 1000 }), "running");
});

test("classifyRows: task_complete with process is waiting", () => {
  const rows = [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "agent_message", message: "done" } },
    { type: "event_msg", payload: { type: "task_complete" } },
  ];
  assert.equal(classifyRows(rows, { processOn: true, ageMs: 1000 }), "waiting");
  assert.equal(classifyRows(rows, { processOn: false, ageMs: 1000 }), "done");
  assert.equal(classifyRows(rows, { processOn: false, ageMs: 20 * 60_000 }), "idle");
});

test("ageStatus expires cached done without a file write", () => {
  assert.equal(ageStatus("done", { processOn: false, ageMs: 1000 }), "done");
  assert.equal(ageStatus("done", { processOn: false, ageMs: 20 * 60_000 }), "idle");
  assert.equal(ageStatus("done", { processOn: true, ageMs: 20 * 60_000 }), "waiting");
  assert.equal(ageStatus("running", { processOn: false, ageMs: 120_000 }), "waiting");
});


test("classifyRows: error wins", () => {
  const rows = [
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "error" } },
  ];
  assert.equal(classifyRows(rows, { processOn: true }), "error");
});

test("parseJsonlTail skips a torn first line", () => {
  const text = `plete"}}\n{"type":"event_msg","payload":{"type":"task_complete"}}\n`;
  const rows = parseJsonlTail(text, true);
  assert.equal(rows.length, 1);
  assert.equal(payloadType(rows[0]), "task_complete");
});

test("processLooksLikeCodex ignores this app", () => {
  assert.equal(processLooksLikeCodex("4321 grokbot"), false);
  assert.equal(processLooksLikeCodex("99 Codex"), true);
  assert.equal(processLooksLikeCodex("12 /usr/local/bin/codex"), true);
});

test("mergeStatus prefers waiting over running", () => {
  assert.equal(mergeStatus("running", "waiting"), "waiting");
  assert.equal(mergeStatus("done", "error"), "error");
});

test("snapshotFromFiles reads a fake sessions folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gb-codex-"));
  const file = path.join(dir, "rollout.jsonl");
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ type: "session_meta", payload: { cwd: "/Users/simon/grokbot" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
    ].join("\n") + "\n",
  );
  const snap = snapshotFromFiles([file], { processOn: true, now: Date.now() });
  assert.equal(snap.status, "waiting");
  assert.equal(snap.threads, 1);
  assert.equal(statusLabel(snap.status), "waiting");
  const copy = notifyCopy(snap.status, snap.name, snap.threads);
  assert.equal(copy.title, "Codex is waiting");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("classifyRows: Claude tool_use is running, text reply waits", () => {
  const running = [
    {
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] },
    },
  ];
  const waiting = [
    { type: "user", message: { content: [{ type: "text", text: "hi" }] } },
    { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
  ];
  assert.equal(classifyRows(running, { processOn: true, ageMs: 500 }), "running");
  assert.equal(classifyRows(waiting, { processOn: true, ageMs: 500 }), "waiting");
});

test("notifyCopy uses the tool name", () => {
  const copy = notifyCopy("waiting", "grokbot", 1, "Claude");
  assert.equal(copy.title, "Claude is waiting");
});
