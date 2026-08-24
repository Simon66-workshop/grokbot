import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const face = page.locator("#face");
await face.click({ position: { x: 120, y: 120 } });
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/desk-open.png" });

const ui = await page.evaluate(() => {
  const labels = [...document.querySelectorAll(".bar button")].map((b) => b.textContent);
  const agents = [...document.querySelectorAll("#agents button")].map((b) => b.textContent);
  const whisper = document.querySelector("#whisper")?.textContent || "";
  const desk = [...document.querySelectorAll("#desk .chip")].map((b) => b.textContent);
  const actions = [...document.querySelectorAll("#actions button")].map((b) => b.textContent);
  return {
    labels,
    agents,
    whisper,
    desk,
    actions,
    dockOpen: document.querySelector(".grok-stage")?.classList.contains("open"),
  };
});

await page.getByRole("button", { name: "Focus" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/desk-focus.png" });

const afterFocus = await page.evaluate(() => ({
  pomo: document.querySelector("[data-pref=pomo]")?.textContent,
  whisper: document.querySelector("#whisper")?.textContent || "",
}));

await page.getByRole("button", { name: "Brief" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/desk-brief.png" });

console.log(JSON.stringify({ errors, ui, afterFocus }, null, 2));
await browser.close();
if (errors.length) process.exit(2);
if (!ui.dockOpen) process.exit(3);
if (ui.actions.length !== 9) process.exit(4);
if (!ui.labels.includes("Focus") || !ui.labels.includes("Brief")) process.exit(5);
if (!ui.agents.length) process.exit(6);
