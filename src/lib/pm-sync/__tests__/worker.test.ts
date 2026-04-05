import { describe, it, expect, vi, beforeEach } from "vitest";

// Must use vi.hoisted to make mockProvider available inside vi.mock factories
const mockProvider = vi.hoisted(() => ({
  type: "test",
  displayName: "Test",
  connect: vi.fn(),
  testConnection: vi.fn().mockResolvedValue({ ok: true }),
  createProject: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("../manager", () => ({
  getActivePMSyncProvider: vi.fn().mockResolvedValue(mockProvider),
  getActivePMSyncProviderName: vi.fn().mockReturnValue("test"),
  registerPMSyncProvider: vi.fn(),
}));

// Mock the store
const storeData = new Map<string, Record<string, unknown>>();
vi.mock("../store", () => ({
  getSyncReference: vi.fn((id: string) => storeData.get(id) ?? null),
  upsertSyncReference: vi.fn((ref: Record<string, unknown>) => {
    storeData.set(ref.faceId as string, ref);
  }),
  updateSyncStatus: vi.fn((id: string, updates: Record<string, unknown>) => {
    const existing = storeData.get(id) ?? {};
    const updated = { ...existing, ...updates };
    storeData.set(id, updated);
    return updated;
  }),
}));

// Mock event bus
vi.mock("../../events/bus", () => ({
  eventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import { syncProject, syncTask } from "../worker";
import { eventBus } from "../../events/bus";

describe("PM sync worker", () => {
  beforeEach(() => {
    storeData.clear();
    vi.clearAllMocks();
  });

  it("syncs a project successfully", async () => {
    mockProvider.createProject.mockResolvedValueOnce({
      ok: true,
      externalId: "ext-proj-1",
      externalUrl: "https://linear.app/project/ext-proj-1",
    });

    syncProject({ faceId: "proj-1", name: "My Project" });

    // Wait for async processing
    await vi.waitFor(() => {
      expect(mockProvider.createProject).toHaveBeenCalledWith({
        faceId: "proj-1",
        name: "My Project",
      });
    });

    await vi.waitFor(() => {
      expect(eventBus.emit).toHaveBeenCalledWith("pm_sync_completed", expect.objectContaining({
        faceId: "proj-1",
        type: "project",
      }));
    });
  });

  it("syncs a task successfully", async () => {
    mockProvider.createTask.mockResolvedValueOnce({
      ok: true,
      externalId: "ext-task-1",
      externalUrl: "https://linear.app/issue/ext-task-1",
    });

    syncTask({
      faceId: "task-1",
      externalProjectId: "ext-proj-1",
      title: "Implement feature",
      description: "A test task",
      priority: "high",
    });

    await vi.waitFor(() => {
      expect(mockProvider.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          faceId: "task-1",
          title: "Implement feature",
        }),
      );
    });

    await vi.waitFor(() => {
      expect(eventBus.emit).toHaveBeenCalledWith("pm_sync_completed", expect.objectContaining({
        faceId: "task-1",
        type: "task",
      }));
    });
  });

  it("retries on failure and emits pm_sync_failed after max retries", async () => {
    mockProvider.createProject
      .mockResolvedValueOnce({ ok: false, error: "timeout" })
      .mockResolvedValueOnce({ ok: false, error: "timeout" })
      .mockResolvedValueOnce({ ok: false, error: "timeout" });

    syncProject({ faceId: "proj-fail", name: "Failing Project" });

    await vi.waitFor(
      () => {
        expect(mockProvider.createProject).toHaveBeenCalledTimes(3);
      },
      { timeout: 15000 },
    );

    await vi.waitFor(() => {
      expect(eventBus.emit).toHaveBeenCalledWith("pm_sync_failed", expect.objectContaining({
        faceId: "proj-fail",
        error: "timeout",
      }));
    });
  }, 20000);

  it("succeeds on second retry", async () => {
    mockProvider.createProject
      .mockResolvedValueOnce({ ok: false, error: "temporary" })
      .mockResolvedValueOnce({
        ok: true,
        externalId: "ext-2",
        externalUrl: "https://linear.app/project/ext-2",
      });

    syncProject({ faceId: "proj-retry", name: "Retry Project" });

    await vi.waitFor(
      () => {
        expect(mockProvider.createProject).toHaveBeenCalledTimes(2);
      },
      { timeout: 10000 },
    );

    await vi.waitFor(() => {
      expect(eventBus.emit).toHaveBeenCalledWith("pm_sync_completed", expect.objectContaining({
        faceId: "proj-retry",
        type: "project",
      }));
    });
  }, 15000);
});
