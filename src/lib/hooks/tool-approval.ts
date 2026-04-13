import fs from "fs";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolApprovalRequest {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  createdAt: string;
}

export type ToolApprovalDecision = "approve" | "reject";

export interface ToolApprovalResult {
  decision: ToolApprovalDecision;
  reason?: string;
  decidedAt: string;
}

export interface UnreviewedAction {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  reason: string; // e.g. "server_unreachable", "timeout"
  timestamp: string;
}

// ---------------------------------------------------------------------------
// In-memory pending approval store
// ---------------------------------------------------------------------------

interface PendingEntry {
  request: ToolApprovalRequest;
  resolve: (result: ToolApprovalResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingEntry>();

/** How long to wait for a human decision before auto-approving (ms). */
const APPROVAL_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Register a new approval request and wait for a human decision.
 *
 * Returns the decision once a human responds, or auto-approves on timeout.
 */
export function submitApproval(
  request: ToolApprovalRequest
): Promise<ToolApprovalResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Auto-approve on timeout and log as unreviewed
      pending.delete(request.id);
      const result: ToolApprovalResult = {
        decision: "approve",
        reason: "timeout",
        decidedAt: new Date().toISOString(),
      };
      logUnreviewedAction(request, "timeout");
      resolve(result);
    }, APPROVAL_TIMEOUT_MS);

    pending.set(request.id, { request, resolve, timer });
  });
}

/**
 * Apply a human decision to a pending approval.
 */
export function decideApproval(
  id: string,
  decision: ToolApprovalDecision,
  reason?: string
): boolean {
  const entry = pending.get(id);
  if (!entry) return false;

  clearTimeout(entry.timer);
  pending.delete(id);

  entry.resolve({
    decision,
    reason,
    decidedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * List all currently pending approval requests.
 */
export function listPendingApprovals(): ToolApprovalRequest[] {
  return Array.from(pending.values()).map((e) => e.request);
}

// ---------------------------------------------------------------------------
// Unreviewed actions log (persisted to ~/.face/unreviewed-actions.json)
// ---------------------------------------------------------------------------

const UNREVIEWED_PATH = path.join(os.homedir(), ".face", "unreviewed-actions.json");

function readUnreviewedLog(): UnreviewedAction[] {
  try {
    if (!fs.existsSync(UNREVIEWED_PATH)) return [];
    return JSON.parse(fs.readFileSync(UNREVIEWED_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeUnreviewedLog(actions: UnreviewedAction[]): void {
  const dir = path.dirname(UNREVIEWED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(UNREVIEWED_PATH, JSON.stringify(actions, null, 2), "utf-8");
}

/**
 * Log an action that was auto-approved without human review.
 * Called both from the server (timeout) and can be called from the hook
 * script (server_unreachable) via a separate endpoint.
 */
export function logUnreviewedAction(
  request: Pick<ToolApprovalRequest, "id" | "sessionId" | "toolName" | "toolInput" | "cwd">,
  reason: string
): void {
  const actions = readUnreviewedLog();
  actions.push({
    id: request.id,
    sessionId: request.sessionId,
    toolName: request.toolName,
    toolInput: request.toolInput,
    cwd: request.cwd,
    reason,
    timestamp: new Date().toISOString(),
  });
  // Keep last 500 entries
  if (actions.length > 500) {
    actions.splice(0, actions.length - 500);
  }
  writeUnreviewedLog(actions);
}

/**
 * Read all unreviewed actions.
 */
export function getUnreviewedActions(): UnreviewedAction[] {
  return readUnreviewedLog();
}

/**
 * Clear all unreviewed actions (after user has acknowledged them).
 */
export function clearUnreviewedActions(): void {
  writeUnreviewedLog([]);
}
