"use client";

import { useEffect, useState } from "react";

interface TaskStep {
  id: string;
  tool: string;
  description: string;
  status: "completed" | "running" | "failed";
  timestamp: string;
}

interface TaskActivity {
  id: string;
  label: string;
  category: string;
  filesInvolved: string[];
  stepCount: number;
  startedAt: string;
  completedAt?: string;
}

interface TaskData {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  prompt: string;
  summary: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
  steps: TaskStep[];
  activities: TaskActivity[];
}

interface Props {
  taskId: string;
  onStatusChange?: (status: string) => void;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "text-zinc-400", bg: "bg-zinc-600/20", label: "Pending" },
  running: { color: "text-amber-400", bg: "bg-amber-600/20", label: "Running" },
  completed: { color: "text-emerald-400", bg: "bg-emerald-600/20", label: "Completed" },
  failed: { color: "text-red-400", bg: "bg-red-600/20", label: "Failed" },
  cancelled: { color: "text-zinc-400", bg: "bg-zinc-600/20", label: "Cancelled" },
};

const CATEGORY_ICONS: Record<string, string> = {
  read: "◇",
  write: "◆",
  execute: "▶",
  search: "◎",
  plan: "◈",
  other: "○",
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function TaskStatusPanel({ taskId, onStatusChange }: Props) {
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<"activities" | "steps" | "result" | null>(null);
  // Default to steps when there are steps but no activities
  const defaultSection = task?.activities?.length ? "activities" : task?.steps?.length ? "steps" : null;
  const activeSection = expandedSection ?? defaultSection;

  // Single polling effect — fetches immediately, then every 3s until terminal
  useEffect(() => {
    let active = true;
    let lastStatus = "";

    const fetchTask = async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) {
          if (active) { setError("Task not found"); setLoading(false); }
          return false; // stop polling
        }
        const data = await res.json();
        // API returns flat task object (not wrapped in { task: ... })
        const t: TaskData = data.id ? data : data.task;
        if (!active) return false;

        setTask(t);
        setLoading(false);

        // Only fire callback when status actually changes
        if (t.status !== lastStatus) {
          lastStatus = t.status;
          onStatusChange?.(t.status);
        }

        return !TERMINAL_STATUSES.has(t.status); // keep polling?
      } catch {
        if (active) { setError("Failed to load task"); setLoading(false); }
        return false;
      }
    };

    // Initial fetch
    fetchTask().then((shouldPoll) => {
      if (!shouldPoll || !active) return;

      // Start polling
      const interval = setInterval(async () => {
        const keepGoing = await fetchTask();
        if (!keepGoing) clearInterval(interval);
      }, 3000);

      // Store cleanup ref
      const cleanup = () => clearInterval(interval);
      cleanupRef = cleanup;
    });

    let cleanupRef: (() => void) | null = null;

    return () => {
      active = false;
      cleanupRef?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="animate-pulse text-sm text-zinc-500">Loading task details...</div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-sm text-zinc-500">{error ?? "Task not found"}</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
  const isActive = task.status === "running" || task.status === "pending";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-medium text-zinc-200">Implementation Status</h4>
          <span className={`text-[10px] px-2 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.label}
            {isActive && <span className="animate-pulse ml-1">...</span>}
          </span>
        </div>
        <code className="text-[10px] text-zinc-600 font-mono">{task.id.slice(0, 12)}</code>
      </div>

      {/* Summary */}
      {task.summary && (
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-sm text-zinc-300">{task.summary}</p>
        </div>
      )}

      {/* Progress bar for running tasks */}
      {isActive && task.steps.length > 0 && task.activities.length === 0 && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    (task.steps.filter((s) => s.status === "completed").length /
                      Math.max(task.steps.length, 1)) *
                      100,
                    95
                  )}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-zinc-500">
              {task.steps.filter((s) => s.status === "completed").length}/{task.steps.length} steps
            </span>
          </div>
        </div>
      )}
      {isActive && task.activities.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    (task.activities.filter((a) => a.completedAt).length /
                      Math.max(task.activities.length, 1)) *
                      100,
                    95
                  )}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-zinc-500">
              {task.activities.filter((a) => a.completedAt).length}/{task.activities.length} activities
            </span>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="divide-y divide-zinc-800/50">
        {/* Activities */}
        {task.activities.length > 0 && (
          <CollapsibleSection
            title="Activities"
            count={task.activities.length}
            expanded={activeSection === "activities"}
            onToggle={() => setExpandedSection(activeSection === "activities" ? null : "activities")}
          >
            <div className="space-y-1.5 px-4 pb-3">
              {task.activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-2 text-xs"
                >
                  <span className="text-zinc-500 mt-0.5 shrink-0">
                    {CATEGORY_ICONS[activity.category] ?? "○"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={activity.completedAt ? "text-zinc-400" : "text-zinc-200"}>
                      {activity.label}
                    </span>
                    {activity.filesInvolved.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {activity.filesInvolved.slice(0, 3).map((f) => (
                          <span key={f} className="text-[10px] text-zinc-600 font-mono truncate max-w-[200px]">
                            {f.split("/").pop()}
                          </span>
                        ))}
                        {activity.filesInvolved.length > 3 && (
                          <span className="text-[10px] text-zinc-600">
                            +{activity.filesInvolved.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {activity.completedAt ? "done" : "..."}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Recent steps (last 10) */}
        {task.steps.length > 0 && (
          <CollapsibleSection
            title="Recent Steps"
            count={task.steps.length}
            expanded={activeSection === "steps"}
            onToggle={() => setExpandedSection(activeSection === "steps" ? null : "steps")}
          >
            <div className="space-y-1 px-4 pb-3 max-h-48 overflow-y-auto">
              {task.steps.slice(-10).map((step) => (
                <div key={step.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      step.status === "completed"
                        ? "bg-emerald-500"
                        : step.status === "running"
                          ? "bg-amber-500 animate-pulse"
                          : "bg-red-500"
                    }`}
                  />
                  <span className="text-zinc-500 font-mono shrink-0 w-16 truncate">{step.tool}</span>
                  <span className="text-zinc-400 truncate">{step.description}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Result */}
        {task.result && (
          <CollapsibleSection
            title="Result"
            expanded={activeSection === "result"}
            onToggle={() => setExpandedSection(activeSection === "result" ? null : "result")}
          >
            <div className="px-4 pb-3">
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap bg-zinc-800/50 rounded p-3 max-h-64 overflow-y-auto font-mono leading-relaxed">
                {task.result}
              </pre>
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Timestamps */}
      <div className="px-4 py-2 border-t border-zinc-800 flex items-center gap-4 text-[10px] text-zinc-600">
        <span>Started: {new Date(task.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
        <span className="font-medium">{title}</span>
        {count !== undefined && (
          <span className="text-zinc-600">({count})</span>
        )}
      </button>
      {expanded && children}
    </div>
  );
}
