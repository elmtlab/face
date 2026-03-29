/**
 * Background PR merge-status poller.
 *
 * Periodically checks open PRs linked to implementing workflows.
 * When a PR is detected as merged the associated task is marked done
 * and the requirement workflow is auto-closed.
 */

import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
  type WorkflowState,
} from "./workflow";
import { getActiveProvider } from "./manager";
import { GitHubProvider } from "./providers/github";
import { readTask, writeTask } from "../tasks/file-manager";
import { eventBus } from "../events/bus";

// ── Configuration ─────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 3 * 60_000; // 3 minutes
const MIN_POLL_INTERVAL_MS = 30_000;          // 30 seconds floor
const MAX_RETRY_BACKOFF_MS = 15 * 60_000;     // 15 minutes ceiling

/** Per-workflow retry state for transient failures. */
const retryBackoff = new Map<string, number>();

// ── Singleton guard ───────────────────────────────────────────────

const globalForPoller = globalThis as unknown as {
  __facePRPollerTimer?: ReturnType<typeof setInterval>;
  __facePRPollerRunning?: boolean;
  __facePRPollIntervalMs?: number;
};

// ── Public API ────────────────────────────────────────────────────

/**
 * Start the background poller. Safe to call multiple times — only
 * the first call creates the interval; subsequent calls are no-ops.
 */
export function startPRPoller(intervalMs?: number): void {
  if (globalForPoller.__facePRPollerTimer) return;

  const interval = Math.max(
    intervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
  );
  globalForPoller.__facePRPollIntervalMs = interval;

  console.log(`[face] PR poller started (every ${interval / 1000}s)`);

  // Run once immediately, then on interval
  pollAllWorkflows().catch((err) =>
    console.error("[face] PR poll error:", err),
  );

  globalForPoller.__facePRPollerTimer = setInterval(() => {
    pollAllWorkflows().catch((err) =>
      console.error("[face] PR poll error:", err),
    );
  }, interval);
}

/**
 * Stop the poller (useful for tests or shutdown).
 */
export function stopPRPoller(): void {
  if (globalForPoller.__facePRPollerTimer) {
    clearInterval(globalForPoller.__facePRPollerTimer);
    globalForPoller.__facePRPollerTimer = undefined;
  }
  globalForPoller.__facePRPollerRunning = false;
}

/**
 * Return the current configured polling interval in milliseconds.
 */
export function getPollIntervalMs(): number {
  return globalForPoller.__facePRPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
}

/**
 * Update the polling interval. Restarts the timer.
 */
export function setPollIntervalMs(ms: number): void {
  stopPRPoller();
  startPRPoller(ms);
}

// ── Core loop ─────────────────────────────────────────────────────

async function pollAllWorkflows(): Promise<void> {
  // Prevent overlapping runs
  if (globalForPoller.__facePRPollerRunning) return;
  globalForPoller.__facePRPollerRunning = true;

  try {
    const provider = await getActiveProvider();
    if (!provider || provider.type !== "github") return;

    const gh = provider as GitHubProvider;

    const workflows = listWorkflows().filter(
      (w) => w.phase === "implementing" && w.pr && w.pr.status === "open",
    );

    for (const workflow of workflows) {
      await pollSingleWorkflow(gh, workflow);
    }
  } finally {
    globalForPoller.__facePRPollerRunning = false;
  }
}

async function pollSingleWorkflow(
  gh: GitHubProvider,
  workflow: WorkflowState,
): Promise<void> {
  const pr = workflow.pr!;

  try {
    const status = await gh.getPRStatus(pr.number);

    // Reset backoff on success
    retryBackoff.delete(workflow.id);

    if (status === "merged") {
      await handlePRMerged(workflow, gh);
    } else if (status === "closed") {
      await handlePRClosedWithoutMerge(workflow, gh);
    }
    // status === "open" → nothing to do, check again next cycle
  } catch (err) {
    // Transient failure — apply exponential backoff before next attempt
    const current = retryBackoff.get(workflow.id) ?? 1;
    const next = Math.min(current * 2, MAX_RETRY_BACKOFF_MS);
    retryBackoff.set(workflow.id, next);

    console.warn(
      `[face] PR poll failed for workflow ${workflow.id} PR #${pr.number} (retry backoff ${next / 1000}s):`,
      (err as Error).message,
    );
  }
}

// ── Handlers ──────────────────────────────────────────────────────

async function handlePRMerged(
  workflow: WorkflowState,
  gh: GitHubProvider,
): Promise<void> {
  console.log(
    `[face] PR #${workflow.pr!.number} merged — auto-closing workflow ${workflow.id}`,
  );

  // 1. Update PR status on workflow
  const fresh = loadWorkflow(workflow.id);
  if (!fresh || fresh.phase !== "implementing") return;

  fresh.pr!.status = "merged";

  // 2. Mark linked task as completed (if still running)
  if (fresh.taskId) {
    const task = readTask(fresh.taskId);
    if (task && (task.status === "running" || task.status === "pending")) {
      task.status = "completed";
      task.result = `PR #${fresh.pr!.number} merged — auto-completed`;
      task.updatedAt = new Date().toISOString();
      writeTask(task);
      eventBus.emit("task-file-changed", {
        event: "change",
        filename: `${task.id}.json`,
      });
    }
  }

  // 3. Move workflow to done
  fresh.phase = "done";
  fresh.updatedAt = new Date().toISOString();
  saveWorkflow(fresh);

  // 4. Close the linked GitHub issue
  if (fresh.issueId) {
    try {
      await gh.updateIssue(fresh.issueId, { status: "done" });
      await gh.addComment(
        fresh.issueId,
        `PR #${fresh.pr!.number} has been merged. Implementation complete — closing automatically.`,
      );
    } catch (err) {
      console.error(
        `[face] Failed to close issue #${fresh.issueId}:`,
        (err as Error).message,
      );
    }
  }

  eventBus.emit("issue_updated", { workflowId: fresh.id });
}

async function handlePRClosedWithoutMerge(
  workflow: WorkflowState,
  gh: GitHubProvider,
): Promise<void> {
  console.warn(
    `[face] PR #${workflow.pr!.number} closed without merge — flagging workflow ${workflow.id} for review`,
  );

  const fresh = loadWorkflow(workflow.id);
  if (!fresh || fresh.phase !== "implementing") return;

  fresh.pr!.status = "closed";
  fresh.updatedAt = new Date().toISOString();
  saveWorkflow(fresh);

  // Comment on the issue so the team notices
  if (fresh.issueId) {
    try {
      await gh.addComment(
        fresh.issueId,
        `**Needs attention:** PR #${fresh.pr!.number} was closed without being merged. ` +
          `The implementation may need to be re-done or a new PR created.`,
      );
    } catch {
      // best-effort
    }
  }

  eventBus.emit("issue_updated", { workflowId: fresh.id });
}
