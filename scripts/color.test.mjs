import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const GROK_BLUE = "#1b56f3";
const CORAL = "#e85d4c";
const WAIT = "#e2a116";
const ERROR = "#e85d4c";
const MOOD_TINT_MAX = 0.28;

function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex(A.r + (B.r - A.r) * u, A.g + (B.g - A.g) * u, A.b + (B.b - A.b) * u);
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hexHue(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b).h;
}

function hueDelta(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function lerpHue(a, b, t) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

function hsvWrapMix(homeHex, moodHex, amount) {
  const home = rgbToHsv(...Object.values(hexToRgb(homeHex)));
  const mood = rgbToHsv(...Object.values(hexToRgb(moodHex)));
  const h = lerpHue(home.h, mood.h, amount);
  return h;
}

function tintedFill(homeHex, moodHex, amount) {
  return mixHex(homeHex, moodHex, Math.min(Math.max(amount, 0), MOOD_TINT_MAX));
}

test("wait/error mood no longer turns a blue home into pink", () => {
  const waitFill = tintedFill(GROK_BLUE, WAIT, 0.64);
  const errorFill = tintedFill(GROK_BLUE, ERROR, 0.7);
  const blueHue = hexHue(GROK_BLUE);
  assert.ok(hueDelta(hexHue(waitFill), blueHue) < 25, waitFill);
  assert.ok(hueDelta(hexHue(errorFill), blueHue) < 25, errorFill);
  assert.notEqual(waitFill.slice(0, 3), "#e8");
  const brokenWaitHue = hsvWrapMix(GROK_BLUE, WAIT, 0.64);
  assert.ok(hueDelta(brokenWaitHue, 330) < 40, "old HSV wrap was magenta/pink");
});

test("preset or wheel hit updates the rendered face fill, not just the wheel UI", () => {
  const color = readFileSync(new URL("../src/lib/grokbot/color.ts", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../src/lib/grokbot/engine.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/lib/grokbot/pet-shell.ts", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../src/lib/grokbot/renderer.ts", import.meta.url), "utf8");
  const bundled = readFileSync(new URL("../mac/grokbot.js", import.meta.url), "utf8");

  assert.match(color, /export const MOOD_TINT_MAX = 0\.28/);
  assert.match(color, /mixHex\(homeHex, moodHex/);
  assert.match(color, /function faceFillHex/);
  assert.equal(color.includes("return mixHsv(home, hexToHsv(moodHex), amount)"), false);

  const setColor = shell.slice(shell.indexOf("function setColor"), shell.indexOf("function setPaused"));
  assert.match(setColor, /engine\.setFaceColor\(hex\)/);
  assert.match(setColor, /writeFaceColor\(hex\)/);
  assert.match(shell, /setColor\(hsvToHex\(hit\.hsv\.h, hit\.hsv\.s, hit\.hsv\.v\)\)/);
  assert.match(shell, /b\.addEventListener\("click", \(\) => setColor\(p\.hex\)\)/);
  assert.match(shell, /COLOR_KEY/);

  assert.match(engine, /this\.snapDisplayColor\(\)/);
  assert.match(engine, /setFaceColor\(c/);
  assert.match(engine, /faceFillHsv\(this\.faceColor/);
  assert.match(renderer, /engine\.displayColor \|\| engine\.faceColor/);
  assert.match(bundled, /snapDisplayColor/);
  assert.match(bundled, /mixHex\(homeHex, moodHex/);

  const coralFill = tintedFill(CORAL, WAIT, 0.64);
  assert.ok(hueDelta(hexHue(coralFill), hexHue(CORAL)) < 25, coralFill);
  const blueFill = tintedFill(GROK_BLUE, WAIT, 0.64);
  assert.ok(hueDelta(hexHue(blueFill), hexHue(GROK_BLUE)) < 25, blueFill);
  assert.notEqual(blueFill.toLowerCase(), coralFill.toLowerCase());
});
