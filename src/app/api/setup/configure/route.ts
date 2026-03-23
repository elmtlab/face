import { NextRequest, NextResponse } from "next/server";
import { setupClaudeCode } from "@/lib/agents/setup";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const agentId = body.agentId;

  if (agentId === "claude-code") {
    const result = await setupClaudeCode();
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { success: false, message: `Setup for "${agentId}" not yet supported.` },
    { status: 400 }
  );
}
