/**
 * PM sync state persistence.
 *
 * Tracks the sync status of each FACE project and task relative to
 * the configured PM tool. Stored as JSON in ~/.face/pm-sync-state.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SyncReference, SyncStatus } from "./types";

// ── Persistence ───────────────────────────────────────────────────

const FACE_DIR = join(homedir(), ".face");
const STORE_PATH = join(FACE_DIR, "pm-sync-state.json");

interface SyncStore {
  references: SyncReference[];
}

function ensureDir() {
  if (!existsSync(FACE_DIR)) mkdirSync(FACE_DIR, { recursive: true });
}

function readStore(): SyncStore {
  ensureDir();
  if (!existsSync(STORE_PATH)) return { references: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { references: [] };
  }
}

function writeStore(store: SyncStore) {
  ensureDir();
  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2));
  try {
    renameSync(tmpPath, STORE_PATH);
  } catch {
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  }
}

// ── CRUD ──────────────────────────────────────────────────────────

export function getSyncReference(faceId: string): SyncReference | null {
  const store = readStore();
  return store.references.find((r) => r.faceId === faceId) ?? null;
}

export function listSyncReferences(filter?: {
  status?: SyncStatus;
  type?: "project" | "task";
}): SyncReference[] {
  const store = readStore();
  let refs = store.references;
  if (filter?.status) refs = refs.filter((r) => r.status === filter.status);
  if (filter?.type) refs = refs.filter((r) => r.type === filter.type);
  return refs;
}

export function upsertSyncReference(ref: SyncReference): void {
  const store = readStore();
  const idx = store.references.findIndex((r) => r.faceId === ref.faceId);
  if (idx >= 0) {
    store.references[idx] = ref;
  } else {
    store.references.push(ref);
  }
  writeStore(store);
}

export function updateSyncStatus(
  faceId: string,
  updates: Partial<Pick<SyncReference, "status" | "externalId" | "externalUrl" | "lastError" | "retryCount" | "lastAttemptAt" | "syncedAt">>,
): SyncReference | null {
  const store = readStore();
  const ref = store.references.find((r) => r.faceId === faceId);
  if (!ref) return null;

  Object.assign(ref, updates);
  writeStore(store);
  return ref;
}

export function removeSyncReference(faceId: string): boolean {
  const store = readStore();
  const idx = store.references.findIndex((r) => r.faceId === faceId);
  if (idx === -1) return false;
  store.references.splice(idx, 1);
  writeStore(store);
  return true;
}

/** Get all failed sync references that can be retried */
export function getFailedSyncReferences(): SyncReference[] {
  return listSyncReferences({ status: "failed" });
}
