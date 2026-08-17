import { useEffect, useRef } from "react";
import {
  FACE_PRESETS,
  drawColorWheel,
  hexToHsv,
  hitColorWheel,
  hsvToHex,
  resolveFaceHex,
} from "@/lib/grokbot/color";
import { cn } from "@/lib/utils";

const SIZE = 108;

export function ColorWheel({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hsv = hexToHsv(resolveFaceHex(value));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawColorWheel(ctx, SIZE, hsv);
  }, [hsv.h, hsv.s, hsv.v]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const hit = hitColorWheel(
      ((e.clientX - r.left) / r.width) * SIZE,
      ((e.clientY - r.top) / r.height) * SIZE,
      SIZE,
      hsv,
    );
    if (hit) onChange(hsvToHex(hit.hsv.h, hit.hsv.s, hit.hsv.v));
  };

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className={cn(
          "cursor-crosshair touch-none",
          compact ? "size-[72px]" : "size-[108px]",
        )}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e);
        }}
      />
      <div className="flex flex-wrap justify-center gap-1.5">
        {FACE_PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            title={p.name}
            onClick={() => onChange(p.hex)}
            className={cn(
              "size-4 rounded-full ring-1 ring-ink/15",
              resolveFaceHex(value).toLowerCase() === p.hex && "ring-2 ring-ink/55",
            )}
            style={{ background: p.hex }}
          />
        ))}
      </div>
    </div>
  );
}
