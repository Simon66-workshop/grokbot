import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { GrokBotCanvas } from "@/components/grokbot/GrokBotCanvas";
import { ColorWheel } from "@/components/grokbot/ColorWheel";
import { getEngine } from "@/lib/grokbot/registry";
import { useAtelier } from "@/lib/grokbot/store";
import { GROK_BLUE } from "@/lib/grokbot/color";
import { cn } from "@/lib/utils";

const POS_KEY = "grok-companion-pos";
const COLOR_KEY = "grok-face-color";

const MOODS: { label: string; run: () => void }[] = [
  {
    label: "Idle",
    run: () => {
      getEngine()?.reset();
      useAtelier.getState().set({ expression: 0, state: "idle", shape: "circle" });
    },
  },
  { label: "Blink", run: () => getEngine()?.blink() },
  {
    label: "Look",
    run: () => {
      useAtelier.getState().set({ state: "look" });
      getEngine()?.play("look");
    },
  },
  {
    label: "Joy",
    run: () => {
      useAtelier.getState().set({ expression: 5 });
      getEngine()?.setExpression(5);
    },
  },
  {
    label: "Think",
    run: () => {
      useAtelier.getState().set({ state: "loading" });
      getEngine()?.play("loading");
    },
  },
  {
    label: "Wow",
    run: () => {
      useAtelier.getState().set({ state: "exclaim" });
      getEngine()?.play("exclaim");
    },
  },
  {
    label: "Orbit",
    run: () => {
      useAtelier.getState().set({ state: "orbits" });
      getEngine()?.play("orbits");
    },
  },
  {
    label: "Bounce",
    run: () => {
      useAtelier.getState().set({ state: "bounce", expression: 5 });
      getEngine()?.play("bounce");
    },
  },
  { label: "Tour", run: () => getEngine()?.playDemo() },
];

function clampPos(x: number, y: number, w: number, h: number) {
  return {
    x: Math.min(window.innerWidth - 96, Math.max(-40, x)),
    y: Math.min(window.innerHeight - 96, Math.max(-16, y)),
  };
}

function isPet() {
  return typeof window !== "undefined" && Boolean(window.pet?.isPet);
}

export function Desktop() {
  const [open, setOpen] = useState(false);
  const faceColor = useAtelier((s) => s.faceColor);
  const widget = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const last = useRef({ x: 0, y: 0, t: 0 });
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  const applyPos = () => {
    const el = widget.current;
    if (!el || isPet()) return;
    el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
  };

  const savePos = () => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos.current));
    } catch {
      /* ignore */
    }
  };

  const setColor = (hex: string) => {
    useAtelier.getState().set({ faceColor: hex });
    try {
      localStorage.setItem(COLOR_KEY, hex);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.dataset.companion = "";
    try {
      const saved = localStorage.getItem(COLOR_KEY);
      if (saved) useAtelier.getState().set({ faceColor: saved });
    } catch {
      /* ignore */
    }
    return () => {
      delete document.documentElement.dataset.companion;
    };
  }, []);

  useEffect(() => {
    if (isPet()) return;
    const el = widget.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 360;
    let placed = false;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          pos.current = clampPos(p.x, p.y, w, h);
          placed = true;
        }
      }
    } catch {
      /* ignore */
    }
    if (!placed) {
      pos.current = {
        x: Math.max(8, (window.innerWidth - w) / 2),
        y: Math.max(8, (window.innerHeight - h) / 2 - 12),
      };
    }
    applyPos();

    const onResize = () => {
      const box = widget.current;
      pos.current = clampPos(
        pos.current.x,
        pos.current.y,
        box?.offsetWidth ?? w,
        box?.offsetHeight ?? h,
      );
      applyPos();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isPet()) return;
    let raf = 0;
    const step = () => {
      if (!drag.current && (Math.abs(vel.current.x) > 0.12 || Math.abs(vel.current.y) > 0.12)) {
        const el = widget.current;
        const w = el?.offsetWidth ?? 360;
        const h = el?.offsetHeight ?? 360;
        let { x, y } = pos.current;
        x += vel.current.x;
        y += vel.current.y;
        const next = clampPos(x, y, w, h);
        if (next.x !== x) vel.current.x *= -0.52;
        if (next.y !== y) vel.current.y *= -0.52;
        pos.current = next;
        vel.current.x *= 0.9;
        vel.current.y *= 0.9;
        applyPos();
        if (Math.abs(vel.current.x) <= 0.12 && Math.abs(vel.current.y) <= 0.12) {
          vel.current = { x: 0, y: 0 };
          savePos();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDragStart = (e: React.PointerEvent) => {
    vel.current = { x: 0, y: 0 };
    last.current = { x: e.screenX, y: e.screenY, t: performance.now() };
    drag.current = {
      dx: isPet() ? e.screenX : e.clientX - pos.current.x,
      dy: isPet() ? e.screenY : e.clientY - pos.current.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const pet = isPet();
    const nx = pet ? e.screenX : e.clientX - drag.current.dx;
    const ny = pet ? e.screenY : e.clientY - drag.current.dy;
    const dist = pet
      ? Math.hypot(e.screenX - drag.current.dx, e.screenY - drag.current.dy)
      : Math.hypot(nx - pos.current.x, ny - pos.current.y);
    if (dist > 3) drag.current.moved = true;
    const now = performance.now();
    const dt = Math.max(8, now - last.current.t);
    vel.current = {
      x: ((e.screenX - last.current.x) / dt) * 16,
      y: ((e.screenY - last.current.y) / dt) * 16,
    };
    const prevX = last.current.x;
    const prevY = last.current.y;
    last.current = { x: e.screenX, y: e.screenY, t: now };
    if (pet) {
      window.pet?.moveBy(e.screenX - prevX, e.screenY - prevY);
    } else {
      const el = widget.current;
      pos.current = clampPos(nx, ny, el?.offsetWidth ?? 360, el?.offsetHeight ?? 360);
      applyPos();
    }
  };

  const onDragEnd = () => {
    if (drag.current && !drag.current.moved) {
      getEngine()?.blink();
      setOpen((v) => !v);
      vel.current = { x: 0, y: 0 };
    } else if (!isPet()) {
      vel.current.x = Math.max(-38, Math.min(38, vel.current.x));
      vel.current.y = Math.max(-38, Math.min(38, vel.current.y));
    }
    drag.current = null;
    savePos();
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-transparent">
      <div
        ref={widget}
        className={cn(
          "z-20 w-[min(420px,86vw)] will-change-transform",
          isPet() ? "relative mx-auto" : "absolute top-0 left-0",
        )}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        <div
          className="cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDrag}
          onPointerUp={onDragEnd}
        >
          <GrokBotCanvas followGlobal faceScale={0.36} className="w-full" />
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-3 px-2 transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <ColorWheel value={faceColor || GROK_BLUE} onChange={setColor} />
          <div className="flex flex-wrap justify-center gap-1">
            {MOODS.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={m.run}
                className="rounded-full bg-ink/55 px-2.5 py-1 text-[11px] font-medium text-paper backdrop-blur-sm hover:bg-ink/70"
              >
                {m.label}
              </button>
            ))}
          </div>
          {!isPet() && (
            <Link
              to="/atelier"
              className="rounded-full bg-ink/40 px-2.5 py-1 text-[11px] text-paper/85 backdrop-blur-sm hover:bg-ink/60"
            >
              Studio
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
