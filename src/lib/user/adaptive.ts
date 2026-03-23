import { getDb } from "@/lib/db";
import { featureUsageStats } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  ROLE_FEATURE_DEFAULTS,
  type AdaptiveLayout,
  type FeatureVisibility,
  type UserRole,
} from "./types";

const VISIBILITY_THRESHOLD = 0.3; // below this, feature is hidden
const PIN_THRESHOLD = 0.75; // above this, feature is always prominent

// How much weight actual usage gets vs role defaults.
// Starts at 0 (all role-based) and grows toward 0.7 as interactions accumulate.
function usageWeight(totalInteractions: number): number {
  // Sigmoid-like curve: reaches ~0.5 at 50 interactions, ~0.7 at 200
  return 0.7 * (1 - Math.exp(-totalInteractions / 80));
}

export function computeAdaptiveLayout(role: UserRole): AdaptiveLayout {
  const db = getDb();
  const stats = db.select().from(featureUsageStats).all();

  const statsMap = new Map(stats.map((s) => [s.featureId, s]));
  const defaults = ROLE_FEATURE_DEFAULTS[role] ?? ROLE_FEATURE_DEFAULTS.other;

  // Gather all known feature IDs
  const allFeatures = new Set([
    ...Object.keys(defaults),
    ...stats.map((s) => s.featureId),
  ]);

  // Total interactions across all features (for computing usage weight)
  const totalInteractions = stats.reduce(
    (sum, s) => sum + s.interactionCount,
    0
  );
  const uw = usageWeight(totalInteractions);

  const features: Record<string, FeatureVisibility> = {};

  for (const featureId of allFeatures) {
    const roleDefault = defaults[featureId] ?? 0.5;
    const stat = statsMap.get(featureId);

    let usageScore = 0.5; // neutral default
    if (stat && totalInteractions > 0) {
      // Normalize this feature's count relative to the most-used feature
      const maxCount = Math.max(...stats.map((s) => s.interactionCount), 1);
      usageScore = stat.interactionCount / maxCount;

      // Recency boost: features used in last hour get a bump
      if (stat.lastUsedAt && Date.now() - stat.lastUsedAt < 3_600_000) {
        usageScore = Math.min(1, usageScore + 0.1);
      }
    }

    const score = (1 - uw) * roleDefault + uw * usageScore;

    features[featureId] = {
      featureId,
      score,
      visible: score >= VISIBILITY_THRESHOLD,
      pinned: score >= PIN_THRESHOLD,
    };
  }

  return { features, role };
}

export function recordFeatureUsage(featureId: string, role: UserRole): void {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .select()
    .from(featureUsageStats)
    .where(eq(featureUsageStats.featureId, featureId))
    .get();

  if (existing) {
    db.update(featureUsageStats)
      .set({
        interactionCount: existing.interactionCount + 1,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(featureUsageStats.featureId, featureId))
      .run();
  } else {
    db.insert(featureUsageStats)
      .values({
        featureId,
        interactionCount: 1,
        lastUsedAt: now,
        visibilityScore: 0.5,
        role,
        updatedAt: now,
      })
      .run();
  }
}
