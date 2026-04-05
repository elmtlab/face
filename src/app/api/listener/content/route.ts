import { NextRequest, NextResponse } from "next/server";
import { getContent, getContentByStatus } from "@/lib/listener/storage";
import { runGenerateStage } from "@/lib/listener/scheduler";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const content = status
    ? getContentByStatus(status as Parameters<typeof getContentByStatus>[0])
    : getContent();

  return NextResponse.json({
    content: content.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  });
}

/** POST triggers content generation for new topics */
export async function POST() {
  try {
    const count = await runGenerateStage();
    return NextResponse.json({ ok: true, generated: count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}
