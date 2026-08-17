# GrokBot

A living Grok Bot icon drawn entirely in code. The face is a circle with two
white oval eyes. Expressions, shapes, and states morph through springs — not
image swaps.

## What’s in here

| Path | Role |
| --- | --- |
| `src/lib/grokbot/` | Engine, expressions, renderer, demo tour |
| `src/components/grokbot/GrokBotCanvas.tsx` | Canvas host (pointer, RAF) |
| `src/components/desktop/Desktop.tsx` | Transparent desktop companion |
| `src/components/atelier/Atelier.tsx` | Expression / state laboratory |

Rest pose: chubby ovals, 11° tilt, centers at `(-10, -15)` and `(50, -13)`
in a 200-unit face (`FACE_R = 100`).

## Run

```bash
npm install
npm run dev
```

- `/` — transparent companion (drag, hover moods, follows pointer)
- `/atelier` — studio with 25 expressions and state machine

## Use the component

```tsx
import { GrokBotCanvas } from "@/components/grokbot/GrokBotCanvas";
import { getEngine } from "@/lib/grokbot/registry";

<GrokBotCanvas followGlobal faceScale={0.36} />

getEngine()?.blink();
getEngine()?.play("look");
getEngine()?.setExpression(5); // Joy
```

The whole mark is canvas + springs. No sprite sheets.

## License

Personal / prototype. Grok identity belongs to xAI.
