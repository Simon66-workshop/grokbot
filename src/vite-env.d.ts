/// <reference types="vite/client" />

interface PetBridge {
  isPet: boolean;
  moveBy: (dx: number, dy: number) => void;
  setClickThrough?: (on: boolean) => void;
  setDock?: (open: boolean) => void;
  onCursor?: (fn: (x: number, y: number) => void) => () => void;
  onSide?: (fn: (side: string) => void) => () => void;
  onScene?: (fn: (scene: string) => void) => () => void;
  setScene?: (scene: string) => void;
  quit?: () => void;
}

interface Window {
  pet?: PetBridge;
}
