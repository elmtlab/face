/**
 * Conversational project setup session persistence.
 *
 * Stores setup sessions as JSON in ~/.face/setup-sessions/ so they
 * are resumable if the user navigates away.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Types ──────────────────────────────────────────────────────────

export interface SetupMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export type SetupPhase =
  | "greeting"        // AI asks if user has existing project
  | "collecting"      // Gathering project info or credentials
  | "connecting"      // Validating connection to external tool
  | "confirming"      // Agent presents summary, waits for user confirmation
  | "scaffolding"     // Optionally creating project structure
  | "complete"        // Setup finished
  | "error";          // Unrecoverable error

export type PMTool = "github" | "linear" | "jira" | "local";

export interface SetupSessionState {
  id: string;
  phase: SetupPhase;
  messages: SetupMessage[];
  /** Whether user has an existing project in an external tool */
  hasExistingProject: boolean | null;
  /** Chosen PM tool */
  pmTool: PMTool | null;
  /** Extracted project metadata */
  projectInfo: {
    name: string | null;
    description: string | null;
    goals: string | null;
    repoLink: string | null;
  };
  /** Provider credentials (stored server-side only, never sent to UI) */
  credentials: Record<string, string> | null;
  /** Provider scope (e.g. "owner/repo") */
  scope: string | null;
  /** Whether user opted in to auto-scaffolding */
  autoScaffold: boolean | null;
  /** Created project ID after setup completes */
  createdProjectId: string | null;
  /** Created provider name after connection */
  connectedProviderName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Persistence ────────────────────────────────────────────────────

const SESSION_DIR = join(homedir(), ".face", "setup-sessions");

function ensureDir() {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
}

export function saveSession(s: SetupSessionState) {
  ensureDir();
  s.updatedAt = new Date().toISOString();
  writeFileSync(join(SESSION_DIR, `${s.id}.json`), JSON.stringify(s, null, 2));
}

export function loadSession(id: string): SetupSessionState | null {
  const path = join(SESSION_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function listSessions(): SetupSessionState[] {
  ensureDir();
  const files: string[] = readdirSync(SESSION_DIR);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadSession(f.replace(".json", "")))
    .filter((s): s is SetupSessionState => s !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Find the most recent incomplete setup session. */
export function findActiveSession(): SetupSessionState | null {
  const sessions = listSessions();
  return sessions.find((s) => s.phase !== "complete" && s.phase !== "error") ?? null;
}

// ── Session cleanup ───────────────────────────────────────────────

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_MAX_COUNT = 50;

/**
 * Garbage-collect stale setup sessions:
 * 1. Remove any session older than 24h that is in a terminal state (complete/error)
 * 2. If total count still exceeds SESSION_MAX_COUNT, remove the oldest sessions
 */
export function cleanupSessions(): void {
  ensureDir();
  const files: string[] = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"));
  const now = Date.now();

  type SessionEntry = { file: string; session: SetupSessionState };
  const entries: SessionEntry[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(SESSION_DIR, file), "utf-8");
      const session: SetupSessionState = JSON.parse(raw);
      entries.push({ file, session });
    } catch {
      // Corrupted file — remove it
      try { unlinkSync(join(SESSION_DIR, file)); } catch { /* ignore */ }
    }
  }

  // Sort oldest first for pruning
  entries.sort(
    (a, b) => new Date(a.session.updatedAt).getTime() - new Date(b.session.updatedAt).getTime(),
  );

  // Pass 1: remove terminal sessions older than TTL
  const remaining: SessionEntry[] = [];
  for (const entry of entries) {
    const age = now - new Date(entry.session.updatedAt).getTime();
    const isTerminal = entry.session.phase === "complete" || entry.session.phase === "error";
    if (isTerminal && age > SESSION_MAX_AGE_MS) {
      try { unlinkSync(join(SESSION_DIR, entry.file)); } catch { /* ignore */ }
    } else {
      remaining.push(entry);
    }
  }

  // Pass 2: enforce hard cap — remove oldest (terminal first, then any)
  if (remaining.length > SESSION_MAX_COUNT) {
    // Prefer removing terminal sessions first
    const terminal = remaining.filter(
      (e) => e.session.phase === "complete" || e.session.phase === "error",
    );
    const active = remaining.filter(
      (e) => e.session.phase !== "complete" && e.session.phase !== "error",
    );
    const sorted = [...terminal, ...active]; // terminal first for removal
    const toRemove = sorted.slice(0, remaining.length - SESSION_MAX_COUNT);
    for (const entry of toRemove) {
      try { unlinkSync(join(SESSION_DIR, entry.file)); } catch { /* ignore */ }
    }
  }
}

export function createSession(): SetupSessionState {
  // Opportunistically clean up old sessions when creating a new one
  try { cleanupSessions(); } catch { /* best-effort */ }

  const id = `setup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const session: SetupSessionState = {
    id,
    phase: "greeting",
    messages: [],
    hasExistingProject: null,
    pmTool: null,
    projectInfo: {
      name: null,
      description: null,
      goals: null,
      repoLink: null,
    },
    credentials: null,
    scope: null,
    autoScaffold: null,
    createdProjectId: null,
    connectedProviderName: null,
    createdAt: now,
    updatedAt: now,
  };
  saveSession(session);
  return session;
}

/**
 * Return a sanitized version of the session for the client.
 * Strips credentials so they're never exposed in the UI.
 */
export function sanitizeForClient(s: SetupSessionState): Omit<SetupSessionState, "credentials"> & { credentials: null } {
  return { ...s, credentials: null };
}
