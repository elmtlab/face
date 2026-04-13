import { NextRequest, NextResponse } from "next/server";
import {
  submitApproval,
  listPendingApprovals,
  type ToolApprovalRequest,
} from "@/lib/hooks/tool-approval";

/**
 * POST — Called by the PreToolUse hook script.
 * Registers a pending approval and long-polls until a human decides or timeout.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const sessionId = String(body.session_id ?? body.sessionId ?? "unknown");
    const toolName = String(body.tool_name ?? body.toolName ?? "unknown");
    const toolInput =
      typeof body.tool_input === "object" && body.tool_input !== null
        ? body.tool_input
        : {};

    const approvalRequest: ToolApprovalRequest = {
      id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      toolName,
      toolInput,
      cwd: body.cwd ? String(body.cwd) : undefined,
      createdAt: new Date().toISOString(),
    };

    // This blocks until a human decides or the timeout fires
    const result = await submitApproval(approvalRequest);

    return NextResponse.json({
      decision: result.decision,
      reason: result.reason,
    });
  } catch (err) {
    console.error("[face] Tool approval error:", err);
    // On any error, auto-approve so we don't block the user
    return NextResponse.json({ decision: "approve", reason: "server_error" });
  }
}

/**
 * GET — Returns the list of currently pending approval requests (for the UI).
 */
export async function GET() {
  return NextResponse.json({ pending: listPendingApprovals() });
}
