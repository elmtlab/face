import { NextRequest, NextResponse } from "next/server";
import { decideApproval } from "@/lib/hooks/tool-approval";

/**
 * POST — Called by the FACE UI to approve or reject a pending tool call.
 * Body: { decision: "approve" | "reject", reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const decision = body.decision === "reject" ? "reject" : "approve";
    const reason = body.reason ? String(body.reason) : undefined;

    const found = decideApproval(id, decision, reason);

    if (!found) {
      return NextResponse.json(
        { error: "Approval request not found or already decided" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, decision });
  } catch (err) {
    console.error("[face] Decision error:", err);
    return NextResponse.json(
      { error: "Failed to process decision" },
      { status: 500 }
    );
  }
}
