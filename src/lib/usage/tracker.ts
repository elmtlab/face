/**
 * Client-side usage frequency tracker.
 *
 * Stores per-route visit counts in localStorage and provides helpers
 * to record visits, retrieve sorted frequency data, and get all entries.
 */

const STORAGE_KEY = "face-usage-frequency";

export interface UsageEntry {
  /** Route path (e.g. "/dev", "/dev?view=issues") */
  path: string;
  /** Total visit count */
  count: number;
  /** ISO timestamp of last visit */
  lastVisited: string;
}

export type UsageData = Record<string, { count: number; lastVisited: string }>;

function readData(): UsageData {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeData(data: UsageData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** Record a visit to the given path. */
export function recordVisit(path: string): UsageData {
  const data = readData();
  const existing = data[path];
  data[path] = {
    count: (existing?.count ?? 0) + 1,
    lastVisited: new Date().toISOString(),
  };
  writeData(data);
  return data;
}

/** Get all usage entries sorted by visit count descending. */
export function getUsageSorted(): UsageEntry[] {
  const data = readData();
  return Object.entries(data)
    .map(([path, { count, lastVisited }]) => ({ path, count, lastVisited }))
    .sort((a, b) => b.count - a.count);
}

/** Get raw usage data. */
export function getUsageData(): UsageData {
  return readData();
}
