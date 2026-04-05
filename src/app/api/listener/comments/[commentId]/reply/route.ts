import { NextRequest, NextResponse } from "next/server";
import { getComments, updateComment, getContentById } from "@/lib/listener/storage";
import { createPlatformAdapter } from "@/lib/listener/registry";
import { getListenerState } from "@/lib/listener/storage";
import { generateReplyForComment } from "@/lib/listener/content-generator";

// Ensure adapter is registered
import "@/lib/listener/adapters/twitter";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  const comment = getComments().find((c) => c.id === commentId);
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let replyBody = body.body as string | undefined;
  const generateAI = body.generateAI as boolean | undefined;

  // If user wants an AI-generated reply
  if (generateAI && !replyBody) {
    const content = getContentById(comment.contentId);
    const originalBody = content?.editedBody ?? content?.body ?? "";
    replyBody = await generateReplyForComment(comment.body, originalBody);
    // Return the draft for review instead of posting directly
    return NextResponse.json({ ok: true, draft: replyBody });
  }

  if (!replyBody) {
    return NextResponse.json(
      { error: "body is required (or set generateAI: true for a draft)" },
      { status: 400 },
    );
  }

  // Post the reply via the platform adapter
  const state = getListenerState();
  const adapterConfig = state.adapters.find(
    (a) => a.type === comment.platform && a.enabled,
  );

  if (!adapterConfig) {
    return NextResponse.json(
      { error: `No configured adapter for platform: ${comment.platform}` },
      { status: 400 },
    );
  }

  try {
    const adapter = createPlatformAdapter(adapterConfig);
    await adapter.connect(adapterConfig);

    const result = await adapter.postReply(
      comment.platformCommentId,
      replyBody,
    );

    updateComment(commentId, {
      replied: true,
      replyBody,
      replyPlatformId: result.replyPlatformId,
    });

    return NextResponse.json({ ok: true, replyPlatformId: result.replyPlatformId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reply failed" },
      { status: 500 },
    );
  }
}
