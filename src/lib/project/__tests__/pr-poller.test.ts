import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../workflow", () => ({
  listWorkflows: vi.fn(),
  loadWorkflow: vi.fn(),
  saveWorkflow: vi.fn(),
}));

vi.mock("../manager", () => ({
  getActiveProvider: vi.fn(),
}));

vi.mock("../../tasks/file-manager", () => ({
  readTask: vi.fn(),
  writeTask: vi.fn(),
}));

vi.mock("../../events/bus", () => ({
  eventBus: { emit: vi.fn() },
}));

import {
  startPRPoller,
  stopPRPoller,
  pollNow,
} from "../pr-poller";
import { listWorkflows, loadWorkflow, saveWorkflow } from "../workflow";
import { getActiveProvider } from "../manager";
import { readTask } from "../../tasks/file-manager";

const mockedListWorkflows = vi.mocked(listWorkflows);
const mockedLoadWorkflow = vi.mocked(loadWorkflow);
const mockedSaveWorkflow = vi.mocked(saveWorkflow);
const mockedGetActiveProvider = vi.mocked(getActiveProvider);
const mockedReadTask = vi.mocked(readTask);

function buildWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-test-1",
    phase: "implementing",
    messages: [],
    generatedStory: null,
    issueId: "42",
    issueUrl: "https://github.com/test/repo/issues/42",
    taskId: "task-1",
    pr: {
      number: 99,
      url: "https://github.com/test/repo/pull/99",
      repo: "test/repo",
      branch: "feature-branch",
      status: "open",
    },
    creatorRole: null,
    assignedRoles: [],
    projectId: "proj-1",
    revisions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockGitHubProvider(prStatus: "open" | "merged" | "closed" = "open") {
  return {
    type: "github" as const,
    getPRStatus: vi.fn().mockResolvedValue(prStatus),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue(undefined),
  };
}

describe("PR poller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopPRPoller();
  });

  afterEach(() => {
    stopPRPoller();
  });

  describe("null provider handling", () => {
    it("logs a warning when getActiveProvider returns null", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockedGetActiveProvider.mockResolvedValue(null);
      mockedListWorkflows.mockReturnValue([buildWorkflow()] as any);

      const result = await pollNow();

      expect(result).toEqual({ polled: 0, transitioned: 0, errors: [] });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("getActiveProvider() returned null"),
      );
      warnSpy.mockRestore();
    });

    it("logs a warning when provider is not github", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockedGetActiveProvider.mockResolvedValue({ type: "linear" } as any);
      mockedListWorkflows.mockReturnValue([buildWorkflow()] as any);

      const result = await pollNow();

      expect(result).toEqual({ polled: 0, transitioned: 0, errors: [] });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not github"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("catch-up poll", () => {
    it("checks all implementing workflows regardless of pr.status", async () => {
      const gh = mockGitHubProvider("merged");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      // Workflow with pr.status still "open" in local JSON (missed merge)
      const wf = buildWorkflow({ pr: { number: 99, url: "", repo: "t/r", branch: "b", status: "open" } });
      mockedListWorkflows.mockReturnValue([wf] as any);

      // loadWorkflow returns the fresh state for handlePRMerged
      const freshWf = buildWorkflow({ pr: { number: 99, url: "", repo: "t/r", branch: "b", status: "open" } });
      mockedLoadWorkflow.mockReturnValue(freshWf as any);
      mockedReadTask.mockReturnValue({ id: "task-1", status: "running", result: null, updatedAt: "" } as any);

      // After merge handling, loadWorkflow returns done state for the transition check
      mockedLoadWorkflow
        .mockReturnValueOnce(freshWf as any) // for handlePRMerged
        .mockReturnValueOnce({ ...freshWf, phase: "done" } as any); // for transition check

      const result = await pollNow();

      expect(result.polled).toBe(1);
      expect(result.transitioned).toBe(1);
      expect(gh.getPRStatus).toHaveBeenCalledWith(99);
      expect(mockedSaveWorkflow).toHaveBeenCalled();
    });

    it("detects merged PRs even when local status is still open", async () => {
      const gh = mockGitHubProvider("merged");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow();
      mockedListWorkflows.mockReturnValue([wf] as any);

      const freshWf = buildWorkflow();
      mockedLoadWorkflow
        .mockReturnValueOnce(freshWf as any)
        .mockReturnValueOnce({ ...freshWf, phase: "done" } as any);
      mockedReadTask.mockReturnValue(null);

      const result = await pollNow();

      expect(result.transitioned).toBe(1);
      // Verify the PR was marked as merged and workflow moved to done
      expect(mockedSaveWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "done",
          pr: expect.objectContaining({ status: "merged" }),
        }),
      );
    });
  });

  describe("pollNow", () => {
    it("clears backoff and polls all implementing workflows", async () => {
      const gh = mockGitHubProvider("open");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow();
      mockedListWorkflows.mockReturnValue([wf] as any);
      mockedLoadWorkflow.mockReturnValue(wf as any);

      const result = await pollNow();

      expect(result.polled).toBe(1);
      expect(result.transitioned).toBe(0);
      expect(gh.getPRStatus).toHaveBeenCalledWith(99);
    });

    it("returns zero counts when no implementing workflows exist", async () => {
      const gh = mockGitHubProvider("open");
      mockedGetActiveProvider.mockResolvedValue(gh as any);
      mockedListWorkflows.mockReturnValue([]);

      const result = await pollNow();

      expect(result).toEqual({ polled: 0, transitioned: 0, errors: [] });
      expect(gh.getPRStatus).not.toHaveBeenCalled();
    });

    it("surfaces errors from failed polls", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const gh = mockGitHubProvider("open");
      gh.getPRStatus.mockRejectedValue(new Error("GitHub API 502: Bad Gateway"));
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow();
      mockedListWorkflows.mockReturnValue([wf] as any);
      mockedLoadWorkflow.mockReturnValue(wf as any);

      const result = await pollNow();

      expect(result.polled).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        workflowId: "wf-test-1",
        error: "GitHub API 502: Bad Gateway",
      });
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("PR poll failed"),
        expect.stringContaining("502"),
      );

      errSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe("handlePRMerged", () => {
    it("marks task as completed when PR is merged", async () => {
      const gh = mockGitHubProvider("merged");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow();
      mockedListWorkflows.mockReturnValue([wf] as any);

      const task = { id: "task-1", status: "running", result: null, updatedAt: "" };
      mockedReadTask.mockReturnValue(task as any);

      const freshWf = buildWorkflow();
      mockedLoadWorkflow
        .mockReturnValueOnce(freshWf as any)
        .mockReturnValueOnce({ ...freshWf, phase: "done" } as any);

      await pollNow();

      expect(task.status).toBe("completed");
      expect(task.result).toContain("merged");
    });

    it("closes the linked GitHub issue", async () => {
      const gh = mockGitHubProvider("merged");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow({ issueId: "42" });
      mockedListWorkflows.mockReturnValue([wf] as any);

      const freshWf = buildWorkflow({ issueId: "42" });
      mockedLoadWorkflow
        .mockReturnValueOnce(freshWf as any)
        .mockReturnValueOnce({ ...freshWf, phase: "done" } as any);
      mockedReadTask.mockReturnValue(null);

      await pollNow();

      expect(gh.updateIssue).toHaveBeenCalledWith("42", { status: "done" });
      expect(gh.addComment).toHaveBeenCalledWith(
        "42",
        expect.stringContaining("merged"),
      );
    });
  });

  describe("handlePRMerged edge cases", () => {
    it("logs error when workflow cannot be loaded during merge handling", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const gh = mockGitHubProvider("merged");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow();
      mockedListWorkflows.mockReturnValue([wf] as any);

      // loadWorkflow returns null (corrupt/deleted file)
      mockedLoadWorkflow
        .mockReturnValueOnce(null) // for handlePRMerged
        .mockReturnValueOnce(null); // for transition check in catchUpPoll

      await pollNow();

      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not be loaded"),
      );

      errSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("logs warning when workflow phase is not implementing during merge", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const gh = mockGitHubProvider("merged");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow();
      mockedListWorkflows.mockReturnValue([wf] as any);

      // loadWorkflow returns a workflow already in "done" phase
      const doneWf = buildWorkflow({ phase: "done" });
      mockedLoadWorkflow
        .mockReturnValueOnce(doneWf as any) // for handlePRMerged
        .mockReturnValueOnce(doneWf as any); // for transition check

      await pollNow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not "implementing"'),
      );

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe("handlePRClosedWithoutMerge", () => {
    it("flags the workflow and comments on the issue", async () => {
      const gh = mockGitHubProvider("closed");
      mockedGetActiveProvider.mockResolvedValue(gh as any);

      const wf = buildWorkflow({ issueId: "42" });
      mockedListWorkflows.mockReturnValue([wf] as any);

      const freshWf = buildWorkflow({ issueId: "42" });
      mockedLoadWorkflow
        .mockReturnValueOnce(freshWf as any)
        .mockReturnValueOnce(freshWf as any);

      await pollNow();

      expect(mockedSaveWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          pr: expect.objectContaining({ status: "closed" }),
        }),
      );
      expect(gh.addComment).toHaveBeenCalledWith(
        "42",
        expect.stringContaining("closed without being merged"),
      );
    });
  });

  describe("startPRPoller", () => {
    it("clears backoff state on startup", async () => {
      // Suppress console logs during this test
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});

      mockedGetActiveProvider.mockResolvedValue(null);
      mockedListWorkflows.mockReturnValue([]);

      // Start poller — it should clear backoff and run catch-up
      startPRPoller(30_000);

      // Wait for the async catch-up poll to complete
      await new Promise((r) => setTimeout(r, 50));

      // Verify it attempted to poll (provider was checked)
      expect(mockedGetActiveProvider).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
