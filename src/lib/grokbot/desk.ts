export type AgentStatus = "idle" | "running" | "waiting" | "done" | "error";

export type AgentChip = {
  id: string;
  name: string;
  status: AgentStatus | string;
  label: string;
  threads: number;
  cwd: string;
  processOn: boolean;
};

export type MeetingSnap = {
  on: boolean;
  next: { title: string; minutes: number } | null;
};

export type GitSnap = {
  repo: string;
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
  tests: "pass" | "fail" | "unknown";
};

export type PomoSnap = {
  running: boolean;
  phase: "idle" | "work" | "break";
  remainingMs: number;
  totalMs: number;
};

export type DeskSnap = {
  digest: string;
  agents: AgentChip[];
  meeting: MeetingSnap;
  focus: { app: string; workish: boolean };
  git: GitSnap[];
  pomo: PomoSnap;
  grok: { available: boolean; source: "cli" | "api" | "none" };
  perms?: {
    calendar: boolean;
    automation: boolean;
    grokBot: boolean;
    missing: Array<{ id: string; label: string }>;
  };
  quiet?: boolean;
};

export {
  EMPTY_DESK,
  EMPTY_POMO,
  appIsWork,
  parseGitStatus,
  formatRemain,
  composeDigest,
  demoDesk,
  grokPromptFor,
  cleanGrokOut,
  createPomo,
} from "./desk-core.js";
