import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = join(root, "scripts", ".desk-qa-shots");
const PREVIEW = "http://127.0.0.1:8080/";

await mkdir(shotDir, { recursive: true });

async function previewUp() {
  try {
    const res = await fetch(PREVIEW, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stopChild(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function ensurePreview() {
  if (await previewUp()) return () => {};
  const child = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "ignore",
    detached: true,
  });
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (await previewUp()) {
      return () => stopChild(child);
    }
    if (child.exitCode != null) {
      throw new Error(`vite exited ${child.exitCode} before 8080 was ready`);
    }
    await sleep(250);
  }
  stopChild(child);
  throw new Error("vite did not become ready on 127.0.0.1:8080");
}

const stopPreview = await ensurePreview();
let browser;
try {
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(PREVIEW, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const face = page.locator("#face");
  await face.click({ position: { x: 120, y: 120 } });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(shotDir, "desk-open.png") });

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
  await page.screenshot({ path: join(shotDir, "desk-focus.png") });

  const afterFocus = await page.evaluate(() => ({
    pomo: document.querySelector("[data-pref=pomo]")?.textContent,
    whisper: document.querySelector("#whisper")?.textContent || "",
  }));

  await page.getByRole("button", { name: "Brief" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shotDir, "desk-brief.png") });

  console.log(JSON.stringify({ errors, ui, afterFocus }, null, 2));
  if (errors.length) process.exitCode = 2;
  else if (!ui.dockOpen) process.exitCode = 3;
  else if (ui.actions.length !== 9) process.exitCode = 4;
  else if (!ui.labels.includes("Focus") || !ui.labels.includes("Brief")) process.exitCode = 5;
  else if (!ui.agents.length) process.exitCode = 6;
} finally {
  if (browser) await browser.close();
  stopPreview();
}
