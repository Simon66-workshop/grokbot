/// <reference types="vite/client" />

interface PetBridge {
  isPet: boolean;
  moveBy: (dx: number, dy: number) => void;
  setClickThrough?: (on: boolean) => void;
}

interface Window {
  pet?: PetBridge;
}
