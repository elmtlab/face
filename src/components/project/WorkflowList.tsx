"use client";

import { useEffect, useState } from "react";

interface WorkflowSummary {
  id: string;
  phase: string;
  messages: { role: string; content: string }[];
  generatedStory: { title: string } | null;
  issueUrl: string | null;
  taskId: string | null;
  pmApproval: string;
  engApproval: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  onSelect: (id: string) => void;
  refreshKey: number;
}

const PHASE_COLORS: Record<string, string> = {
  gathering: "bg-blue-600/20 text-blue-400",
  planning: "bg-purple-600/20 text-purple-400",
  review: "bg-amber-600/20 text-amber-400",
  approved: "bg-emerald-600/20 text-emerald-400",
  implementing: "bg-orange-600/20 text-orange-400",
  done: "bg-zinc-700 text-zinc-300",
};

export function WorkflowList({ onSelect, refreshKey }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);

  useEffect(() => {
    const fetchWorkflows = () => {
      fetch("/api/project/workflow")
        .then((r) => r.json())
        .then((d) => setWorkflows(d.workflows ?? []));
    };

    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 30_000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  if (workflows.length === 0) return null;

  return (
    <div className="p-4 border-t border-zinc-800">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
        Workflows
      </h3>
      <div className="space-y-1.5">
        {workflows.slice(0, 10).map((w) => {
          const title =
            w.generatedStory?.title ??
            w.messages.find((m) => m.role === "user")?.content.slice(0, 60) ??
            "New workflow";
          return (
            <button
              key={w.id}
              onClick={() => onSelect(w.id)}
              className="w-full text-left px-3 py-2 rounded-md bg-zinc-800/30 hover:bg-zinc-800 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-300 truncate">{title}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    PHASE_COLORS[w.phase] ?? "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {w.phase}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-zinc-600">
                  {new Date(w.updatedAt).toLocaleDateString()}
                </span>
                {w.issueUrl && (
                  <span className="text-[10px] text-zinc-600">• has issue</span>
                )}
                {w.taskId && (
                  <span className="text-[10px] text-zinc-600">• has task</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
