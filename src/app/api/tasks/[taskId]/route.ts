import { NextRequest, NextResponse } from "next/server";
import { readTask, writeTask, deleteTask } from "@/lib/tasks/file-manager";
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

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = readTask(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Only allow marking running tasks as failed (stale recovery)
  if (task.status !== "running") {
    return NextResponse.json(
      { error: "Task is not running" },
      { status: 400 }
    );
  }

  cancelTask(taskId);
  task.status = "failed";
  task.result = "Manually marked as failed (task appeared stale)";
  task.updatedAt = new Date().toISOString();
  writeTask(task);

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
