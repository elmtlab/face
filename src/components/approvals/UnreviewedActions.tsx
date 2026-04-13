"use client";

import { useState, useEffect, useCallback } from "react";
import { RelativeTime } from "@/components/shared/RelativeTime";

interface UnreviewedAction {
  id: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  reason: string;
  timestamp: string;
}

export function UnreviewedActions() {
  const [actions, setActions] = useState<UnreviewedAction[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks/tool-approval/unreviewed");
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchActions();
    const interval = setInterval(fetchActions, 30_000);
    return () => clearInterval(interval);
  }, [fetchActions]);

  const handleClear = useCallback(async () => {
    setClearing(true);
    try {
      await fetch("/api/hooks/tool-approval/unreviewed", { method: "DELETE" });
      setActions([]);
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }, []);

  if (actions.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-300">
            Unreviewed Actions
          </h3>
          <span className="text-xs text-zinc-600">
            {actions.length} auto-approved
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={handleClear}
            disabled={clearing}
            className="text-xs text-zinc-600 hover:text-zinc-400 disabled:opacity-50 transition-colors"
          >
            {clearing ? "Clearing..." : "Dismiss All"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-3 rounded-lg bg-zinc-800/40 px-3 py-2 text-xs"
            >
              <span className="font-mono font-medium text-zinc-400 flex-shrink-0">
                {action.toolName}
              </span>
              <span className="text-zinc-600 truncate flex-1">
                {summarizeInput(action.toolName, action.toolInput)}
              </span>
              <span className="text-zinc-700 flex-shrink-0">
                {action.reason}
              </span>
              <span className="text-zinc-700 flex-shrink-0">
                <RelativeTime date={action.timestamp} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summarizeInput(
  toolName: string,
  input: Record<string, unknown>
): string {
  const t = toolName.toLowerCase();
  if ((t === "edit" || t === "write" || t === "read") && input.file_path) {
    return String(input.file_path);
  }
  if (t === "bash" && input.command) {
    return String(input.command).slice(0, 100);
  }
  if ((t === "grep" || t === "glob") && input.pattern) {
    return String(input.pattern);
  }
  const firstValue = Object.values(input)[0];
  return firstValue ? String(firstValue).slice(0, 80) : "";
}
