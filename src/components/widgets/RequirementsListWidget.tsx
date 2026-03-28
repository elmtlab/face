"use client";

import { useState, useEffect } from "react";

interface Workflow {
  id: string;
  title: string;
  phase: string;
  createdAt: string;
}

export function RequirementsListWidget() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/project/workflow")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.workflows) setWorkflows(data.workflows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <svg className="h-3.5 w-3.5 animate-spin text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeOpacity="0.3" /><path d="M8 2a6 6 0 014.24 1.76" />
        </svg>
        <p className="text-xs text-zinc-500">Loading requirements...</p>
      </div>
    );
  }

  if (workflows.length === 0) {
    return <div className="py-4 text-center"><p className="text-xs text-zinc-500">No requirements yet.</p></div>;
  }

  const phaseColors: Record<string, string> = {
    draft: "text-zinc-500",
    refining: "text-yellow-400",
    approved: "text-green-400",
    implemented: "text-blue-400",
  };

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {workflows.map((w) => (
        <div
          key={w.id}
          className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs"
        >
          <span className="flex-1 truncate text-zinc-300">{w.title}</span>
          <span className={`${phaseColors[w.phase] ?? "text-zinc-500"}`}>
            {w.phase}
          </span>
        </div>
      ))}
    </div>
  );
}
