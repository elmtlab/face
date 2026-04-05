"use client";

import { useEffect, useState, useCallback } from "react";

interface SyncReference {
  faceId: string;
  type: "project" | "task";
  externalId?: string;
  externalUrl?: string;
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  lastError?: string;
  lastAttemptAt?: string;
  syncedAt?: string;
}

/**
 * Displays a dismissible banner when there are failed PM sync items.
 * Shows the count of failures and a button to retry all.
 */
export function PMSyncFailureBanner() {
  const [failures, setFailures] = useState<SyncReference[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchFailures = useCallback(async () => {
    try {
      const res = await fetch("/api/pm-sync/status?status=failed");
      if (res.ok) {
        const data = await res.json();
        setFailures(data.references ?? []);
      }
    } catch {
      // Non-critical — ignore
    }
  }, []);

  useEffect(() => {
    fetchFailures();
    const interval = setInterval(fetchFailures, 30000); // check every 30s
    return () => clearInterval(interval);
  }, [fetchFailures]);

  if (failures.length === 0 || dismissed) return null;

  const handleRetryAll = async () => {
    setRetrying(true);
    try {
      for (const f of failures) {
        await fetch("/api/pm-sync/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faceId: f.faceId }),
        });
      }
      setTimeout(fetchFailures, 2000);
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mx-4 mt-2 rounded-lg border border-red-500/20 bg-red-950/40 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-red-400 shrink-0">✕</span>
        <p className="text-xs text-red-300 truncate">
          {failures.length} PM sync {failures.length === 1 ? "item" : "items"} failed to sync
          {failures[0]?.lastError && (
            <span className="text-red-400/60 ml-1">— {failures[0].lastError}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRetryAll}
          disabled={retrying}
          className="text-[11px] px-2.5 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50"
        >
          {retrying ? "Retrying..." : "Retry All"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[11px] px-1.5 py-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
