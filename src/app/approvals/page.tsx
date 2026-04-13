"use client";

import { useEffect, useState, useCallback } from "react";
import { RelativeTime } from "@/components/shared/RelativeTime";

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

export default function ApprovalsPage() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [unreviewed, setUnreviewed] = useState<UnreviewedAction[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deciding, setDeciding] = useState<Set<string>>(new Set());

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks/tool-approval");
      if (res.ok) {
        const data = await res.json();
        setPending(data.pending ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadUnreviewed = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks/tool-approval/unreviewed");
      if (res.ok) {
        const data = await res.json();
        setUnreviewed(data.actions ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadPending();
    loadUnreviewed();
    const pendingInterval = setInterval(loadPending, 2_000);
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
    setDeciding((prev) => new Set(prev).add(id));
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
    } finally {
      setDeciding((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function clearUnreviewed() {
    try {
      await fetch("/api/hooks/tool-approval/unreviewed", { method: "DELETE" });
      setUnreviewed([]);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              Tool Approvals
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Review and manage AI agent tool call approvals
            </p>
          </div>
          <a
            href="/"
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Back to Dashboard
          </a>
        </div>

        {/* Pending approvals */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Pending Approvals
            {pending.length > 0 && (
              <span className="text-sm font-normal text-amber-400">
                ({pending.length})
              </span>
            )}
          </h2>

          {pending.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">
              No pending approval requests
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-amber-200 font-medium">
                          {req.toolName}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          session: {req.sessionId.slice(0, 16)}
                        </span>
                        <span className="text-xs text-zinc-600">
                          <RelativeTime date={req.createdAt} />
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400 truncate">
                        {formatToolInput(req.toolName, req.toolInput)}
                      </p>

                      {expanded === req.id && (
                        <div className="mt-3 rounded-lg bg-zinc-900 border border-zinc-700/50 p-4 space-y-2">
                          <div className="text-xs">
                            <span className="text-zinc-500">Tool: </span>
                            <span className="text-zinc-200 font-mono">
                              {req.toolName}
                            </span>
                          </div>
                          {req.cwd && (
                            <div className="text-xs">
                              <span className="text-zinc-500">Directory: </span>
                              <span className="text-zinc-300 font-mono">
                                {req.cwd}
                              </span>
                            </div>
                          )}
                          <div className="text-xs">
                            <span className="text-zinc-500">Parameters:</span>
                            <pre className="mt-1 text-zinc-300 font-mono text-[11px] whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-zinc-950 rounded p-2">
                              {JSON.stringify(req.toolInput, null, 2)}
                            </pre>
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="text"
                              placeholder="Reason for rejection (optional)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() =>
                          setExpanded(expanded === req.id ? null : req.id)
                        }
                        className="rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        {expanded === req.id ? "Less" : "Details"}
                      </button>
                      <button
                        onClick={() =>
                          handleDecision(
                            req.id,
                            "reject",
                            rejectReason || undefined
                          )
                        }
                        disabled={deciding.has(req.id)}
                        className="rounded-md border border-red-700 bg-red-950/50 px-4 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleDecision(req.id, "approve")}
                        disabled={deciding.has(req.id)}
                        className="rounded-md border border-green-700 bg-green-950/50 px-4 py-1.5 text-xs font-medium text-green-300 hover:bg-green-900/50 disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Unreviewed actions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
              Unreviewed Actions
              {unreviewed.length > 0 && (
                <span className="text-sm font-normal text-zinc-500">
                  ({unreviewed.length})
                </span>
              )}
            </h2>
            {unreviewed.length > 0 && (
              <button
                onClick={clearUnreviewed}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {unreviewed.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-500">
              No unreviewed actions
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <p className="text-xs text-zinc-500">
                  These tool calls were auto-approved while FACE was offline.
                  They executed without human review.
                </p>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {unreviewed.map((action) => (
                  <div
                    key={action.id}
                    className="px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm text-zinc-200 flex-shrink-0">
                          {action.toolName}
                        </span>
                        <span className="text-xs text-zinc-500 truncate">
                          {formatToolInput(action.toolName, action.toolInput)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <span className="rounded-md bg-amber-950/40 border border-amber-800/30 px-2 py-0.5 text-amber-400">
                          {action.reason}
                        </span>
                        <span className="text-zinc-500">
                          <RelativeTime date={action.timestamp} />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
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
  if (t === "glob") return `pattern: ${input.pattern ?? ""}`;
  if (t === "grep") return `search: ${input.pattern ?? ""}`;

  const desc =
    input.description ?? input.command ?? input.file_path ?? input.pattern;
  if (desc) return String(desc).slice(0, 120);
  return JSON.stringify(input).slice(0, 100);
}
