/// <reference types="vite/client" />

interface PetBridge {
  isPet: boolean;
  moveBy: (dx: number, dy: number) => void;
  setClickThrough?: (on: boolean) => void;
  setDock?: (open: boolean) => void;
  onCursor?: (fn: (x: number, y: number) => void) => () => void;
  onSide?: (fn: (side: string) => void) => () => void;
  onScene?: (fn: (scene: string) => void) => () => void;
  onVisible?: (fn: (visible: boolean) => void) => () => void;
  onMute?: (fn: (muted: boolean) => void) => () => void;
  onMeeting?: (fn: (on: boolean) => void) => () => void;
  onSize?: (fn: (id: string) => void) => () => void;
  onAutoWork?: (fn: (on: boolean) => void) => () => void;
  setScene?: (scene: string) => void;
  setMuted?: (muted: boolean) => void;
  setSize?: (id: string) => void;
  setAutoWork?: (on: boolean) => void;
  setTrayIcon?: (dataUrl: string) => void;
  hide?: () => void;
  quit?: () => void;
}

interface Window {
  pet?: PetBridge;
}
