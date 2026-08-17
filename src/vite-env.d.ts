/// <reference types="vite/client" />

interface PetBridge {
  isPet: boolean;
  moveBy: (dx: number, dy: number) => void;
  setClickThrough?: (on: boolean) => void;
  setDock?: (open: boolean) => void;
  onCursor?: (fn: (x: number, y: number) => void) => void;
}

interface Window {
  pet?: PetBridge;
}
