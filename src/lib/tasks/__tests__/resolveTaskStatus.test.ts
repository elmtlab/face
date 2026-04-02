import { describe, test, expect } from "vitest";
import { resolveTaskStatus } from "../runner";
import type { FaceTask } from "../types";

function makeDiskTask(overrides: Partial<FaceTask> = {}): FaceTask {
  return {
    id: "task-1",
    agent: "claude-code",
    title: "Test task",
    status: "running",
    prompt: "do something",
    summary: null,
    workingDirectory: "/tmp",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [],
    activities: [],
    result: null,
    ...overrides,
  };
}

describe("resolveTaskStatus", () => {
  test("exit code 0 → completed", () => {
    const result = resolveTaskStatus(0, false, null);
    expect(result.status).toBe("completed");
  });

  test("non-zero exit code with no result → failed", () => {
    const result = resolveTaskStatus(1, false, null);
    expect(result.status).toBe("failed");
  });

  test("non-zero exit code but receivedResult → completed", () => {
    const result = resolveTaskStatus(1, true, null);
    expect(result.status).toBe("completed");
  });

  test("non-zero exit code but disk shows completed → completed (hook wins)", () => {
    const disk = makeDiskTask({
      status: "completed",
      result: "Hook result text",
      summary: "Hook summary",
    });
    const result = resolveTaskStatus(1, false, disk);
    expect(result.status).toBe("completed");
    expect(result.result).toBe("Hook result text");
    expect(result.summary).toBe("Hook summary");
  });

  test("disk completed takes priority even when receivedResult is false", () => {
    const disk = makeDiskTask({ status: "completed" });
    const result = resolveTaskStatus(2, false, disk);
    expect(result.status).toBe("completed");
  });

  test("disk still running + non-zero exit + no result → failed", () => {
    const disk = makeDiskTask({ status: "running" });
    const result = resolveTaskStatus(1, false, disk);
    expect(result.status).toBe("failed");
  });

  test("null exit code (signal kill) with result → completed", () => {
    const result = resolveTaskStatus(null, true, null);
    expect(result.status).toBe("completed");
  });

  test("null exit code without result → failed", () => {
    const result = resolveTaskStatus(null, false, null);
    expect(result.status).toBe("failed");
  });

  test("disk task is null (file deleted) + exit 0 → completed", () => {
    const result = resolveTaskStatus(0, false, null);
    expect(result.status).toBe("completed");
  });
});
