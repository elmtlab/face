import { NextRequest, NextResponse } from "next/server";
import {
  logUnreviewedAction,
  getUnreviewedActions,
  clearUnreviewedActions,
} from "@/lib/hooks/tool-approval";

/**
 * POST — Called by the hook script when the FACE server was unreachable
 * during the initial approval request but becomes reachable later
 * (or as a best-effort log from the fallback path).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    logUnreviewedAction(
      {
        id: `unreviewed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: String(body.session_id ?? body.sessionId ?? "unknown"),
        toolName: String(body.tool_name ?? body.toolName ?? "unknown"),
        toolInput:
          typeof body.tool_input === "object" && body.tool_input !== null
            ? body.tool_input
            : {},
        cwd: body.cwd ? String(body.cwd) : undefined,
      },
      "server_unreachable"
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[face] Unreviewed log error:", err);
    return NextResponse.json(
      { error: "Failed to log unreviewed action" },
      { status: 500 }
    );
  }
}

/**
 * GET — Returns all logged unreviewed actions.
 */
export async function GET() {
  return NextResponse.json({ actions: getUnreviewedActions() });
}

/**
 * DELETE — Clears the unreviewed actions log after acknowledgment.
 */
export async function DELETE() {
  clearUnreviewedActions();
  return NextResponse.json({ ok: true });
}
