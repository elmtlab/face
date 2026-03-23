import { NextResponse } from "next/server";
import { readAllTasks } from "@/lib/tasks/file-manager";

export async function GET() {
  const tasks = readAllTasks();
  return NextResponse.json(tasks);
}
