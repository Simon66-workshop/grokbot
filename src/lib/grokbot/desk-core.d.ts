export const EMPTY_POMO: {
  running: boolean;
  phase: "idle" | "work" | "break";
  remainingMs: number;
  totalMs: number;
};

export const EMPTY_DESK: {
  digest: string;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    label: string;
    threads: number;
    cwd: string;
    processOn: boolean;
  }>;
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
  pomo: typeof EMPTY_POMO;
  grok: { available: boolean; source: "cli" | "api" | "none" };
  perms: {
    calendar: boolean;
    automation: boolean;
    grokBot: boolean;
    missing: Array<{ id: string; label: string }>;
  };
  quiet: boolean;
};

export function appIsWork(name: string): boolean;
export function parseGitStatus(text: string): {
  branch: string;
  ahead: number;
  behind: number;
  dirty: number;
};
export function formatRemain(ms: number): string;
export function composeDigest(input?: {
  agents?: Array<{ name: string; status: string; cwd: string }>;
  meeting?: { on: boolean; next: { title: string; minutes: number } | null };
  focus?: { app: string; workish: boolean };
  git?: Array<{ repo: string; dirty: number; tests: string }>;
  pomo?: { running: boolean; phase: string; remainingMs: number };
}): string;
export function demoDesk(): typeof EMPTY_DESK;
export function grokPromptFor(digest: string): string;
export function cleanGrokOut(raw: string): string;
export function createPomo(opts?: { workMs?: number; breakMs?: number }): {
  snap: (now?: number) => {
    running: boolean;
    phase: "idle" | "work" | "break";
    remainingMs: number;
    totalMs: number;
  };
  toggle: (now?: number) => {
    running: boolean;
    phase: "idle" | "work" | "break";
    remainingMs: number;
    totalMs: number;
    justEnded: string | null;
  };
  skip: (now?: number) => {
    running: boolean;
    phase: "idle" | "work" | "break";
    remainingMs: number;
    totalMs: number;
    justEnded: string | null;
  };
  tick: (now?: number) => {
    running: boolean;
    phase: "idle" | "work" | "break";
    remainingMs: number;
    totalMs: number;
    justEnded: string | null;
  };
  begin: (phase: "work" | "break", now?: number) => {
    running: boolean;
    phase: "idle" | "work" | "break";
    remainingMs: number;
    totalMs: number;
    justEnded: string | null;
  };
};
