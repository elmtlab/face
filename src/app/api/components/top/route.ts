import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { featureUsageStats } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

/** If a component's usage is less than this fraction of the one above it, truncate. */
const RELATIVE_DROP_RATIO = 1 / 3;
const MIN_COMPONENTS = 3;
const MAX_COMPONENTS = 5;

export interface TopComponent {
  featureId: string;
  interactionCount: number;
  percentage: number;
}

/**
 * Apply relative drop cutoff: starting from rank 2, if usage[i] < usage[i-1] / 3,
 * truncate at i-1. Enforce floor of 3 and ceiling of 5.
 */
function applyRelativeDropCutoff(sorted: { featureId: string; interactionCount: number }[]): typeof sorted {
  const capped = sorted.slice(0, MAX_COMPONENTS);
  let cutoffIndex = capped.length;

  for (let i = 1; i < capped.length; i++) {
    if (capped[i].interactionCount < capped[i - 1].interactionCount * RELATIVE_DROP_RATIO) {
      cutoffIndex = i;
      break;
    }
  }

  return capped.slice(0, Math.max(MIN_COMPONENTS, cutoffIndex));
}

export async function GET() {
  try {
    const db = getDb();
    const allStats = db
      .select({
        featureId: featureUsageStats.featureId,
        interactionCount: featureUsageStats.interactionCount,
      })
      .from(featureUsageStats)
      .orderBy(desc(featureUsageStats.interactionCount))
      .all();

    if (allStats.length === 0) {
      return NextResponse.json({ components: [] });
    }

    const totalUsage = allStats.reduce((sum, s) => sum + s.interactionCount, 0);
    const topSlice = allStats.length < MIN_COMPONENTS ? allStats : applyRelativeDropCutoff(allStats);

    const components: TopComponent[] = topSlice.map((s) => ({
      featureId: s.featureId,
      interactionCount: s.interactionCount,
      percentage: totalUsage > 0 ? Math.round((s.interactionCount / totalUsage) * 100) : 0,
    }));

    return NextResponse.json({ components });
  } catch (err) {
    console.error("[face] Top components error:", err);
    return NextResponse.json({ error: "Failed to load top components" }, { status: 500 });
  }
}
