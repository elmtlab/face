"use client";

import { Suspense } from "react";
import { UsageTracker } from "./UsageTracker";

/**
 * Client-side mount point for the usage tracker.
 * Wrapped in Suspense because useSearchParams requires it.
 * Place in root layout to capture all navigation events.
 */
export function UsageTrackerMount() {
  return (
    <Suspense fallback={null}>
      <UsageTracker />
    </Suspense>
  );
}
