import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usageEvents, layoutWeights } from "@/lib/db/schema";
import { recordFeatureUsage } from "@/lib/user/adaptive";
import { getUserProfile } from "@/lib/user/profile";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = body.events as Array<{
    eventType: string;
    componentId: string;
    section: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }>;

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "No events provided" }, { status: 400 });
  }

  try {
    const db = getDb();
    const now = Date.now();
    const profile = getUserProfile();
    const role = profile?.role ?? "other";

    for (const event of events) {
      db.insert(usageEvents).values({
        timestamp: now,
        eventType: event.eventType,
        componentId: event.componentId,
        section: event.section,
        durationMs: event.durationMs ?? null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      }).run();

      if (event.eventType === "click" || event.eventType === "expand") {
        recordFeatureUsage(event.componentId, role);
      }
    }

    return NextResponse.json({ recorded: events.length });
  } catch (err) {
    console.error("[face] Tracking error:", err);
    return NextResponse.json({ error: "Failed to record events" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = getDb();
    const weights = db.select().from(layoutWeights).all();

    const result: Record<
      string,
      { weight: number; interactionCount: number }
    > = {};
    for (const w of weights) {
      result[w.componentId] = {
        weight: w.weight,
        interactionCount: w.interactionCount,
      };
    }

    return NextResponse.json({ weights: result });
  } catch (err) {
    console.error("[face] Tracking GET error:", err);
    return NextResponse.json({ error: "Failed to load weights" }, { status: 500 });
  }
}
