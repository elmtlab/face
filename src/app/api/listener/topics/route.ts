import { NextResponse } from "next/server";
import { getTopics } from "@/lib/listener/storage";
import { runScanStage } from "@/lib/listener/scheduler";

export async function GET() {
  const topics = getTopics();
  return NextResponse.json({
    topics: topics.sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
    ),
  });
}

/** POST triggers an immediate scan */
export async function POST() {
  try {
    const count = await runScanStage();
    return NextResponse.json({ ok: true, topicsFound: count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
