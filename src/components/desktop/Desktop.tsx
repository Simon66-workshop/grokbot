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
    x: Math.min(Math.max(8, window.innerWidth - w - 8), Math.max(8, x)),
    y: Math.min(Math.max(8, window.innerHeight - h - 8), Math.max(8, y)),
  };
}

function isPet() {
  return typeof window !== "undefined" && Boolean(window.pet?.isPet);
}

export function Desktop() {
  const [open, setOpen] = useState(false);
  const [dockAbove, setDockAbove] = useState(false);
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

  const applyPos = () => {
    const el = widget.current;
    if (!el || isPet()) return;
    el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
  };

  const placeDock = () => {
    if (isPet()) return;
    const face = faceRef.current;
    const top = pos.current.y;
    const faceH = face?.offsetHeight ?? 280;
    const spaceBelow = window.innerHeight - (top + faceH);
    setDockAbove(spaceBelow < 220);
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
    placeDock();

    const onResize = () => {
      const box = widget.current;
      pos.current = clampPos(
        pos.current.x,
        pos.current.y,
        box?.offsetWidth ?? w,
        box?.offsetHeight ?? h,
      );
      applyPos();
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
      const el = widget.current;
      pos.current = clampPos(
        e.clientX - p.dx,
        e.clientY - p.dy,
        el?.offsetWidth ?? 280,
        el?.offsetHeight ?? 280,
      );
      applyPos();
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
        "relative z-20 flex shrink-0 flex-col items-center gap-1.5 px-1",
        dockAbove ? "-mb-8" : "-mt-8",
        open ? "opacity-100" : "pointer-events-none invisible",
      )}
    >
      <ColorWheel value={faceColor || GROK_BLUE} onChange={setColor} compact />
      <div className="flex w-max max-w-full flex-nowrap items-center justify-center gap-px whitespace-nowrap rounded-full bg-ink/55 p-1 backdrop-blur-sm">
        {MOODS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={m.run}
            className="shrink-0 rounded-full px-1.5 py-1 text-[9px] font-medium text-paper hover:bg-white/10"
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
        className={cn(
          "z-20 flex w-[min(520px,94vw)] flex-col items-center will-change-transform",
          isPet() ? "relative mx-auto" : "absolute top-0 left-0",
          dockAbove && "flex-col-reverse",
        )}
        onPointerEnter={() => showDock(true)}
        onPointerLeave={() => {
          if (!press.current) showDock(false);
        }}
      >
        <div
          ref={faceRef}
          className={cn(
            "w-full origin-center cursor-grab touch-none active:cursor-grabbing",
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
