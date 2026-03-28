import { NextRequest, NextResponse } from "next/server";
import { readTask } from "@/lib/tasks/file-manager";
import { submitTask } from "@/lib/tasks/runner";

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

  const result = await submitTask(task.agent, task.prompt, {
    title,
    linkedIssue: task.linkedIssue,
    workingDirectory: task.workingDirectory,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    taskId: result.taskId,
    originalTaskId: taskId,
  });
}
