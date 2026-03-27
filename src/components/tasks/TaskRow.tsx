"use client";

import type { FaceTask } from "@/lib/tasks/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";

export function TaskRow({
  task,
  selected,
  onSelectAction,
  onDeleteAction,
}: {
  task: FaceTask;
  selected: boolean;
  onSelectAction: (taskId: string) => void;
  onDeleteAction: (taskId: string) => void;
}) {
  // Title is the distilled action (e.g. "Remove the left sidebar")
  const displayTitle = task.title || "Agent task";
  const isRunning = task.status === "running";

  // For completed tasks, show the agent's summary (first sentence of result)
  const completedSummary =
    task.status === "completed" && task.summary && task.summary !== displayTitle
      ? task.summary
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectAction(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectAction(task.id);
        }
      }}
      className={`w-full text-left rounded-lg border p-3 transition-all cursor-pointer ${
        selected
          ? "border-blue-700 bg-blue-950/30 shadow-lg shadow-blue-900/10"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-900/80"
      }`}
    >
      {/* Distilled title */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-zinc-100 line-clamp-2 leading-snug">
          {displayTitle}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <StatusBadge status={task.status} />
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteAction(task.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onDeleteAction(task.id);
              }
            }}
            className="rounded p-0.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isRunning ? "Stop and delete" : "Delete"}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>
        </div>
      </div>

      {/* Summary: what was done (completed) or what's happening (running) */}
      {completedSummary && (
        <p className="mt-1.5 text-xs text-zinc-400 line-clamp-2">
          {completedSummary}
        </p>
      )}
      {isRunning && task.summary && task.summary !== displayTitle && (
        <p className="mt-1.5 text-xs text-blue-400/70 truncate">
          {task.summary}
        </p>
      )}

      {/* Meta */}
      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
        <span className="font-mono">{task.agent}</span>
        <RelativeTime date={task.updatedAt} />
      </div>

      {isRunning && (
        <div className="mt-2 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all animate-pulse" style={{ width: "60%" }} />
        </div>
      )}
    </div>
  );
}
