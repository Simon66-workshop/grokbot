import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { grokBotSupportRoots } from "../electron/grok-bot-app.mjs";
import { TOOLS } from "../electron/codex.mjs";
import {
  applyPetUserData,
  CHAT_CLIENT_APPDATA,
  companionIndex,
  PET_APPDATA,
  petUserDataPath,
} from "../electron/pet-paths.mjs";
import {
  ballRadius,
  cursorOverBall,
  dragWasMove,
  packagedChromiumSwitches,
  shouldArmDrag,
  shouldIgnoreMouse,
} from "../electron/pet-input.mjs";

test("packaged userData is GrokBot, not the chat client or Electron", () => {
  const appData = "/Users/mini/Library/Application Support";
  const dest = petUserDataPath({ packaged: true, appData });
  assert.equal(dest, path.join(appData, "GrokBot"));
  assert.notEqual(path.basename(dest), "Grok Bot");
  assert.notEqual(path.basename(dest), "Electron");
  assert.equal(petUserDataPath({ packaged: false, appData }), null);
  assert.equal(PET_APPDATA, "GrokBot");
  assert.equal(CHAT_CLIENT_APPDATA, "Grok Bot");
  assert.notEqual(PET_APPDATA, CHAT_CLIENT_APPDATA);
});

test("applyPetUserData pins packaged name and leaves Electron-dev alone", () => {
  const calls = [];
  const dev = {
    isPackaged: false,
    getPath: (n) => (n === "userData" ? "/tmp/Electron" : "/tmp"),
    setName: (n) => calls.push(["setName", n]),
    setPath: (n, v) => calls.push(["setPath", n, v]),
  };
  assert.equal(applyPetUserData(dev), "/tmp/Electron");
  assert.deepEqual(calls, []);

  const pkg = {
    isPackaged: true,
    getPath: (n) => (n === "appData" ? "/tmp/Application Support" : "/tmp/wrong"),
    setName: (n) => calls.push(["setName", n]),
    setPath: (n, v) => calls.push(["setPath", n, v]),
  };
  assert.equal(applyPetUserData(pkg), path.join("/tmp/Application Support", "GrokBot"));
  assert.deepEqual(calls, [
    ["setName", "GrokBot"],
    ["setPath", "userData", path.join("/tmp/Application Support", "GrokBot")],
  ]);
});

test("chat-client file walk does not include the pet userData folder", () => {
  const roots = grokBotSupportRoots("/Users/mini");
  assert.ok(roots.some((r) => r.endsWith(`${path.sep}Grok Bot`)));
  assert.equal(
    roots.some((r) => r.endsWith(`${path.sep}GrokBot`) || r.includes(`${path.sep}GrokBot${path.sep}`)),
    false,
  );
  const grokBot = TOOLS.find((t) => t.id === "grok-bot");
  const sessionRoots = grokBot.roots("/Users/mini");
  assert.deepEqual(sessionRoots, [path.join("/Users/mini", "Library", "Application Support", "Grok Bot")]);
});

test("geometry click-through enables the ball without renderer pointerenter", () => {
  const ball = { x: 100, y: 200 };
  assert.equal(cursorOverBall({ x: 104, y: 198 }, ball, 20), true);
  assert.equal(cursorOverBall({ x: 400, y: 200 }, ball, 20), false);
  assert.equal(shouldIgnoreMouse({ overBall: true }), false);
  assert.equal(shouldIgnoreMouse({ overBall: false }), true);
  assert.equal(shouldIgnoreMouse({ overBall: false, dockOpen: true }), false);
  assert.equal(shouldIgnoreMouse({ overBall: false, overlayOn: true }), false);
  assert.equal(shouldIgnoreMouse({ overBall: false, rendererWantsClicks: true }), false);
  assert.equal(shouldIgnoreMouse({ overBall: false, dragging: true }), false);
  assert.ok(ballRadius(440, 0.24) > 100);
});

test("a press under 6px is a tap; the window must not start following", () => {
  assert.equal(shouldArmDrag(0), false);
  assert.equal(shouldArmDrag(5.9), false);
  assert.equal(shouldArmDrag(6), true);
  assert.equal(dragWasMove({ armed: false, travel: 2 }), false);
  assert.equal(dragWasMove({ armed: true, travel: 2 }), true);
  assert.equal(dragWasMove({ armed: false, travel: 12 }), true);
});

test("packaged Chromium flags only disable occlusion backgrounding", () => {
  const flags = packagedChromiumSwitches();
  assert.deepEqual(flags, ["disable-backgrounding-occluded-windows", "disable-renderer-backgrounding"]);
  assert.equal(flags.some((f) => /gpu|vsync|hardware/i.test(f)), false);
});

test("main process owns click-through; companion index stays next to the bundle", () => {
  const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(main, /applyClickThrough/);
  assert.match(main, /shouldIgnoreMouse/);
  assert.match(main, /applyPetUserData/);
  assert.match(main, /companionIndex/);
  assert.equal(main.includes("w.setIgnoreMouseEvents(Boolean(ignore), { forward: true })"), false);
  assert.match(main, /if \(drag\) return;/);
  assert.ok(companionIndex("/app/electron").endsWith(`${path.sep}mac${path.sep}index.html`));
});

test("control dock still never auto-opens; overlay IPC is explicit", () => {
  const shell = readFileSync(new URL("../src/lib/grokbot/pet-shell.ts", import.meta.url), "utf8");
  const bundled = readFileSync(new URL("../mac/grokbot.js", import.meta.url), "utf8");
  assert.equal(shell.includes("showDock(true)"), false);
  assert.equal(bundled.includes("showDock(true)"), false);
  assert.match(shell, /setDock\?\.\(open\)/);
  assert.match(shell, /setOverlay\?\.\(on\)/);
  assert.match(bundled, /setDock/);
  assert.match(bundled, /setOverlay/);
});

test("app icon meets electron-builder 26 mac minimum of 512", () => {
  const png = readFileSync(new URL("../assets/icon.png", import.meta.url));
  assert.equal(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.ok(width >= 512, `icon width ${width} < 512`);
  assert.ok(height >= 512, `icon height ${height} < 512`);
  const yml = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8");
  assert.match(yml, /^ {2}icon: assets\/icon\.png$/m);
});
