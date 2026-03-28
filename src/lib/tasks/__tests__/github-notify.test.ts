import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FaceTask } from "../types";

vi.mock("@/lib/project/manager", () => ({
  getActiveProvider: vi.fn(),
}));

import { getActiveProvider } from "@/lib/project/manager";
import { postCompletionComment } from "../github-notify";

const mockedGetActiveProvider = vi.mocked(getActiveProvider);

function buildTask(overrides: Partial<FaceTask> = {}): FaceTask {
  return {
    id: "task-1",
    agent: "claude-code",
    title: "Test task",
    status: "completed",
    prompt: "Do something",
    summary: "Did something",
    workingDirectory: "/tmp",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    activities: [],
    result: null,
    linkedIssue: 42,
    ...overrides,
  };
}

describe("postCompletionComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update issue status to done when task completes", async () => {
    const addComment = vi.fn().mockResolvedValue(undefined);
    const updateIssue = vi.fn().mockResolvedValue(undefined);
    mockedGetActiveProvider.mockResolvedValue({
      addComment,
      updateIssue,
    } as any);

    const task = buildTask({ status: "completed" });
    await postCompletionComment(task);

    expect(updateIssue).toHaveBeenCalledWith("42", { status: "done" });
  });

  it("should post a comment with task result", async () => {
    const addComment = vi.fn().mockResolvedValue(undefined);
    const updateIssue = vi.fn().mockResolvedValue(undefined);
    mockedGetActiveProvider.mockResolvedValue({
      addComment,
      updateIssue,
    } as any);

    const task = buildTask({ status: "completed" });
    await postCompletionComment(task);

    expect(addComment).toHaveBeenCalledTimes(1);
    expect(addComment).toHaveBeenCalledWith("42", expect.stringContaining("Agent Task Summary"));
  });

  it("should not update issue status when task fails", async () => {
    const addComment = vi.fn().mockResolvedValue(undefined);
    const updateIssue = vi.fn().mockResolvedValue(undefined);
    mockedGetActiveProvider.mockResolvedValue({
      addComment,
      updateIssue,
    } as any);

    const task = buildTask({ status: "failed", result: "Something went wrong" });
    await postCompletionComment(task);

    expect(addComment).toHaveBeenCalledTimes(1);
    expect(updateIssue).not.toHaveBeenCalled();
  });

  it("should not throw when provider is null", async () => {
    mockedGetActiveProvider.mockResolvedValue(null as any);

    const task = buildTask({ status: "completed" });
    await expect(postCompletionComment(task)).resolves.toBeUndefined();
  });

  it("should not throw when addComment fails", async () => {
    const addComment = vi.fn().mockRejectedValue(new Error("API error"));
    mockedGetActiveProvider.mockResolvedValue({
      addComment,
    } as any);

    const task = buildTask({ status: "completed" });
    await expect(postCompletionComment(task)).resolves.toBeUndefined();
  });

  it("should skip if task has no linkedIssue", async () => {
    mockedGetActiveProvider.mockResolvedValue({
      addComment: vi.fn(),
      updateIssue: vi.fn(),
    } as any);

    const task = buildTask({ linkedIssue: undefined });
    await postCompletionComment(task);

    expect(mockedGetActiveProvider).not.toHaveBeenCalled();
  });
});
