import { NextRequest, NextResponse } from "next/server";
import { readTask } from "@/lib/tasks/file-manager";
import { submitTask, generateTaskId } from "@/lib/tasks/runner";
import { createWorktree } from "@/lib/git/worktree";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId: originalTaskId } = await params;
  const task = readTask(originalTaskId);

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

  // Create a fresh worktree — the old one was cleaned up on failure
  const taskId = generateTaskId();
  let worktreePath: string;
  try {
    worktreePath = createWorktree(process.cwd(), taskId);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to create worktree: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  const result = await submitTask(task.agent, task.prompt, {
    taskId,
    title,
    workingDirectory: worktreePath,
    worktreePath,
    linkedIssue: task.linkedIssue,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    taskId: result.taskId,
    originalTaskId,
  });
}
