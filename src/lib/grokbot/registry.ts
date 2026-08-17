import type { GrokBotEngine } from "./engine";

const stack: GrokBotEngine[] = [];

export function registerEngine(engine: GrokBotEngine | null) {
  if (engine) stack.push(engine);
  else stack.pop();
}

export function getEngine() {
  return stack[stack.length - 1] ?? null;
}
