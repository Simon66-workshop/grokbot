import type { EyeParams } from "./types";

const e = (
  x: number,
  y: number,
  w: number,
  h: number,
  deg: number,
  round = 1,
  alpha = 1,
): EyeParams => ({
  x,
  y,
  w,
  h,
  rot: (deg * Math.PI) / 180,
  round,
  alpha,
});

export type ExpressionDef = {
  id: number;
  name: string;
  left: EyeParams;
  right: EyeParams;
};

/**
 * 25 rest poses. Large position / size differences live in the paths;
 * gaze is a small extra offset applied afterwards.
 */
export const EXPRESSIONS: ExpressionDef[] = [
  {
    id: 0,
    name: "Rest",
    // Chubby ovals, generous gap — cute twins, not quotation marks.
    left: e(-10, -15, 12.8, 17.6, 11),
    right: e(50, -13, 11.8, 16.2, 11),
  },
  {
    id: 1,
    name: "Glance R",
    left: e(8, -18, 12.2, 18.4, 14),
    right: e(62, -14, 10.8, 16.6, 16),
  },
  {
    id: 2,
    name: "Glance L",
    left: e(-38, -17, 11.4, 18, -4),
    right: e(16, -16, 12.6, 18.8, 0),
  },
  {
    id: 3,
    name: "Up",
    left: e(-12, -40, 12.0, 16.2, 10),
    right: e(48, -38, 11.0, 15.2, 11),
  },
  {
    id: 4,
    name: "Down",
    left: e(-10, 16, 13.0, 14.8, 12),
    right: e(50, 18, 11.8, 13.6, 12),
  },
  {
    id: 5,
    name: "Joy",
    left: e(-10, -6, 15.2, 28, 11),
    right: e(52, -3, 14.0, 26, 11),
  },
  {
    id: 6,
    name: "Squint",
    left: e(-10, -10, 16.0, 6.2, 8),
    right: e(52, -8, 14.6, 5.6, 8),
  },
  {
    id: 7,
    name: "Shut",
    left: e(-10, -16, 14.2, 2.4, 10),
    right: e(50, -14, 13.0, 2.2, 10),
  },
  {
    id: 8,
    name: "Dots",
    left: e(8, -8, 16, 16, 0, 1),
    right: e(38, -6, 20, 20, 0, 1),
  },
  {
    id: 9,
    name: "Focus",
    left: e(-8, 4, 14, 16, -8, 1),
    right: e(22, 2, 22, 22, 0, 1),
  },
  {
    id: 10,
    name: "Surprise",
    left: e(6, -18, 20, 24, 6, 1),
    right: e(40, -16, 18, 22, 8, 1),
  },
  {
    id: 11,
    name: "Wink L",
    left: e(-10, -20, 14.0, 2.4, 12),
    right: e(50, -16, 12.0, 19.5, 12),
  },
  {
    id: 12,
    name: "Wink R",
    left: e(-10, -20, 12.4, 20.5, 12),
    right: e(50, -14, 13.2, 2.4, 10),
  },
  {
    id: 13,
    name: "Side-eye",
    left: e(28, -8, 8, 14, 8),
    right: e(58, -6, 7, 12, 12),
  },
  {
    id: 14,
    name: "Curious",
    left: e(8, -36, 10, 20, 8),
    right: e(40, -14, 11, 24, 24),
  },
  {
    id: 15,
    name: "Sleepy",
    left: e(-10, -12, 14.0, 8.6, 9),
    right: e(50, -10, 12.8, 7.8, 9),
  },
  {
    id: 16,
    name: "Low",
    left: e(14, 8, 12, 10, 22),
    right: e(40, 12, 11, 9, 20),
  },
  {
    id: 17,
    name: "Stern",
    left: e(12, -28, 13, 8, -18),
    right: e(40, -28, 13, 8, 18),
  },
  {
    id: 18,
    name: "Scan",
    left: e(12, -18, 18, 4.5, 0),
    right: e(46, -18, 16, 4.5, 0),
  },
  {
    id: 19,
    name: "Tiny",
    left: e(-4, -18, 5.5, 8, 14),
    right: e(48, -15, 5, 7.5, 14),
  },
  {
    id: 20,
    name: "Wide",
    left: e(-12, -10, 16.8, 26, 10),
    right: e(52, -8, 15.4, 24, 10),
  },
  {
    id: 21,
    name: "Dizzy",
    left: e(-6, -30, 10, 18, -28),
    right: e(48, 8, 12, 14, 40),
  },
  {
    id: 22,
    name: "Hidden",
    left: e(16, -24, 10, 20, 20, 1, 0),
    right: e(42, -18, 9, 18, 20, 1, 0),
  },
  {
    id: 23,
    name: "Cross",
    left: e(16, -22, 4, 16, 42),
    right: e(40, -18, 4, 16, -42),
  },
  {
    id: 24,
    name: "Corner",
    left: e(48, -40, 8, 14, 38),
    right: e(68, -28, 6, 10, 42),
  },
];

export function getExpression(id: number): ExpressionDef {
  return EXPRESSIONS[((id % 25) + 25) % 25]!;
}
