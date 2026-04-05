import { NextRequest, NextResponse } from "next/server";
import { getContentById, updateContent } from "@/lib/listener/storage";
import { runPublishStage } from "@/lib/listener/scheduler";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const { contentId } = await params;
  const content = getContentById(contentId);
  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }
  return NextResponse.json({ content });
}

/**
 * PUT updates content status (approve/reject/edit).
 *
 * Body: { action: "approve" | "reject" | "edit", editedBody?: string, rejectionReason?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const { contentId } = await params;
  const content = getContentById(contentId);
  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, editedBody, rejectionReason } = body as {
    action: string;
    editedBody?: string;
    rejectionReason?: string;
  };

  switch (action) {
    case "approve": {
      const updated = updateContent(contentId, {
        status: "approved",
        editedBody: editedBody ?? content.editedBody,
        reviewedBy: "user",
      });
      // Try to publish immediately
      void runPublishStage();
      return NextResponse.json({ ok: true, content: updated });
    }
    case "reject": {
      const updated = updateContent(contentId, {
        status: "rejected",
        rejectionReason: rejectionReason ?? "Rejected by user",
        reviewedBy: "user",
      });
      return NextResponse.json({ ok: true, content: updated });
    }
    case "edit": {
      if (!editedBody) {
        return NextResponse.json(
          { error: "editedBody is required for edit action" },
          { status: 400 },
        );
      }
      const updated = updateContent(contentId, {
        editedBody,
        status: "pending_review",
      });
      return NextResponse.json({ ok: true, content: updated });
    }
    default:
      return NextResponse.json(
        { error: "Invalid action. Use: approve, reject, edit" },
        { status: 400 },
      );
  }
}
