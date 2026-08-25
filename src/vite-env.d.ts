/// <reference types="vite/client" />

interface PetDragResult {
  moved: boolean;
}

interface CodexSnap {
  status: string;
  label: string;
  name: string;
  threads: number;
  processOn: boolean;
  tool?: string;
  agents?: DeskAgent[];
}

interface DeskAgent {
  id: string;
  name: string;
  status: string;
  label: string;
  threads: number;
  cwd: string;
  path?: string;
  processOn: boolean;
}

interface DeskSnap {
  digest: string;
  agents: DeskAgent[];
  meeting: { on: boolean; next: { title: string; minutes: number } | null };
  focus: { app: string; workish: boolean };
  git: Array<{
    repo: string;
    branch: string;
    dirty: number;
    ahead: number;
    behind: number;
    tests: "pass" | "fail" | "unknown";
  }>;
  pomo: { running: boolean; phase: "idle" | "work" | "break"; remainingMs: number; totalMs: number };
  grok: { available: boolean; source: "cli" | "api" | "none" };
  perms?: {
    calendar: boolean;
    automation: boolean;
    grokBot: boolean;
    missing: Array<{ id: string; label: string }>;
  };
  quiet?: boolean;
}

interface PetBridge {
  isPet: boolean;
  moveBy: (dx: number, dy: number) => void;
  dragStart?: () => void;
  dragEnd?: () => Promise<PetDragResult>;
  onDragArmed?: (fn: () => void) => () => void;
  onDragFinished?: (fn: (result: PetDragResult) => void) => () => void;
  setClickThrough?: (on: boolean) => void;
  setDock?: (open: boolean) => void;
  setOverlay?: (on: boolean) => void;
  onCursor?: (fn: (x: number, y: number) => void) => () => void;
  onSide?: (fn: (side: string) => void) => () => void;
  onScene?: (fn: (scene: string) => void) => () => void;
  onVisible?: (fn: (visible: boolean) => void) => () => void;
  onMute?: (fn: (muted: boolean) => void) => () => void;
  onMeeting?: (fn: (on: boolean) => void) => () => void;
  onFocus?: (fn: (on: boolean) => void) => () => void;
  onSize?: (fn: (id: string) => void) => () => void;
  onAutoWork?: (fn: (on: boolean) => void) => () => void;
  onCodex?: (fn: (snap: CodexSnap) => void) => () => void;
  onCodexWatch?: (fn: (on: boolean) => void) => () => void;
  onDesk?: (fn: (snap: DeskSnap) => void) => () => void;
  onWhisper?: (fn: (text: string) => void) => () => void;
  onPomoEnded?: (fn: (phase: string) => void) => () => void;
  onNudge?: (fn: (payload: { tool?: string; name?: string; repeat?: boolean }) => void) => () => void;
  setScene?: (scene: string) => void;
  setMuted?: (muted: boolean) => void;
  setSize?: (id: string) => void;
  setAutoWork?: (on: boolean) => void;
  setCodexWatch?: (on: boolean) => void;
  brief?: (useGrok?: boolean) => Promise<string>;
  pomoToggle?: () => void;
  pomoSkip?: () => void;
  openAgent?: (id: string) => void;
  ackAgent?: (id: string) => void;
  openPerm?: (id: string) => void;
  setTrayIcon?: (dataUrl: string) => void;
  hide?: () => void;
  quit?: () => void;
}

interface Window {
  pet?: PetBridge;
}