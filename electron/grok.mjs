import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { grokPromptFor, cleanGrokOut } from "./desk-core.mjs";

export { grokPromptFor, cleanGrokOut };

const MODELS = ["grok-4.6", "grok-4-heavy", "grok-4.5"];

export function grokEnv(base = process.env) {
  const home = os.homedir();
  const PATH = [
    base.PATH || "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local/bin"),
    path.join(home, ".grok/bin"),
  ].join(path.delimiter);
  return { ...base, PATH };
}

function candidateBins() {
  const home = os.homedir();
  return [
    path.join(home, ".local/bin/grok"),
    path.join(home, ".grok/bin/grok"),
    "/opt/homebrew/bin/grok",
    "/usr/local/bin/grok",
  ];
}

export async function findGrokBin(runCmd) {
  if (typeof runCmd === "function") {
    const which = String((await runCmd("which", ["grok"], 800)) || "")
      .trim()
      .split(/\n/)[0];
    if (which && fs.existsSync(which)) return which;
  }
  for (const bin of candidateBins()) {
    if (fs.existsSync(bin)) return bin;
  }
  return "";
}

export async function grokStatus(runCmd) {
  const bin = await findGrokBin(runCmd);
  if (bin) return { available: true, source: "cli", bin };
  if (process.env.XAI_API_KEY) return { available: true, source: "api" };
  return { available: false, source: "none" };
}

async function grokApi(prompt) {
  const key = process.env.XAI_API_KEY;
  if (!key) return "";
  for (const model of MODELS) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 60,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) continue;
      const body = await res.json();
      const text = cleanGrokOut(body?.choices?.[0]?.message?.content || "");
      if (text) return text;
    } catch {
      /* next */
    }
  }
  return "";
}

export async function grokBrief(digest, { runCmd } = {}) {
  const prompt = grokPromptFor(digest);
  const bin = await findGrokBin(runCmd);
  if (bin && typeof runCmd === "function") {
    const out = await runCmd(bin, ["-p", prompt], 28_000);
    const text = cleanGrokOut(out);
    if (text) return { ok: true, text, source: "cli" };
  }
  const api = await grokApi(prompt);
  if (api) return { ok: true, text: api, source: "api" };
  return { ok: false, text: String(digest || "All quiet."), source: "local" };
}
