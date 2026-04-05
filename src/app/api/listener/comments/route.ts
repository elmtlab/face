import { NextRequest, NextResponse } from "next/server";
import {
  getComments,
  getCommentsForContent,
  getHighQualityComments,
} from "@/lib/listener/storage";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contentId = searchParams.get("contentId");
  const quality = searchParams.get("quality");

  if (quality === "high") {
    const minScore = parseFloat(searchParams.get("minScore") ?? "0.6");
    return NextResponse.json({ comments: getHighQualityComments(minScore) });
  }

  if (contentId) {
    return NextResponse.json({ comments: getCommentsForContent(contentId) });
  }

  return NextResponse.json({
    comments: getComments().sort((a, b) => b.qualityScore - a.qualityScore),
  });
}
