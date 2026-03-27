"use client";

import { useEffect, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface GeneratedStory {
  title: string;
  body: string;
  labels: string[];
  priority: string;
  estimatedEffort: string;
}

type Phase = "gathering" | "planning" | "review" | "approved" | "implementing" | "done";

interface WorkflowState {
  id: string;
  phase: Phase;
  messages: ChatMessage[];
  generatedStory: GeneratedStory | null;
  issueId: string | null;
  issueUrl: string | null;
  pmApproval: string;
  engApproval: string;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskInfo {
  id: string;
  status: string;
  summary?: string;
}

const PHASES: { key: Phase; label: string }[] = [
  { key: "gathering", label: "Gather Requirements" },
  { key: "planning", label: "Generate Story" },
  { key: "review", label: "Review & Approve" },
  { key: "approved", label: "Ready" },
  { key: "implementing", label: "Implementing" },
  { key: "done", label: "Done" },
];

const PHASE_CONFIG: Record<Phase, { label: string; color: string; icon: string }> = {
  gathering: { label: "Gathering", color: "bg-blue-600/20 text-blue-400 border-blue-600/30", icon: "?" },
  planning: { label: "Planning", color: "bg-purple-600/20 text-purple-400 border-purple-600/30", icon: "~" },
  review: { label: "Review", color: "bg-amber-600/20 text-amber-400 border-amber-600/30", icon: "!" },
  approved: { label: "Approved", color: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", icon: "+" },
  implementing: { label: "Implementing", color: "bg-orange-600/20 text-orange-400 border-orange-600/30", icon: "*" },
  done: { label: "Done", color: "bg-zinc-700/50 text-zinc-300 border-zinc-600/30", icon: "v" },
};

interface Props {
  onSelectWorkflow: (id: string) => void;
  onNewWorkflow: () => void;
}

export function RequirementsView({ onSelectWorkflow, onNewWorkflow }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskInfo>>({});

  useEffect(() => {
    fetch("/api/project/workflow")
      .then((r) => r.json())
      .then((d) => {
        setWorkflows(d.workflows ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fetch task statuses for implementing/done workflows
  useEffect(() => {
    const taskIds = workflows
      .filter((w) => w.taskId && (w.phase === "implementing" || w.phase === "done"))
      .map((w) => w.taskId!);
    if (taskIds.length === 0) return;

    Promise.all(
      taskIds.map((id) =>
        fetch(`/api/tasks/${id}`)
          .then((r) => r.json())
          .then((d) => d.task as TaskInfo | undefined)
          .catch(() => undefined)
      )
    ).then((tasks) => {
      const map: Record<string, TaskInfo> = {};
      tasks.forEach((t) => {
        if (t) map[t.id] = t;
      });
      setTaskStatuses(map);
    });
  }, [workflows]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Loading requirements...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Requirements</h2>
        <button
          onClick={onNewWorkflow}
          className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          + New Requirement
        </button>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto p-4">
        {workflows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-500 text-sm mb-3">No requirements yet</p>
            <button
              onClick={onNewWorkflow}
              className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              Create your first requirement
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map((w) => {
              const isExpanded = expandedIds.has(w.id);
              const cfg = PHASE_CONFIG[w.phase];
              const title =
                w.generatedStory?.title ??
                w.messages.find((m) => m.role === "user")?.content.slice(0, 80) ??
                "Untitled requirement";
              const currentPhaseIdx = PHASES.findIndex((p) => p.key === w.phase);

              return (
                <div key={w.id} className="rounded-lg border border-zinc-800 overflow-hidden">
                  {/* Root requirement row */}
                  <div className="flex items-center gap-2 bg-zinc-900/50 hover:bg-zinc-800/60 transition-colors">
                    <button
                      onClick={() => toggleExpand(w.id)}
                      className="pl-3 py-3 pr-1 text-zinc-500 hover:text-zinc-300 shrink-0"
                    >
                      <span className={`inline-block transition-transform text-xs ${isExpanded ? "rotate-90" : ""}`}>
                        ▶
                      </span>
                    </button>

                    <button
                      onClick={() => onSelectWorkflow(w.id)}
                      className="flex-1 text-left py-3 pr-4 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-zinc-200 truncate">{title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-zinc-600">
                            {new Date(w.updatedAt).toLocaleDateString()}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Expanded sub-steps */}
                  {isExpanded && (
                    <div className="border-t border-zinc-800/50 bg-zinc-950/50">
                      <div className="py-2 px-3">
                        {PHASES.map((phase, i) => {
                          const isDone = i < currentPhaseIdx;
                          const isCurrent = i === currentPhaseIdx;
                          const phaseCfg = PHASE_CONFIG[phase.key];

                          // Build sub-step detail
                          let detail = "";
                          if (phase.key === "review" && (w.pmApproval !== "pending" || w.engApproval !== "pending")) {
                            detail = `PM: ${w.pmApproval} · Eng: ${w.engApproval}`;
                          }
                          if (phase.key === "implementing" && w.taskId) {
                            const taskInfo = taskStatuses[w.taskId];
                            detail = taskInfo ? `Task: ${taskInfo.status}` : `Task: ${w.taskId.slice(0, 12)}...`;
                          }
                          if (phase.key === "planning" && w.generatedStory) {
                            detail = "Story generated";
                          }
                          if (phase.key === "review" && w.issueUrl) {
                            detail += detail ? " · GitHub issue created" : "GitHub issue created";
                          }

                          return (
                            <div key={phase.key} className="flex items-center gap-3 py-1.5 pl-4">
                              {/* Connector line + status dot */}
                              <div className="relative flex flex-col items-center w-4 shrink-0">
                                {i > 0 && (
                                  <div className={`absolute -top-3 w-px h-3 ${isDone || isCurrent ? "bg-emerald-600/40" : "bg-zinc-700/50"}`} />
                                )}
                                <div
                                  className={`w-2.5 h-2.5 rounded-full border ${
                                    isDone
                                      ? "bg-emerald-600 border-emerald-500"
                                      : isCurrent
                                        ? "bg-indigo-600 border-indigo-500 ring-2 ring-indigo-600/30"
                                        : "bg-zinc-800 border-zinc-600"
                                  }`}
                                />
                                {i < PHASES.length - 1 && (
                                  <div className={`absolute -bottom-3 w-px h-3 ${isDone ? "bg-emerald-600/40" : "bg-zinc-700/50"}`} />
                                )}
                              </div>

                              {/* Label */}
                              <span
                                className={`text-xs ${
                                  isDone
                                    ? "text-zinc-500 line-through"
                                    : isCurrent
                                      ? "text-zinc-200 font-medium"
                                      : "text-zinc-600"
                                }`}
                              >
                                {phase.label}
                              </span>

                              {/* Status badge for current */}
                              {isCurrent && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${phaseCfg.color}`}>
                                  In Progress
                                </span>
                              )}
                              {isDone && (
                                <span className="text-[10px] text-emerald-600">✓</span>
                              )}

                              {/* Detail text */}
                              {detail && (
                                <span className="text-[10px] text-zinc-600 ml-auto">{detail}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Action footer */}
                      <div className="px-4 py-2 border-t border-zinc-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                          <span>Created {new Date(w.createdAt).toLocaleDateString()}</span>
                          {w.issueUrl && (
                            <a
                              href={w.issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300"
                            >
                              GitHub Issue ↗
                            </a>
                          )}
                        </div>
                        <button
                          onClick={() => onSelectWorkflow(w.id)}
                          className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        >
                          Open Workflow →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
