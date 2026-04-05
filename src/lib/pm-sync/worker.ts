/**
 * Background PM sync worker.
 *
 * Processes sync jobs asynchronously with exponential backoff retry.
 * Emits events on the global event bus for UI notification on final failure.
 */

import { eventBus } from "../events/bus";
import { getActivePMSyncProvider } from "./manager";
import {
  getSyncReference,
  upsertSyncReference,
  updateSyncStatus,
} from "./store";
import type {
  PMProjectInput,
  PMTaskInput,
} from "./types";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s with exponential backoff

// In-flight jobs tracked to prevent duplicate submissions
const pendingJobs = new Set<string>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enqueue a project sync. Creates or updates the sync reference and
 * processes it in the background with retry logic.
 */
export function syncProject(input: PMProjectInput): void {
  const faceId = input.faceId;
  if (pendingJobs.has(faceId)) return;

  // Initialize or reset sync reference
  const existing = getSyncReference(faceId);
  upsertSyncReference({
    faceId,
    type: "project",
    status: "pending",
    retryCount: existing?.retryCount ?? 0,
    externalId: existing?.externalId,
    externalUrl: existing?.externalUrl,
  });

  pendingJobs.add(faceId);
  processProjectSync(input).finally(() => pendingJobs.delete(faceId));
}

/**
 * Enqueue a task sync. Creates or updates the sync reference and
 * processes it in the background with retry logic.
 */
export function syncTask(input: PMTaskInput): void {
  const faceId = input.faceId;
  if (pendingJobs.has(faceId)) return;

  const existing = getSyncReference(faceId);
  upsertSyncReference({
    faceId,
    type: "task",
    status: "pending",
    retryCount: existing?.retryCount ?? 0,
    externalId: existing?.externalId,
    externalUrl: existing?.externalUrl,
  });

  pendingJobs.add(faceId);
  processTaskSync(input).finally(() => pendingJobs.delete(faceId));
}

/**
 * Retry all failed sync items. Called from the manual retry UI.
 * Returns the number of items queued for retry.
 */
export function retryFailed(faceId: string): boolean {
  const ref = getSyncReference(faceId);
  if (!ref || ref.status !== "failed") return false;

  // Reset retry count and re-enqueue
  updateSyncStatus(faceId, { status: "pending", retryCount: 0, lastError: undefined });

  // We need the original input to retry — emit an event so the
  // caller can re-submit with full input data
  eventBus.emit("pm_sync_retry_requested", { faceId, type: ref.type });
  return true;
}

// ── Internal processing ───────────────────────────────────────────

async function processProjectSync(input: PMProjectInput): Promise<void> {
  const faceId = input.faceId;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    updateSyncStatus(faceId, {
      status: "syncing",
      retryCount: attempt,
      lastAttemptAt: new Date().toISOString(),
    });

    const provider = await getActivePMSyncProvider();
    if (!provider) {
      markFailed(faceId, "No PM sync provider configured");
      return;
    }

    const result = await provider.createProject(input);

    if (result.ok) {
      updateSyncStatus(faceId, {
        status: "synced",
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        syncedAt: new Date().toISOString(),
        lastError: undefined,
      });
      eventBus.emit("pm_sync_completed", { faceId, type: "project", externalUrl: result.externalUrl });
      return;
    }

    // Failed — update error and retry after backoff
    updateSyncStatus(faceId, { lastError: result.error });

    if (attempt < MAX_RETRIES - 1) {
      await delay(BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  // All retries exhausted
  markFailed(faceId, getSyncReference(faceId)?.lastError ?? "Unknown error");
}

async function processTaskSync(input: PMTaskInput): Promise<void> {
  const faceId = input.faceId;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    updateSyncStatus(faceId, {
      status: "syncing",
      retryCount: attempt,
      lastAttemptAt: new Date().toISOString(),
    });

    const provider = await getActivePMSyncProvider();
    if (!provider) {
      markFailed(faceId, "No PM sync provider configured");
      return;
    }

    const result = await provider.createTask(input);

    if (result.ok) {
      updateSyncStatus(faceId, {
        status: "synced",
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        syncedAt: new Date().toISOString(),
        lastError: undefined,
      });
      eventBus.emit("pm_sync_completed", { faceId, type: "task", externalUrl: result.externalUrl });
      return;
    }

    updateSyncStatus(faceId, { lastError: result.error });

    if (attempt < MAX_RETRIES - 1) {
      await delay(BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  markFailed(faceId, getSyncReference(faceId)?.lastError ?? "Unknown error");
}

function markFailed(faceId: string, error: string): void {
  const ref = updateSyncStatus(faceId, {
    status: "failed",
    retryCount: MAX_RETRIES,
    lastError: error,
  });

  eventBus.emit("pm_sync_failed", {
    faceId,
    type: ref?.type ?? "unknown",
    error,
  });
}
