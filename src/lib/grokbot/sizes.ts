/** Official GrokBot frames. box = CSS pixels of the square canvas. */
export const BOT_SIZES = {
  menubar: { box: 22, faceScale: 0.46, label: "Menu bar" },
  pet: { box: 200, faceScale: 0.3, label: "Small" },
  medium: { box: 320, faceScale: 0.33, label: "Medium" },
  companion: { box: 440, faceScale: 0.24, label: "Large" },
  hero: { box: 720, faceScale: 0.22, label: "Hero" },
} as const;

export type BotSizeId = keyof typeof BOT_SIZES;

export function faceScaleFor(id: BotSizeId) {
  return BOT_SIZES[id].faceScale;
}
