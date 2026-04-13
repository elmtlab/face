"use client";

import { useState, useEffect, useCallback } from "react";
import { RelativeTime } from "@/components/shared/RelativeTime";

interface PendingApproval {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 2_000;

export function ToolApprovalPanel() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [deciding, setDeciding] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks/tool-approval");
      if (res.ok) {
        const data = await res.json();
        setPending(data.pending ?? []);
      }
    } catch {
      // Server may be offline
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleDecision = useCallback(
    async (id: string, decision: "approve" | "reject", reason?: string) => {
      setDeciding((prev) => new Set(prev).add(id));
      try {
        await fetch(`/api/hooks/tool-approval/${id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reason }),
        });
        setPending((prev) => prev.filter((p) => p.id !== id));
        setRejectingId(null);
        setRejectReason("");
      } catch {
        // will retry on next poll
      } finally {
        setDeciding((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    []
  );

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-900/40 bg-gradient-to-br from-amber-950/30 to-orange-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <h3 className="text-sm font-semibold text-amber-300">
          Tool Approval Required
        </h3>
        <span className="text-xs text-amber-500/70">
          {pending.length} pending
        </span>
      </div>

      <div className="space-y-2">
        {pending.map((req) => (
          <div
            key={req.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 space-y-2"
          >
            {/* Tool info */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-zinc-200">
                    {req.toolName}
                  </span>
                  <span className="text-xs text-zinc-600">
                    <RelativeTime date={req.createdAt} />
                  </span>
                </div>
                {req.cwd && (
                  <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate">
                    {req.cwd}
                  </p>
                )}
              </div>
              <span className="text-xs text-zinc-600 font-mono flex-shrink-0">
                {req.sessionId.slice(0, 8)}
              </span>
            </div>

            {/* Tool input preview */}
            <ToolInputPreview toolName={req.toolName} input={req.toolInput} />

            {/* Reject reason input */}
            {rejectingId === req.id && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleDecision(req.id, "reject", rejectReason || undefined);
                    } else if (e.key === "Escape") {
                      setRejectingId(null);
                      setRejectReason("");
                    }
                  }}
                />
                <button
                  onClick={() =>
                    handleDecision(req.id, "reject", rejectReason || undefined)
                  }
                  disabled={deciding.has(req.id)}
                  className="rounded-md bg-red-600 hover:bg-red-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setRejectingId(null);
                    setRejectReason("");
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Action buttons */}
            {rejectingId !== req.id && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleDecision(req.id, "approve")}
                  disabled={deciding.has(req.id)}
                  className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-colors"
                >
                  {deciding.has(req.id) ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => {
                    setRejectingId(req.id);
                    setRejectReason("");
                  }}
                  disabled={deciding.has(req.id)}
                  className="rounded-md bg-zinc-700 hover:bg-zinc-600 px-4 py-1.5 text-xs font-medium text-zinc-300 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolInputPreview({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  const t = toolName.toLowerCase();

  if ((t === "edit" || t === "write" || t === "read") && input.file_path) {
    return (
      <div className="rounded bg-zinc-800/60 px-2 py-1.5 text-xs font-mono text-zinc-400 truncate">
        {String(input.file_path)}
      </div>
    );
  }

  if (t === "bash" && input.command) {
    return (
      <div className="rounded bg-zinc-800/60 px-2 py-1.5 text-xs font-mono text-zinc-400 break-all">
        <span className="text-zinc-600">$ </span>
        {String(input.command).slice(0, 300)}
      </div>
    );
  }

  if ((t === "grep" || t === "glob") && input.pattern) {
    return (
      <div className="rounded bg-zinc-800/60 px-2 py-1.5 text-xs font-mono text-zinc-400">
        {t}: {String(input.pattern)}
      </div>
    );
  }

  const entries = Object.entries(input).slice(0, 3);
  if (entries.length === 0) return null;

  return (
    <div className="rounded bg-zinc-800/60 px-2 py-1.5 text-xs font-mono text-zinc-500 space-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="truncate">
          <span className="text-zinc-600">{key}: </span>
          {String(value).slice(0, 120)}
        </div>
      ))}
    </div>
  );
}
