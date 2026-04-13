"use client";

import { useEffect, useState, useCallback } from "react";

interface PendingApproval {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  createdAt: string;
}

interface UnreviewedAction {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  reason: string;
  timestamp: string;
}

export function ToolApprovalBanner() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [unreviewed, setUnreviewed] = useState<UnreviewedAction[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showUnreviewed, setShowUnreviewed] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks/tool-approval");
      const data = await res.json();
      setPending(data.pending ?? []);
    } catch {
      // Server might not be reachable during development
    }
  }, []);

  const loadUnreviewed = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks/tool-approval/unreviewed");
      const data = await res.json();
      setUnreviewed(data.actions ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadPending();
    loadUnreviewed();
    // Poll every 1s for pending (time-sensitive), every 10s for unreviewed
    const pendingInterval = setInterval(loadPending, 1_000);
    const unreviewedInterval = setInterval(loadUnreviewed, 10_000);
    return () => {
      clearInterval(pendingInterval);
      clearInterval(unreviewedInterval);
    };
  }, [loadPending, loadUnreviewed]);

  async function handleDecision(
    id: string,
    decision: "approve" | "reject",
    reason?: string
  ) {
    try {
      await fetch(`/api/hooks/tool-approval/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      setPending((prev) => prev.filter((p) => p.id !== id));
      setExpanded(null);
      setRejectReason("");
    } catch (err) {
      console.error("Failed to submit decision:", err);
    }
  }

  async function clearUnreviewed() {
    try {
      await fetch("/api/hooks/tool-approval/unreviewed", { method: "DELETE" });
      setUnreviewed([]);
      setShowUnreviewed(false);
    } catch {
      // ignore
    }
  }

  if (pending.length === 0 && unreviewed.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Pending approvals */}
      {pending.map((req) => (
        <div
          key={req.id}
          className="border-b border-amber-800/50 bg-amber-950/95 backdrop-blur-sm px-4 py-3"
        >
          <div className="max-w-5xl mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-900/60 px-2 py-0.5 text-xs font-medium text-amber-300">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Approval Required
                  </span>
                  <span className="text-sm font-medium text-amber-100">
                    {req.toolName}
                  </span>
                  <span className="text-xs text-amber-400/60 font-mono truncate">
                    session: {req.sessionId.slice(0, 12)}
                  </span>
                </div>

                {/* Tool input summary */}
                <p className="mt-1 text-xs text-amber-300/70 truncate">
                  {formatToolInput(req.toolName, req.toolInput)}
                </p>

                {/* Expandable details */}
                {expanded === req.id && (
                  <div className="mt-2 rounded-md bg-zinc-900/80 border border-zinc-700/50 p-3">
                    <div className="text-xs text-zinc-400 space-y-1.5">
                      <div>
                        <span className="text-zinc-500">Tool:</span>{" "}
                        <span className="text-zinc-200 font-mono">
                          {req.toolName}
                        </span>
                      </div>
                      {req.cwd && (
                        <div>
                          <span className="text-zinc-500">Directory:</span>{" "}
                          <span className="text-zinc-300 font-mono">
                            {req.cwd}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500">Parameters:</span>
                        <pre className="mt-1 text-zinc-300 font-mono text-[11px] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                          {JSON.stringify(req.toolInput, null, 2)}
                        </pre>
                      </div>
                      {/* Reject reason input */}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Reason for rejection (optional)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() =>
                    setExpanded(expanded === req.id ? null : req.id)
                  }
                  className="rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  {expanded === req.id ? "Less" : "Details"}
                </button>
                <button
                  onClick={() =>
                    handleDecision(req.id, "reject", rejectReason || undefined)
                  }
                  className="rounded-md border border-red-700 bg-red-950/50 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleDecision(req.id, "approve")}
                  className="rounded-md border border-green-700 bg-green-950/50 px-3 py-1 text-xs font-medium text-green-300 hover:bg-green-900/50 transition-colors"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Unreviewed actions notification */}
      {unreviewed.length > 0 && pending.length === 0 && (
        <div className="border-b border-zinc-700/50 bg-zinc-900/95 backdrop-blur-sm px-4 py-2">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {unreviewed.length} unreviewed action
                {unreviewed.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-zinc-500">
                Auto-approved while FACE was offline
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUnreviewed(!showUnreviewed)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {showUnreviewed ? "Hide" : "Review"}
              </button>
              <button
                onClick={clearUnreviewed}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Expanded unreviewed list */}
          {showUnreviewed && (
            <div className="max-w-5xl mx-auto mt-2 space-y-1.5 max-h-64 overflow-y-auto pb-2">
              {unreviewed.map((action) => (
                <div
                  key={action.id}
                  className="rounded-md bg-zinc-800/60 border border-zinc-700/30 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-200">
                        {action.toolName}
                      </span>
                      <span className="text-zinc-500">
                        {formatToolInput(action.toolName, action.toolInput)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500">
                      <span className="text-amber-500/70">{action.reason}</span>
                      <span>{formatTime(action.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatToolInput(
  tool: string,
  input: Record<string, unknown>
): string {
  const t = tool.toLowerCase();

  if (t === "bash") {
    return String(input.command ?? input.description ?? "").slice(0, 120);
  }
  if (t === "edit" || t === "write" || t === "read") {
    return String(input.file_path ?? input.filePath ?? "");
  }
  if (t === "glob") {
    return `pattern: ${input.pattern ?? ""}`;
  }
  if (t === "grep") {
    return `search: ${input.pattern ?? ""}`;
  }

  const desc =
    input.description ?? input.command ?? input.file_path ?? input.pattern;
  if (desc) return String(desc).slice(0, 120);

  return JSON.stringify(input).slice(0, 100);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
