import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SyncReference } from "../types";

// Mock fs
const mockStore: { references: SyncReference[] } = { references: [] };
let tmpData = "";
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (path: string) => {
      if (path.includes("pm-sync-state.json")) return true;
      if (path.includes(".face")) return true;
      return actual.existsSync(path);
    },
    readFileSync: (path: string, encoding?: string) => {
      if (typeof path === "string" && path.includes("pm-sync-state.json")) {
        return JSON.stringify(mockStore);
      }
      return actual.readFileSync(path, encoding as BufferEncoding);
    },
    writeFileSync: (path: string, data: string) => {
      if (typeof path === "string" && path.includes(".tmp")) {
        tmpData = data;
        return;
      }
      if (typeof path === "string" && path.includes("pm-sync-state.json")) {
        Object.assign(mockStore, JSON.parse(data));
        return;
      }
    },
    renameSync: (_src: string, dest: string) => {
      if (dest.includes("pm-sync-state.json") && tmpData) {
        Object.assign(mockStore, JSON.parse(tmpData));
        tmpData = "";
      }
    },
    mkdirSync: () => {},
  };
});

import {
  getSyncReference,
  listSyncReferences,
  upsertSyncReference,
  updateSyncStatus,
  removeSyncReference,
  getFailedSyncReferences,
} from "../store";

describe("PM sync store", () => {
  beforeEach(() => {
    mockStore.references = [];
  });

  it("returns null for unknown faceId", () => {
    expect(getSyncReference("unknown")).toBeNull();
  });

  it("upserts and retrieves a sync reference", () => {
    const ref: SyncReference = {
      faceId: "proj-1",
      type: "project",
      status: "pending",
      retryCount: 0,
    };
    upsertSyncReference(ref);
    const retrieved = getSyncReference("proj-1");
    expect(retrieved).toEqual(ref);
  });

  it("updates existing reference on upsert", () => {
    upsertSyncReference({
      faceId: "proj-1",
      type: "project",
      status: "pending",
      retryCount: 0,
    });
    upsertSyncReference({
      faceId: "proj-1",
      type: "project",
      status: "synced",
      retryCount: 0,
      externalId: "ext-1",
    });

    const refs = listSyncReferences();
    expect(refs).toHaveLength(1);
    expect(refs[0].status).toBe("synced");
    expect(refs[0].externalId).toBe("ext-1");
  });

  it("updates sync status fields", () => {
    upsertSyncReference({
      faceId: "task-1",
      type: "task",
      status: "pending",
      retryCount: 0,
    });

    const updated = updateSyncStatus("task-1", {
      status: "synced",
      externalId: "ext-123",
      externalUrl: "https://linear.app/issue/ext-123",
      syncedAt: "2026-01-01T00:00:00Z",
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("synced");
    expect(updated!.externalUrl).toBe("https://linear.app/issue/ext-123");
  });

  it("returns null when updating non-existent reference", () => {
    expect(updateSyncStatus("nope", { status: "failed" })).toBeNull();
  });

  it("removes a sync reference", () => {
    upsertSyncReference({
      faceId: "proj-2",
      type: "project",
      status: "synced",
      retryCount: 0,
    });

    expect(removeSyncReference("proj-2")).toBe(true);
    expect(getSyncReference("proj-2")).toBeNull();
    expect(removeSyncReference("proj-2")).toBe(false);
  });

  it("lists references with filters", () => {
    upsertSyncReference({ faceId: "p1", type: "project", status: "synced", retryCount: 0 });
    upsertSyncReference({ faceId: "t1", type: "task", status: "failed", retryCount: 3 });
    upsertSyncReference({ faceId: "t2", type: "task", status: "synced", retryCount: 0 });

    expect(listSyncReferences({ type: "task" })).toHaveLength(2);
    expect(listSyncReferences({ status: "failed" })).toHaveLength(1);
    expect(listSyncReferences({ type: "project", status: "synced" })).toHaveLength(1);
  });

  it("getFailedSyncReferences returns only failed items", () => {
    upsertSyncReference({ faceId: "p1", type: "project", status: "synced", retryCount: 0 });
    upsertSyncReference({ faceId: "t1", type: "task", status: "failed", retryCount: 3, lastError: "timeout" });

    const failed = getFailedSyncReferences();
    expect(failed).toHaveLength(1);
    expect(failed[0].faceId).toBe("t1");
  });
});
