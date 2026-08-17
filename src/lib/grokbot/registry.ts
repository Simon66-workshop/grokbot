import type { GrokBotEngine } from "./engine";

let current: GrokBotEngine | null = null;

export function registerEngine(engine: GrokBotEngine | null) {
  current = engine;
}

export function getEngine() {
  return current;
}
