import { NextRequest, NextResponse } from "next/server";
import { readTask, deleteTask } from "@/lib/tasks/file-manager";
import { cancelTask } from "@/lib/tasks/runner";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = readTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = readTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Stop the process if running
  if (task.status === "running") {
    cancelTask(taskId);
  }

  deleteTask(taskId);
  return NextResponse.json({ ok: true });
}
