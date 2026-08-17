import { useEffect, useRef } from "react";
import { GrokBotEngine } from "@/lib/grokbot/engine";
import { drawGrokBot, type ThemeColors } from "@/lib/grokbot/renderer";
import { useAtelier } from "@/lib/grokbot/store";
import { registerEngine } from "@/lib/grokbot/registry";
import { cn } from "@/lib/utils";

function readTheme(): ThemeColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) =>
    s.getPropertyValue(name).trim() || fb;
  return {
    ink: v("--color-ink", "#161513"),
    paper: v("--color-paper", "#f3f1ea"),
    grok: v("--color-grok", "#1b56f3"),
    eye: v("--color-eye", "#fffdf8"),
    muted: v("--color-muted", "#6e6a62"),
  };
}

export function GrokBotCanvas({
  className,
  followGlobal = false,
  faceScale,
}: {
  className?: string;
  followGlobal?: boolean;
  faceScale?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GrokBotEngine | null>(null);
  const themeRef = useRef<ThemeColors | null>(null);
  const faceScaleRef = useRef(faceScale);
  faceScaleRef.current = faceScale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const engine = new GrokBotEngine();
    engine.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    engineRef.current = engine;
    themeRef.current = readTheme();
    registerEngine(engine);

    const store = useAtelier.getState();
    engine.setExpression(store.expression);
    engine.setShape(store.shape);
    engine.setSpringSpeed(store.springSpeed);
    engine.setEyeScale(store.eyeScale);
    engine.setFaceColor(store.faceColor);
    engine.setFollowPointer(store.followPointer);
    engine.setAutoIdle(store.autoIdle);
    engine.setFlipX(store.flipX);
    engine.setEmphasis(store.emphasis);
    engine.setDebug(store.debug);
    engine.setRotation((store.yawDeg * Math.PI) / 180, 0);

    const unsub = useAtelier.subscribe((s, prev) => {
      if (s.expression !== prev.expression) engine.setExpression(s.expression);
      if (s.shape !== prev.shape) engine.setShape(s.shape);
      if (s.springSpeed !== prev.springSpeed) engine.setSpringSpeed(s.springSpeed);
      if (s.eyeScale !== prev.eyeScale) engine.setEyeScale(s.eyeScale);
      if (s.faceColor !== prev.faceColor) engine.setFaceColor(s.faceColor);
      if (s.followPointer !== prev.followPointer)
        engine.setFollowPointer(s.followPointer);
      if (s.autoIdle !== prev.autoIdle) engine.setAutoIdle(s.autoIdle);
      if (s.flipX !== prev.flipX) engine.setFlipX(s.flipX);
      if (s.emphasis !== prev.emphasis) engine.setEmphasis(s.emphasis);
      if (s.debug !== prev.debug) engine.setDebug(s.debug);
      if (s.yawDeg !== prev.yawDeg)
        engine.setRotation((s.yawDeg * Math.PI) / 180, engine.tgt.pitch);
      if (s.gazeX !== prev.gazeX || s.gazeY !== prev.gazeY) {
        if (!s.followPointer) engine.setGaze(s.gazeX, s.gazeY);
      }
    });

    let raf = 0;
    let lastPush = 0;
    const tick = (now: number) => {
      engine.tick(now);
      const ctx = canvas.getContext("2d");
      const theme = themeRef.current ?? readTheme();
      if (ctx) {
        drawGrokBot(ctx, engine, canvas.width || 480, theme, {
          faceScale: faceScaleRef.current,
        });
      }
      if (now - lastPush > 80) {
        lastPush = now;
        const snap = engine.snapshot();
        const u = engine.units();
        useAtelier.getState().set({
          liveGazeX: snap.gazeX,
          liveGazeY: snap.gazeY,
          liveUnitsX: u.ux,
          liveUnitsY: u.uy,
          liveState: snap.state,
          liveShape: snap.shape,
          liveExpression: snap.expression,
          demoPlaying: snap.demoPlaying,
          demoName: snap.demoName,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => sizeCanvas(canvas));
    ro.observe(wrap);
    sizeCanvas(canvas);

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        engine.blink();
      } else if (e.key === "d" || e.key === "D") {
        engine.playDemo();
      } else if (e.key === "r" || e.key === "R") {
        engine.reset();
        useAtelier.getState().set({
          expression: 0,
          shape: "circle",
          state: "idle",
          yawDeg: 0,
          gazeX: 0,
          gazeY: 0,
        });
      }
    };
    window.addEventListener("keydown", onKey);

    (wrap as HTMLDivElement & { __engine?: GrokBotEngine }).__engine = engine;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsub();
      window.removeEventListener("keydown", onKey);
      registerEngine(null);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!followGlobal) return;
    const onMove = (e: PointerEvent) => {
      const el = wrapRef.current;
      const engine = engineRef.current;
      if (!el || !engine) return;
      const r = el.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / Math.max(72, r.width * 0.42)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / Math.max(72, r.height * 0.42)));
      engine.pointerMove(nx, ny);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [followGlobal]);

  const onMove = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    const engine = engineRef.current;
    if (!el || !engine) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    engine.pointerMove(nx, ny);
  };

  return (
    <div
      ref={wrapRef}
      className={cn("relative aspect-square w-full touch-none", className)}
      onPointerMove={onMove}
      onPointerEnter={onMove}
      onPointerLeave={() => {
        if (!followGlobal) engineRef.current?.pointerLeave();
      }}
    >
      <canvas
        ref={canvasRef}
        className="block size-full"
        aria-label="Grok Bot icon"
        onDoubleClick={(e) => {
          e.preventDefault();
          engineRef.current?.bounceOnce();
        }}
      />
    </div>
  );
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const css = canvas.clientWidth || 480;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(css * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
}

export function getEngineFrom(el: HTMLElement | null): GrokBotEngine | null {
  return (el as HTMLElement & { __engine?: GrokBotEngine } | null)?.__engine ?? null;
}
