import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { GrokBotCanvas } from "@/components/grokbot/GrokBotCanvas";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXPRESSIONS } from "@/lib/grokbot/expressions";
import { SHAPE_META } from "@/lib/grokbot/shapes";
import { getEngine } from "@/lib/grokbot/registry";
import { useAtelier } from "@/lib/grokbot/store";
import { GAZE_CLAMP, GAZE_GAIN_X, GAZE_GAIN_Y } from "@/lib/grokbot/types";
import type { StateId } from "@/lib/grokbot/types";
import { cn } from "@/lib/utils";
import { ExprThumb } from "@/components/atelier/ExprThumb";

const STATES: { id: StateId; label: string; note: string }[] = [
  { id: "idle", label: "Idle", note: "Rest pose, wander, blink" },
  { id: "blink", label: "Blink", note: "Squash the stadiums" },
  { id: "look", label: "Look", note: "Spherical glance" },
  { id: "loading", label: "Loading", note: "Three-dot pulse" },
  { id: "exclaim", label: "Exclaim", note: "Morphs into !" },
  { id: "exclaim-fly", label: "Fly", note: "The mark leaves" },
  { id: "focus", label: "Focus", note: "Round eyes + blue satellite" },
  { id: "shrink", label: "Shrink", note: "Collapse to a seed" },
  { id: "egg", label: "Egg", note: "Vertical taper" },
  { id: "hex", label: "Hex", note: "Faceted body" },
  { id: "triangle", label: "Triangle", note: "Soft 3-gon" },
  { id: "streaks", label: "Streaks", note: "Rainbow ribbons" },
  { id: "orbits", label: "Orbits", note: "Thinking rings" },
  { id: "sparkle", label: "Sparkle", note: "Short dashes" },
  { id: "sleep", label: "Sleep", note: "Lids shut" },
  { id: "trail", label: "Trail", note: "Motion ribbon" },
  { id: "think", label: "Think", note: "Face + orbits" },
];

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="size-8 animate-pulse rounded-full bg-paper-deep" />;
  }
  return user ? (
    <UserButton />
  ) : (
    <Link
      to="/login"
      className="text-sm text-muted transition-colors hover:text-ink"
    >
      Sign in
    </Link>
  );
}

export function Atelier() {
  const s = useAtelier();
  const expr = EXPRESSIONS[s.liveExpression] ?? EXPRESSIONS[0]!;

  useEffect(() => {
    delete document.documentElement.dataset.companion;
  }, []);

  const play = (id: StateId) => {
    s.set({ state: id });
    getEngine()?.play(id);
  };

  const reset = () => {
    getEngine()?.reset();
    s.set({
      expression: 0,
      shape: "circle",
      state: "idle",
      yawDeg: 0,
      gazeX: 0,
      gazeY: 0,
      eyeScale: 1,
    });
  };

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pb-2 pt-6 sm:px-8 sm:pt-10">
        <p className="text-[11px] font-medium tracking-[0.18em] text-subtle uppercase">
          Prototype technique · Reverse engineering
        </p>
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Desktop
          </Link>
          <AuthSlot />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <h1 className="font-display text-[2.65rem] leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl">
          Atelier GrokBot
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-base">
          The face combines three independent systems: pre-drawn contours, a
          small gaze offset, then a spherical projection used during rotations.
          States choose and chain these building blocks. The whole mark is code.
        </p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-8">
          <section className="rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-sm font-medium">Final preview</h2>
              <span className="font-mono text-xs tabular-nums text-subtle">
                expression {String(s.liveExpression).padStart(2, "0")}
              </span>
            </div>
            <div className="rounded-[20px] bg-paper">
              <GrokBotCanvas />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted">
              <span>
                State <em className="not-italic text-ink">{s.liveState}</em>
              </span>
              <span>
                Shape <em className="not-italic text-ink">{s.liveShape}</em>
              </span>
              <span>
                {expr.name}{" "}
                <em className="not-italic text-ink">
                  {String(s.liveExpression).padStart(2, "0")}
                </em>
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => getEngine()?.blink()}>
                Blink
              </Button>
              <Button
                size="sm"
                variant={s.demoPlaying ? "grok" : "outline"}
                onClick={() =>
                  s.demoPlaying ? getEngine()?.stopDemo() : getEngine()?.playDemo()
                }
              >
                {s.demoPlaying ? "Stop tour" : "Demo tour"}
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                Reset
              </Button>
            </div>
          </section>

          <section className="rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
            <Tabs defaultValue="lab">
              <TabsList>
                <TabsTrigger value="lab">Laboratory</TabsTrigger>
                <TabsTrigger value="states">States</TabsTrigger>
                <TabsTrigger value="shapes">Shapes</TabsTrigger>
                <TabsTrigger value="math">Math & API</TabsTrigger>
              </TabsList>

              <TabsContent value="lab" className="pt-5">
                <LabPanel />
              </TabsContent>
              <TabsContent value="states" className="pt-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {STATES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => play(st.id)}
                      className={cn(
                        "rounded-xl px-3 py-3 text-left transition-colors duration-150",
                        s.liveState === st.id
                          ? "bg-ink text-paper"
                          : "bg-paper-deep/70 text-ink hover:bg-paper-deep",
                      )}
                    >
                      <div className="text-sm font-medium">{st.label}</div>
                      <div
                        className={cn(
                          "mt-0.5 text-[11px] leading-snug",
                          s.liveState === st.id ? "text-paper/70" : "text-muted",
                        )}
                      >
                        {st.note}
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="shapes" className="pt-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SHAPE_META.map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => {
                        s.set({ shape: sh.id, state: "idle" });
                        getEngine()?.setShape(sh.id);
                        if (sh.id !== "dot") getEngine()?.goIdle();
                      }}
                      className={cn(
                        "rounded-xl px-3 py-3 text-left transition-colors duration-150",
                        s.liveShape === sh.id
                          ? "bg-ink text-paper"
                          : "bg-paper-deep/70 text-ink hover:bg-paper-deep",
                      )}
                    >
                      <div className="text-sm font-medium">{sh.name}</div>
                      <div
                        className={cn(
                          "mt-0.5 text-[11px] leading-snug",
                          s.liveShape === sh.id ? "text-paper/70" : "text-muted",
                        )}
                      >
                        {sh.note}
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="math" className="pt-5">
                <MathPanel />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </div>
  );
}

function LabPanel() {
  const s = useAtelier();
  return (
    <div className="space-y-7">
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-medium">1. Expression</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Each pad loads two 48-point stadiums. Large position and size
            differences already live in the paths.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {EXPRESSIONS.map((ex) => {
            const active = s.expression === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                title={ex.name}
                onClick={() => {
                  s.set({ expression: ex.id });
                  getEngine()?.setExpression(ex.id);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors duration-150",
                  active
                    ? "bg-grok/15 ring-2 ring-grok"
                    : "bg-paper-deep text-ink-soft hover:bg-line-strong/25",
                )}
              >
                <ExprThumb expr={ex} />
                <span className="font-mono text-[9px] tabular-nums leading-none text-subtle">
                  {String(ex.id).padStart(2, "0")}
                </span>
              </button>
            );
          })}
        </div>
        <Field
          label="Spring speed"
          value={s.springSpeed.toFixed(1)}
        >
          <Slider
            min={1}
            max={16}
            step={0.1}
            value={[s.springSpeed]}
            onValueChange={([v]) => s.set({ springSpeed: v ?? 7 })}
          />
        </Field>
      </div>

      <div>
        <h3 className="text-sm font-medium">2. Independent gaze</h3>
        <Field
          label="Horizontal"
          value={`${s.liveGazeX.toFixed(2)} → ${s.liveUnitsX.toFixed(1)} u`}
        >
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={[s.gazeX]}
            onValueChange={([v]) => {
              s.set({ gazeX: v ?? 0, followPointer: false });
              getEngine()?.setGaze(v ?? 0, s.gazeY);
            }}
          />
        </Field>
        <Field
          label="Vertical"
          value={`${s.liveGazeY.toFixed(2)} → ${s.liveUnitsY.toFixed(1)} u`}
        >
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={[s.gazeY]}
            onValueChange={([v]) => {
              s.set({ gazeY: v ?? 0, followPointer: false });
              getEngine()?.setGaze(s.gazeX, v ?? 0);
            }}
          />
        </Field>
        <p className="mt-3 border-l-2 border-grok/40 pl-3 text-xs leading-relaxed text-muted">
          Pointer is clamped to ±{GAZE_CLAMP}, then multiplied by {GAZE_GAIN_X}{" "}
          horizontally and {GAZE_GAIN_Y} vertically — about ±
          {(GAZE_CLAMP * GAZE_GAIN_X).toFixed(1)} × ±
          {(GAZE_CLAMP * GAZE_GAIN_Y).toFixed(1)} units.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">3. Rotation and depth</h3>
        <Field label="Yaw" value={`${s.yawDeg.toFixed(0)}°`}>
          <Slider
            min={-90}
            max={90}
            step={1}
            value={[s.yawDeg]}
            onValueChange={([v]) => s.set({ yawDeg: v ?? 0 })}
          />
        </Field>
        <Field label="Eye scale" value={`${s.eyeScale.toFixed(2)}×`}>
          <Slider
            min={0.4}
            max={1.8}
            step={0.01}
            value={[s.eyeScale]}
            onValueChange={([v]) => s.set({ eyeScale: v ?? 1 })}
          />
        </Field>
        <div className="mt-4 space-y-3">
          <Toggle
            label="Show centroids and orbit"
            checked={s.debug}
            onChange={(v) => s.set({ debug: v })}
          />
          <Toggle
            label="Mirror horizontal flipX"
            checked={s.flipX}
            onChange={(v) => s.set({ flipX: v })}
          />
          <Toggle
            label="Emphasis"
            checked={s.emphasis}
            onChange={(v) => s.set({ emphasis: v })}
          />
          <Toggle
            label="Follow pointer"
            checked={s.followPointer}
            onChange={(v) => s.set({ followPointer: v })}
          />
          <Toggle
            label="Auto idle (blink + wander)"
            checked={s.autoIdle}
            onChange={(v) => s.set({ autoIdle: v })}
          />
          <Toggle
            label="Grok blue face"
            checked={s.faceColor === "blue"}
            onChange={(v) => s.set({ faceColor: v ? "blue" : "ink" })}
          />
        </div>
      </div>
    </div>
  );
}

function MathPanel() {
  const s = useAtelier();
  const expr = EXPRESSIONS[s.liveExpression] ?? EXPRESSIONS[0]!;
  return (
    <div className="space-y-5 text-sm leading-relaxed text-muted">
      <p>
        Eyes live on a sphere of radius 100. After the expression path and the
        gaze offset, each centroid is lifted onto the sphere, rotated by yaw /
        pitch, then perspective-projected. Visibility is the cosine of depth —
        when an eye passes behind the disc it fades instead of clipping.
      </p>
      <dl className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums">
        <Row k="expression" v={`${String(expr.id).padStart(2, "0")} ${expr.name}`} />
        <Row k="shape" v={s.liveShape} />
        <Row k="state" v={s.liveState} />
        <Row k="gaze N" v={`${s.liveGazeX.toFixed(3)}, ${s.liveGazeY.toFixed(3)}`} />
        <Row k="gaze u" v={`${s.liveUnitsX.toFixed(2)}, ${s.liveUnitsY.toFixed(2)}`} />
        <Row k="yaw" v={`${s.yawDeg.toFixed(1)}°`} />
        <Row k="spring" v={s.springSpeed.toFixed(2)} />
        <Row k="demo" v={s.demoPlaying ? s.demoName : "—"} />
      </dl>
      <pre className="overflow-x-auto rounded-xl bg-paper-deep/80 p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
{`gaze = clamp(pointer, ±${GAZE_CLAMP})
offset = (gaze.x * ${GAZE_GAIN_X}, gaze.y * ${GAZE_GAIN_Y})
z = sqrt(R² − x² − y²)
(x′, z′) = rotateY(yaw)
(y′, z″) = rotateX(pitch)
scale = 1 / (1 + (R − z″) · k)`}
      </pre>
      <p className="text-xs">
        Space blinks · D plays the tour · R resets. The tour reconstructs the
        official Grok Bot reel — loading, look-around, joy, exclaim, focus,
        shrink, egg, hex, triangle, orbits, sparkle, trail.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-mono text-xs tabular-nums text-grok">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="text-sm text-ink-soft">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-paper-deep/70 px-2.5 py-2">
      <dt className="text-[10px] tracking-wide text-subtle uppercase">{k}</dt>
      <dd className="mt-0.5 text-ink">{v}</dd>
    </div>
  );
}
