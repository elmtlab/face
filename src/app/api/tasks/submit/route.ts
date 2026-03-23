import { NextRequest, NextResponse } from "next/server";
import { submitTask } from "@/lib/tasks/runner";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, prompt, title, workingDirectory } = body;

  if (!agentId || !prompt) {
    return NextResponse.json(
      { error: "agentId and prompt are required" },
      { status: 400 }
    );
  }

  const result = await submitTask(agentId, prompt, {
    title,
    workingDirectory,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ taskId: result.taskId });
}
