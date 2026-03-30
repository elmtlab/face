"use client";

import { useEffect, useCallback, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  recordVisit,
  type UsageEntry,
  type UsageData,
  getUsageData,
} from "@/lib/usage/tracker";

// ── External store for reactive usage data ──────────────────────────

let listeners: Array<() => void> = [];
let cachedData: UsageData = {};

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): UsageData {
  return cachedData;
}

function emitChange() {
  cachedData = getUsageData();
  for (const listener of listeners) {
    listener();
  }
}

// Initialize on module load (client only)
if (typeof window !== "undefined") {
  cachedData = getUsageData();
}

// ── Hook: subscribe to live usage data ──────────────────────────────

/** Returns usage entries sorted by frequency, updating in real time. */
export function useUsageData(): UsageEntry[] {
  const data = useSyncExternalStore(subscribe, getSnapshot, () => ({}) as UsageData);
  return (Object.entries(data) as [string, { count: number; lastVisited: string }][])
    .map(([path, entry]) => ({ path, count: entry.count, lastVisited: entry.lastVisited }))
    .sort((a, b) => b.count - a.count);
}

// ── Tracker component ───────────────────────────────────────────────

/**
 * Invisible component that records page visits on every route change.
 * Mount once near the root layout to capture all navigation.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const track = useCallback(() => {
    const view = searchParams.get("view");
    const fullPath = view ? `${pathname}?view=${view}` : pathname;
    recordVisit(fullPath);
    emitChange();
  }, [pathname, searchParams]);

  useEffect(() => {
    track();
  }, [track]);

  return null;
}
