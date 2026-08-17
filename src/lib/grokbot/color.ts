export const GROK_BLUE = "#1b56f3";
export const INK = "#161513";

export type Hsv = { h: number; s: number; v: number };

export const FACE_PRESETS: { name: string; hex: string }[] = [
  { name: "Grok", hex: GROK_BLUE },
  { name: "Ink", hex: INK },
  { name: "Coral", hex: "#e85d4c" },
  { name: "Gold", hex: "#e2a116" },
  { name: "Mint", hex: "#2bb673" },
  { name: "Violet", hex: "#7b5cff" },
  { name: "Sky", hex: "#3db7e8" },
  { name: "Rose", hex: "#e85a9b" },
];

export function resolveFaceHex(c: string): string {
  if (!c || c === "blue") return GROK_BLUE;
  if (c === "ink") return INK;
  return c;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = resolveFaceHex(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export type WheelHit = { zone: "ring" | "disc"; hsv: Hsv };

export function hitColorWheel(
  x: number,
  y: number,
  size: number,
  current: Hsv,
): WheelHit | null {
  const cx = size / 2;
  const cy = size / 2;
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.hypot(dx, dy);
  const outer = size / 2 - 1;
  const ringIn = outer - 16;
  const disc = ringIn - 7;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const hue = (ang + 360 + 90) % 360;
  if (r <= outer && r >= ringIn - 2) {
    return { zone: "ring", hsv: { h: hue, s: Math.max(current.s, 0.55), v: Math.max(current.v, 0.72) } };
  }
  if (r <= disc) {
    return { zone: "disc", hsv: { h: current.h, s: Math.min(1, r / disc), v: current.v } };
  }
  return null;
}

export function drawColorWheel(
  ctx: CanvasRenderingContext2D,
  size: number,
  current: Hsv,
) {
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 1;
  const ringIn = outer - 16;
  const disc = ringIn - 7;
  ctx.clearRect(0, 0, size, size);

  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      const rr = Math.hypot(dx, dy);
      if (rr > disc) continue;
      const { r, g, b } = hsvToRgb(current.h, Math.min(1, rr / disc), current.v);
      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const segs = 96;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1.15) / segs) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a0, a1);
    ctx.arc(cx, cy, ringIn, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = hsvToHex((i / segs) * 360, 1, 1);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, disc + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const ringA = ((current.h - 90) * Math.PI) / 180;
  const ringR = (outer + ringIn) / 2;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(ringA) * ringR, cy + Math.sin(ringA) * ringR, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(20,18,16,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const discA = ((current.h - 90) * Math.PI) / 180;
  const discR = current.s * disc;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(discA) * discR, cy + Math.sin(discA) * discR, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(20,18,16,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
}
