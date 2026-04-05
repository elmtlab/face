import { NextRequest, NextResponse } from "next/server";
import { getEngagement, getEngagementForContent } from "@/lib/listener/storage";
import { runAnalyzeStage } from "@/lib/listener/scheduler";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contentId = searchParams.get("contentId");

  if (contentId) {
    const engagement = getEngagementForContent(contentId);
    return NextResponse.json({ engagement: engagement ?? null });
  }

  return NextResponse.json({ engagement: getEngagement() });
}

/** POST triggers an immediate engagement analysis */
export async function POST() {
  try {
    const commentCount = await runAnalyzeStage();
    return NextResponse.json({ ok: true, commentsAnalyzed: commentCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
