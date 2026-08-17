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

const STAGE = { w: 580, h: 600 };
const BALL: Record<string, { x: number; y: number }> = {
  bottom: { x: 290, y: 220 },
  top: { x: 290, y: 380 },
  right: { x: 160, y: 300 },
  left: { x: 420, y: 300 },
};

function pickSide(bx: number, by: number) {
  const l = bx;
  const r = window.innerWidth - bx;
  const t = by;
  const b = window.innerHeight - by;
  const edge = 130;
  if (b < edge && b <= t) return "top";
  if (t < edge && t < b) return "bottom";
  if (l < edge && l <= r) return "right";
  if (r < edge && r < l) return "left";
  return "bottom";
}

function clampBall(x: number, y: number) {
  return {
    x: Math.min(window.innerWidth - 8, Math.max(8, x)),
    y: Math.min(window.innerHeight - 8, Math.max(8, y)),
  };
}

function isPet() {
  return typeof window !== "undefined" && Boolean(window.pet?.isPet);
}

export function Desktop() {
  const [open, setOpen] = useState(false);
  const [dockSide, setDockSide] = useState("bottom");
  const [holding, setHolding] = useState(false);
  const faceColor = useAtelier((s) => s.faceColor);
  const widget = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const last = useRef({ x: 0, y: 0, t: 0 });
  const press = useRef<{
    sx: number;
    sy: number;
    dx: number;
    dy: number;
    timer: number;
    armed: boolean;
    moved: boolean;
  } | null>(null);
  const tapAt = useRef(0);
  const tapTimer = useRef(0);
  const hideTimer = useRef(0);
  const dockSideRef = useRef("bottom");

  const applyPos = () => {
    const el = widget.current;
    if (!el || isPet()) return;
    const o = BALL[dockSideRef.current] ?? BALL.bottom!;
    el.style.transform = `translate(${pos.current.x - o.x}px, ${pos.current.y - o.y}px)`;
  };

  const placeDock = () => {
    if (isPet()) return;
    const next = pickSide(pos.current.x, pos.current.y);
    dockSideRef.current = next;
    setDockSide(next);
    applyPos();
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
    let placed = false;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          pos.current = clampBall(p.x, p.y);
          placed = true;
        }
      }
    } catch {
      /* ignore */
    }
    if (!placed) {
      pos.current = clampBall(window.innerWidth / 2, window.innerHeight / 2);
    }
    placeDock();

    const onResize = () => {
      pos.current = clampBall(pos.current.x, pos.current.y);
      placeDock();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isPet()) return;
    let raf = 0;
    const step = () => {
      if (!press.current && (Math.abs(vel.current.x) > 0.12 || Math.abs(vel.current.y) > 0.12)) {
        let { x, y } = pos.current;
        x += vel.current.x;
        y += vel.current.y;
        const next = clampBall(x, y);
        if (next.x !== x) vel.current.x *= -0.52;
        if (next.y !== y) vel.current.y *= -0.52;
        pos.current = next;
        vel.current.x *= 0.9;
        vel.current.y *= 0.9;
        placeDock();
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
    if ((e.target as HTMLElement).closest("[data-dock]")) return;
    vel.current = { x: 0, y: 0 };
    last.current = { x: e.screenX, y: e.screenY, t: performance.now() };
    press.current = {
      sx: e.screenX,
      sy: e.screenY,
      dx: e.clientX - pos.current.x,
      dy: e.clientY - pos.current.y,
      timer: window.setTimeout(() => {
        if (!press.current) return;
        press.current.armed = true;
        setHolding(true);
        window.pet?.setClickThrough?.(false);
      }, 220),
      armed: false,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dist = Math.hypot(e.screenX - p.sx, e.screenY - p.sy);
    if (!p.armed) return;
    if (dist > 3) p.moved = true;
    const now = performance.now();
    const dt = Math.max(8, now - last.current.t);
    vel.current = {
      x: ((e.screenX - last.current.x) / dt) * 16,
      y: ((e.screenY - last.current.y) / dt) * 16,
    };
    const prevX = last.current.x;
    const prevY = last.current.y;
    last.current = { x: e.screenX, y: e.screenY, t: now };
    if (isPet()) {
      window.pet?.moveBy(e.screenX - prevX, e.screenY - prevY);
    } else {
      pos.current = clampBall(e.clientX - p.dx, e.clientY - p.dy);
      placeDock();
    }
  };

  const onDragEnd = () => {
    const p = press.current;
    if (p) window.clearTimeout(p.timer);
    setHolding(false);
    if (p && !p.armed && !p.moved) {
      const now = performance.now();
      if (now - tapAt.current < 340) {
        window.clearTimeout(tapTimer.current);
        tapAt.current = 0;
        getEngine()?.bounceOnce();
      } else {
        tapAt.current = now;
        tapTimer.current = window.setTimeout(() => {
          getEngine()?.blink();
          setOpen((v) => {
            const next = !v;
            window.pet?.setDock?.(next);
            return next;
          });
        }, 280);
      }
      vel.current = { x: 0, y: 0 };
    } else if (p?.moved && !isPet()) {
      vel.current.x = Math.max(-38, Math.min(38, vel.current.x));
      vel.current.y = Math.max(-38, Math.min(38, vel.current.y));
    }
    press.current = null;
    savePos();
    placeDock();
  };

  const showDock = (v: boolean) => {
    window.clearTimeout(hideTimer.current);
    if (v) {
      setOpen(true);
      window.pet?.setClickThrough?.(false);
      placeDock();
      return;
    }
    hideTimer.current = window.setTimeout(() => {
      if (press.current) return;
      setOpen(false);
      window.pet?.setClickThrough?.(true);
    }, 480);
  };

  const dock = (
    <div
      data-dock
      className={cn(
        "absolute z-20 flex flex-col items-center gap-1.5",
        dockSide === "bottom" && "inset-x-0 top-[400px]",
        dockSide === "top" && "inset-x-0 bottom-[400px]",
        dockSide === "right" && "top-1/2 left-[400px] w-[168px] -translate-y-1/2",
        dockSide === "left" && "top-1/2 right-[400px] w-[168px] -translate-y-1/2",
        open ? "opacity-100" : "pointer-events-none invisible",
      )}
    >
      <ColorWheel value={faceColor || GROK_BLUE} onChange={setColor} compact />
      <div
        className={cn(
          "flex items-center justify-center gap-px whitespace-nowrap rounded-full bg-ink/55 p-1 backdrop-blur-sm",
          dockSide === "left" || dockSide === "right"
            ? "w-full flex-col rounded-2xl py-1.5"
            : "w-max max-w-full flex-nowrap",
        )}
      >
        {MOODS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={m.run}
            className={cn(
              "shrink-0 rounded-full px-1.5 py-1 text-[9px] font-medium text-paper hover:bg-white/10",
              (dockSide === "left" || dockSide === "right") && "w-full text-center",
            )}
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
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-transparent">
      {!isPet() && <MacDesktop />}
      <div
        ref={widget}
        data-side={dockSide}
        className={cn(
          "relative z-20 will-change-transform",
          isPet() ? "mx-auto" : "absolute top-0 left-0",
        )}
        style={{ width: STAGE.w, height: STAGE.h }}
        onPointerEnter={() => showDock(true)}
        onPointerLeave={() => {
          if (!press.current) showDock(false);
        }}
      >
        <div
          ref={faceRef}
          className={cn(
            "absolute h-[440px] w-[440px] origin-center cursor-grab touch-none active:cursor-grabbing",
            dockSide === "bottom" && "top-0 left-[70px]",
            dockSide === "top" && "bottom-0 left-[70px]",
            dockSide === "right" && "top-[80px] left-0",
            dockSide === "left" && "top-[80px] right-0",
            holding && "scale-[1.04]",
          )}
          onPointerDown={onDragStart}
          onPointerMove={onDrag}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <GrokBotCanvas followGlobal faceScale={0.24} className="w-full" />
        </div>
        {dock}
      </div>
    </div>
  );
}

function MacDesktop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 108%, #1d3a28 0%, transparent 52%), linear-gradient(180deg, #7eb6ea 0%, #b9c4f0 38%, #e8b4c8 72%, #c9a07a 100%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between px-3 text-[12px] text-ink/80">
        <div className="flex items-center gap-3 font-medium">
          <span className="text-[13px]"></span>
          <span>Finder</span>
          <span className="opacity-70">File</span>
          <span className="opacity-70">Edit</span>
          <span className="opacity-70">View</span>
          <span className="opacity-70">Go</span>
        </div>
        <div className="flex items-center gap-3 opacity-70">
          <span>Mon 17</span>
          <span>7:57 AM</span>
        </div>
      </div>
    </div>
  );
}
