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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const selected = selectedId ? workflows.find((w) => w.id === selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Loading requirements...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="w-96 border-r border-zinc-800 flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Requirements</h2>
          <button
            onClick={onNewWorkflow}
            className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
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
            <div className="divide-y divide-zinc-800/50">
              {workflows.map((w) => {
                const cfg = PHASE_CONFIG[w.phase];
                const title =
                  w.generatedStory?.title ??
                  w.messages.find((m) => m.role === "user")?.content.slice(0, 80) ??
                  "Untitled requirement";
                const isActive = selectedId === w.id;

                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isActive
                        ? "bg-zinc-800/80"
                        : "hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-zinc-200 line-clamp-2">{title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${cfg.color}`}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-zinc-600">
                        {new Date(w.updatedAt).toLocaleDateString()} {new Date(w.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {w.issueUrl && (
                        <span className="text-[10px] text-zinc-500">GitHub issue</span>
                      )}
                      {w.taskId && taskStatuses[w.taskId] && (
                        <span className="text-[10px] text-zinc-500">
                          Task: {taskStatuses[w.taskId].status}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <WorkflowDetail
            workflow={selected}
            taskInfo={selected.taskId ? taskStatuses[selected.taskId] : undefined}
            onOpen={() => onSelectWorkflow(selected.id)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Select a requirement to view details
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowDetail({
  workflow,
  taskInfo,
  onOpen,
}: {
  workflow: WorkflowState;
  taskInfo?: TaskInfo;
  onOpen: () => void;
}) {
  const cfg = PHASE_CONFIG[workflow.phase];
  const story = workflow.generatedStory;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-zinc-100">
            {story?.title ??
              workflow.messages.find((m) => m.role === "user")?.content.slice(0, 100) ??
              "Untitled requirement"}
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded border ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-zinc-500">
              Created {new Date(workflow.createdAt).toLocaleDateString()}
            </span>
            <span className="text-xs text-zinc-500">
              Updated {new Date(workflow.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <button
          onClick={onOpen}
          className="px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
        >
          Open Workflow
        </button>
      </div>

      {/* Progress summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatusCard
          label="PM Approval"
          status={workflow.pmApproval}
        />
        <StatusCard
          label="Eng Approval"
          status={workflow.engApproval}
        />
        <StatusCard
          label="Implementation"
          status={
            workflow.phase === "done"
              ? "completed"
              : workflow.phase === "implementing"
                ? "in_progress"
                : workflow.taskId
                  ? taskInfo?.status ?? "unknown"
                  : "not_started"
          }
        />
      </div>

      {/* GitHub Issue link */}
      {workflow.issueUrl && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <span className="text-xs text-zinc-500">GitHub Issue</span>
          <a
            href={workflow.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-indigo-400 hover:text-indigo-300 mt-0.5"
          >
            {workflow.issueUrl}
          </a>
        </div>
      )}

      {/* Generated Story */}
      {story && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">Generated Story</h3>
            <div className="flex gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
                {story.priority}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {story.estimatedEffort}
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed space-y-2">
              {story.body.split("\n").map((line, i) => {
                if (line.startsWith("## ")) {
                  return (
                    <h5 key={i} className="text-zinc-200 font-semibold mt-4 mb-1 text-sm">
                      {line.replace("## ", "")}
                    </h5>
                  );
                }
                if (line.startsWith("- [ ] ")) {
                  return (
                    <label key={i} className="flex items-start gap-2 text-zinc-400">
                      <input type="checkbox" disabled className="mt-1 accent-indigo-500" />
                      <span>{line.replace("- [ ] ", "")}</span>
                    </label>
                  );
                }
                if (line.startsWith("- ")) {
                  return (
                    <p key={i} className="text-zinc-400 pl-4">
                      {line.replace("- ", "• ")}
                    </p>
                  );
                }
                return line.trim() ? <p key={i}>{line}</p> : <br key={i} />;
              })}
            </div>
            {story.labels.length > 0 && (
              <div className="flex gap-1.5 mt-4">
                {story.labels.map((l) => (
                  <span
                    key={l}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-600 text-zinc-400"
                  >
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task info */}
      {workflow.taskId && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Implementation Task</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              taskInfo?.status === "completed"
                ? "bg-emerald-600/20 text-emerald-400"
                : taskInfo?.status === "failed"
                  ? "bg-red-600/20 text-red-400"
                  : "bg-amber-600/20 text-amber-400"
            }`}>
              {taskInfo?.status ?? workflow.phase === "done" ? "completed" : "running"}
            </span>
          </div>
          <code className="text-xs text-zinc-400 font-mono mt-1 block">{workflow.taskId}</code>
        </div>
      )}

      {/* Conversation history */}
      {workflow.messages.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200">
              Conversation ({workflow.messages.length} messages)
            </h3>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {workflow.messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                    msg.role === "user"
                      ? "bg-indigo-600/10 text-indigo-200 border border-indigo-600/20"
                      : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                  }`}
                >
                  <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 block mb-0.5">
                    {msg.role === "user" ? "You" : "AI"}
                  </span>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.content.replace("[READY_TO_PLAN]", "").trim()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, status }: { label: string; status: string }) {
  const statusConfig: Record<string, { color: string; text: string }> = {
    approved: { color: "bg-emerald-600/20 text-emerald-400", text: "Approved" },
    rejected: { color: "bg-red-600/20 text-red-400", text: "Rejected" },
    pending: { color: "bg-zinc-800 text-zinc-500", text: "Pending" },
    completed: { color: "bg-emerald-600/20 text-emerald-400", text: "Completed" },
    in_progress: { color: "bg-amber-600/20 text-amber-400", text: "In Progress" },
    running: { color: "bg-amber-600/20 text-amber-400", text: "Running" },
    failed: { color: "bg-red-600/20 text-red-400", text: "Failed" },
    not_started: { color: "bg-zinc-800 text-zinc-500", text: "Not Started" },
    unknown: { color: "bg-zinc-800 text-zinc-500", text: "Unknown" },
  };

  const cfg = statusConfig[status] ?? statusConfig.unknown;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-center">
      <p className="text-[10px] text-zinc-500 mb-1">{label}</p>
      <span className={`text-xs px-2 py-0.5 rounded ${cfg.color}`}>
        {cfg.text}
      </span>
    </div>
  );
}
