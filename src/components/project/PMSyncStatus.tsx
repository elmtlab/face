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

interface Props {
  faceId: string;
  /** Compact mode shows just an icon badge */
  compact?: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  pending: { color: "text-zinc-400", bg: "bg-zinc-600/20", label: "Sync pending", icon: "○" },
  syncing: { color: "text-amber-400", bg: "bg-amber-600/20", label: "Syncing", icon: "◌" },
  synced: { color: "text-emerald-400", bg: "bg-emerald-600/20", label: "Synced", icon: "●" },
  failed: { color: "text-red-400", bg: "bg-red-600/20", label: "Sync failed", icon: "✕" },
};

export function PMSyncStatus({ faceId, compact }: Props) {
  const [ref, setRef] = useState<SyncReference | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/pm-sync/status?faceId=${encodeURIComponent(faceId)}`);
      if (res.ok) {
        const data = await res.json();
        setRef(data.reference ?? null);
      }
    } catch {
      // Silently ignore — sync status is non-critical
    }
  }, [faceId]);

  useEffect(() => {
    fetchStatus();

    // Poll while pending/syncing
    const interval = setInterval(async () => {
      await fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Stop polling once in terminal state
  useEffect(() => {
    if (ref && (ref.status === "synced" || ref.status === "failed")) {
      // No need to keep polling
    }
  }, [ref]);

  if (!ref) return null;

  const cfg = STATUS_CONFIG[ref.status] ?? STATUS_CONFIG.pending;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/pm-sync/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceId }),
      });
      if (res.ok) {
        // Refresh status after a short delay to show the new state
        setTimeout(fetchStatus, 500);
      }
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] ${cfg.color}`}
        title={ref.status === "failed" ? `Sync failed: ${ref.lastError}` : cfg.label}
      >
        <span className={ref.status === "syncing" ? "animate-pulse" : ""}>{cfg.icon}</span>
        {ref.externalUrl && ref.status === "synced" && (
          <a
            href={ref.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            PM
          </a>
        )}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs ${cfg.bg}`}>
      <span className={`${cfg.color} ${ref.status === "syncing" ? "animate-pulse" : ""}`}>
        {cfg.icon}
      </span>
      <span className={cfg.color}>{cfg.label}</span>

      {ref.externalUrl && ref.status === "synced" && (
        <a
          href={ref.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 hover:underline ml-1"
        >
          View in PM tool
        </a>
      )}

      {ref.status === "failed" && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-red-400/70 text-[10px] max-w-[200px] truncate" title={ref.lastError}>
            {ref.lastError}
          </span>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="shrink-0 text-[11px] px-2 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50"
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}
    </div>
  );
}
