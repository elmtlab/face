import { NextRequest, NextResponse } from "next/server";
import { readTask } from "@/lib/tasks/file-manager";
import { submitTask } from "@/lib/tasks/runner";
import { resolveWorkingDirectory } from "@/lib/project/repo-manager";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = readTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "failed" && task.status !== "cancelled") {
    return NextResponse.json(
      { error: "Only failed or cancelled tasks can be restarted" },
      { status: 400 }
    );
  }

  const title = task.title.startsWith("Retry: ")
    ? task.title
    : `Retry: ${task.title}`;

  // Re-resolve working directory from project repo if applicable.
  // The original worktree may have been cleaned up after failure.
  let workingDirectory = task.workingDirectory;
  if (task.projectId) {
    try {
      const storyId = `retry-${Date.now().toString(36)}`;
      const worktree = resolveWorkingDirectory(task.projectId, storyId, title);
      if (worktree.clonePath) {
        workingDirectory = worktree.workingDirectory;
      }
    } catch {
      // Fall back to original working directory
    }
  }

  const result = await submitTask(task.agent, task.prompt, {
    title,
    linkedIssue: task.linkedIssue,
    workingDirectory,
    projectId: task.projectId,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    taskId: result.taskId,
    originalTaskId: taskId,
  });
}
