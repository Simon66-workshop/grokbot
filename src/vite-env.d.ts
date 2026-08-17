/// <reference types="vite/client" />

interface PetBridge {
  isPet: boolean;
  moveBy: (dx: number, dy: number) => void;
}

interface Window {
  pet?: PetBridge;
}
