"use client";

import { useEffect, useState } from "react";
import { RoleTagBadge } from "@/components/shared/RoleTagBadge";
import { useRoleSlug } from "@/components/shared/useRoleSlug";
import { Pagination } from "@/components/shared/Pagination";
import { usePagination } from "@/components/shared/usePagination";
import { ProjectFilterSelect } from "@/components/shared/ProjectFilterSelect";
import { useProjectContext } from "@/lib/projects/ProjectContext";

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

type Phase = "gathering" | "planning" | "evaluating" | "review" | "approved" | "debating" | "implementing" | "done";

interface PullRequestInfo {
  number: number;
  url: string;
  repo: string;
  branch: string;
  status: "open" | "merged" | "closed";
}

interface WorkflowState {
  id: string;
  phase: Phase;
  messages: ChatMessage[];
  generatedStory: GeneratedStory | null;
  issueId: string | null;
  issueUrl: string | null;
  taskId: string | null;
  pr: PullRequestInfo | null;
  creatorRole: string | null;
  assignedRoles: string[];
  projectId: string | null;
  revisions?: { version: number; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}


interface TaskInfo {
  id: string;
  status: string;
  summary?: string;
  result?: string | null;
}

const PHASES: { key: Phase; label: string }[] = [
  { key: "gathering", label: "Gather Requirements" },
  { key: "planning", label: "Generate Story" },
  { key: "evaluating", label: "Evaluate Story" },
  { key: "review", label: "Review & Approve" },
  { key: "approved", label: "Ready" },
  { key: "debating", label: "Consensus Debate" },
  { key: "implementing", label: "Implementing" },
  { key: "done", label: "Done" },
];


const PHASE_CONFIG: Record<Phase | "failed", { label: string; color: string; icon: string }> = {
  gathering: { label: "Gathering", color: "bg-blue-600/20 text-blue-400 border-blue-600/30", icon: "?" },
  planning: { label: "Planning", color: "bg-purple-600/20 text-purple-400 border-purple-600/30", icon: "~" },
  evaluating: { label: "Evaluating", color: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30", icon: "%" },
  review: { label: "Review", color: "bg-amber-600/20 text-amber-400 border-amber-600/30", icon: "!" },
  approved: { label: "Approved", color: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", icon: "+" },
  debating: { label: "Debating", color: "bg-pink-600/20 text-pink-400 border-pink-600/30", icon: "&" },
  implementing: { label: "Implementing", color: "bg-orange-600/20 text-orange-400 border-orange-600/30", icon: "*" },
  done: { label: "Done", color: "bg-zinc-700/50 text-zinc-300 border-zinc-600/30", icon: "v" },
  failed: { label: "Failed", color: "bg-red-600/20 text-red-400 border-red-600/30", icon: "x" },
};

function getEffectivePhase(w: WorkflowState, taskStatuses: Record<string, TaskInfo>): Phase | "failed" {
  if (w.phase === "done" && w.taskId) {
    const task = taskStatuses[w.taskId];
    // If task data hasn't loaded yet, trust the workflow phase rather than
    // flashing "failed" during a loading race.
    if (!task) return w.phase;
    if (task.status === "failed" || task.status === "cancelled") {
      return "failed";
    }
  }
  return w.phase;
}

interface Props {
  onSelectWorkflow: (id: string) => void;
  onNewWorkflow: () => void;
  /** When set, filter workflows to this project and pass to new workflows */
  activeProjectId?: string | null;
}

export function RequirementsView({ onSelectWorkflow, onNewWorkflow }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskInfo>>({});
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const { filterProjectId: projectFilter, projects } = useProjectContext();
  const { currentSlug, roles } = useRoleSlug();

  const filteredWorkflows = workflows.filter((w) => {
    // Project filter
    if (projectFilter !== "all" && w.projectId !== projectFilter) return false;
    // Role filter
    if (roleFilter === "all") return true;
    const slug = roleFilter === "mine" ? currentSlug : roleFilter;
    if (!slug) return true;
    return w.creatorRole === slug || (w.assignedRoles ?? []).includes(slug);
  });

  const { page, pageItems: pagedWorkflows, totalItems, setPage, resetPage } = usePagination(filteredWorkflows);

  useEffect(() => {
    resetPage();
  }, [roleFilter, projectFilter, resetPage]);

  // Projects are provided by ProjectContext — no separate fetch needed

  useEffect(() => {
    const fetchWorkflows = () => {
      fetch("/api/project/workflow")
        .then((r) => r.json())
        .then((d) => {
          setWorkflows(d.workflows ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 30_000);
    return () => clearInterval(interval);
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
          .then((d) => (d.id ? d : d.task) as TaskInfo | undefined)
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

  const refreshWorkflows = () => {
    fetch("/api/project/workflow")
      .then((r) => r.json())
      .then((d) => setWorkflows(d.workflows ?? []));
  };

  const handleRestart = async (w: WorkflowState) => {
    if (!w.taskId || restartingId) return;
    setRestartingId(w.id);
    try {
      // 1. Restart the failed task
      const restartRes = await fetch(`/api/tasks/${w.taskId}/restart`, { method: "POST" });
      const restartData = await restartRes.json();
      if (!restartData.taskId) return;

      // 2. Reopen the workflow with the new task ID
      await fetch(`/api/project/workflow/${w.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen", taskId: restartData.taskId }),
      });

      // 3. Refresh the view
      refreshWorkflows();
    } catch (err) {
      console.error("Failed to restart task:", err);
    } finally {
      setRestartingId(null);
    }
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
        <div className="flex items-center gap-2">
          <ProjectFilterSelect />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="all">All Roles</option>
            <option value="mine">My Role{currentSlug ? ` (${currentSlug})` : ""}</option>
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={onNewWorkflow}
            className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            + New Requirement
          </button>
        </div>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredWorkflows.length === 0 && workflows.length > 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-500 text-sm">No requirements match the selected role filter</p>
          </div>
        ) : filteredWorkflows.length === 0 ? (
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
            {pagedWorkflows.map((w) => {
              const isExpanded = expandedIds.has(w.id);
              const effectivePhase = getEffectivePhase(w, taskStatuses);
              const failed = effectivePhase === "failed";
              const cfg = PHASE_CONFIG[effectivePhase];
              const title: string =
                w.generatedStory?.title ??
                w.messages.find((m) => m.role === "user")?.content.slice(0, 80) ??
                "Untitled requirement";
              // For failed tasks, show implementing as the current phase (not done)
              // For completed workflows, set index past the last phase so all steps show as done
              const displayPhase = failed ? "implementing" : w.phase;
              const currentPhaseIdx = displayPhase === "done"
                ? PHASES.length
                : PHASES.findIndex((p) => p.key === displayPhase);

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
                          {w.creatorRole && (
                            <RoleTagBadge role={w.creatorRole} variant="creator" />
                          )}
                          {(w.assignedRoles ?? []).map((r: string) => (
                            <RoleTagBadge key={r} role={r} />
                          ))}
                          {w.projectId && projects.length > 1 && (() => {
                            const proj = projects.find((p) => p.id === w.projectId);
                            return proj ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                                {proj.name}
                              </span>
                            ) : null;
                          })()}
                          {(w.revisions?.length ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-600/30">
                              v{(w.revisions?.length ?? 0) + 1}
                            </span>
                          )}
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
                          const isFailed = failed && isCurrent && phase.key === "implementing";
                          const phaseCfg = PHASE_CONFIG[phase.key];

                          // Build sub-step detail
                          let detail = "";
                          if (phase.key === "review") {
                            detail = "Awaiting confirmation";
                          }
                          if (phase.key === "implementing" && w.taskId) {
                            const taskInfo = taskStatuses[w.taskId];
                            detail = taskInfo ? `Task: ${taskInfo.status}` : `Task: ${w.taskId.slice(0, 12)}...`;
                          }
                          if (phase.key === "done" && w.phase === "done") {
                            const taskInfo = w.taskId ? taskStatuses[w.taskId] : null;
                            if (taskInfo?.result) {
                              // Show first line of the result as a concise outcome
                              const firstLine = taskInfo.result.split("\n")[0].trim();
                              detail = firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
                            } else if (taskInfo?.summary) {
                              detail = taskInfo.summary;
                            } else if (w.pr?.status === "merged") {
                              detail = `Completed via PR #${w.pr.number}`;
                            } else {
                              detail = "Completed";
                            }
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
                                  <div className={`absolute -top-3 w-px h-3 ${isDone || isCurrent ? (isFailed ? "bg-red-600/40" : "bg-emerald-600/40") : "bg-zinc-700/50"}`} />
                                )}
                                <div
                                  className={`w-2.5 h-2.5 rounded-full border ${
                                    isFailed
                                      ? "bg-red-600 border-red-500 ring-2 ring-red-600/30"
                                      : isDone
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
                                  isFailed
                                    ? "text-red-400 font-medium"
                                    : isDone
                                      ? "text-zinc-500 line-through"
                                      : isCurrent
                                        ? "text-zinc-200 font-medium"
                                        : "text-zinc-600"
                                }`}
                              >
                                {phase.label}
                              </span>

                              {/* Status badge for current */}
                              {isFailed && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-600/20 text-red-400 border-red-600/30">
                                  Failed
                                </span>
                              )}
                              {isCurrent && !isFailed && (
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
                        <div className="flex items-center gap-2">
                          {failed && w.taskId && (
                            <button
                              onClick={() => handleRestart(w)}
                              disabled={restartingId === w.id}
                              className="text-[10px] px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
                            >
                              {restartingId === w.id ? "Restarting..." : "Restart Task"}
                            </button>
                          )}
                          <button
                            onClick={() => onSelectWorkflow(w.id)}
                            className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                          >
                            Open Workflow →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Pagination
          currentPage={page}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
