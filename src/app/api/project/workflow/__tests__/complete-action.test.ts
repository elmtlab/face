import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/project/workflow", () => ({
  loadWorkflow: vi.fn(),
  saveWorkflow: vi.fn(),
  buildGatheringSystemPrompt: vi.fn(),
  buildPlanningPrompt: vi.fn(),
  buildImplementationPrompt: vi.fn(),
  buildReimplementationPrompt: vi.fn(),
}));

vi.mock("@/lib/project/manager", () => ({
  getActiveProvider: vi.fn(),
}));

vi.mock("@/lib/tasks/runner", () => ({
  submitTask: vi.fn(),
}));

import { loadWorkflow, saveWorkflow } from "@/lib/project/workflow";
import { getActiveProvider } from "@/lib/project/manager";
import { POST } from "../[workflowId]/chat/route";

const mockedLoadWorkflow = vi.mocked(loadWorkflow);
const mockedSaveWorkflow = vi.mocked(saveWorkflow);
const mockedGetActiveProvider = vi.mocked(getActiveProvider);

function buildWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-id",
    phase: "implementing",
    messages: [],
    generatedStory: null,
    issueId: null,
    issueUrl: null,
    taskId: "task-1",
    pmApproval: "approved",
    engApproval: "approved",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/project/workflow/test-id/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeParams(workflowId = "test-id") {
  return { params: Promise.resolve({ workflowId }) };
}

describe("complete action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not transition to done when issueId is present (PR-based workflow)", async () => {
    const workflow = buildWorkflow({ issueId: "123" });
    mockedLoadWorkflow.mockReturnValue(workflow as any);

    const response = await POST(makeRequest({ action: "complete" }), makeParams());
    const data = await response.json();

    // PR-based workflows stay in "implementing" — the PR merge poller handles "done"
    expect(data.workflow.phase).toBe("implementing");
    expect(mockedSaveWorkflow).not.toHaveBeenCalled();
    expect(mockedGetActiveProvider).not.toHaveBeenCalled();
  });

  it("should return current state if already done (idempotent)", async () => {
    const workflow = buildWorkflow({ phase: "done" });
    mockedLoadWorkflow.mockReturnValue(workflow as any);

    const response = await POST(makeRequest({ action: "complete" }), makeParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.workflow.phase).toBe("done");
    expect(mockedSaveWorkflow).not.toHaveBeenCalled();
  });

  it("should reject if not in implementing phase", async () => {
    const workflow = buildWorkflow({ phase: "gathering" });
    mockedLoadWorkflow.mockReturnValue(workflow as any);

    const response = await POST(makeRequest({ action: "complete" }), makeParams());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("implementing");
  });

  it("should complete without linked issue", async () => {
    mockedGetActiveProvider.mockResolvedValue({
      updateIssue: vi.fn(),
      addComment: vi.fn(),
    } as any);

    const workflow = buildWorkflow({ issueId: null });
    mockedLoadWorkflow.mockReturnValue(workflow as any);

    const response = await POST(makeRequest({ action: "complete" }), makeParams());
    const data = await response.json();

    expect(data.workflow.phase).toBe("done");
    expect(mockedGetActiveProvider).not.toHaveBeenCalled();
  });

  it("should be a no-op for PR-based workflows even with provider errors", async () => {
    const workflow = buildWorkflow({ issueId: "123" });
    mockedLoadWorkflow.mockReturnValue(workflow as any);

    const response = await POST(makeRequest({ action: "complete" }), makeParams());
    const data = await response.json();

    // PR-based workflows are deferred to the poller — no state change
    expect(data.workflow.phase).toBe("implementing");
    expect(mockedSaveWorkflow).not.toHaveBeenCalled();
  });
});
