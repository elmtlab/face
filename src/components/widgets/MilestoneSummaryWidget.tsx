"use client";

import { useState, useEffect } from "react";

interface MilestoneData {
  id: string;
  title: string;
  progress: number;
  openIssues: number;
  closedIssues: number;
  dueDate?: string;
}

export function MilestoneSummaryWidget() {
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/project/milestones")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.milestones) setMilestones(data.milestones);
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
        <p className="text-xs text-zinc-500">Loading milestones...</p>
      </div>
    );
  }

  if (milestones.length === 0) {
    return <div className="py-4 text-center"><p className="text-xs text-zinc-500">No milestones found.</p></div>;
  }

  return (
    <div className="space-y-3">
      {milestones.map((m) => (
        <div key={m.id} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-200">{m.title}</span>
            <span className="text-xs text-zinc-500">
              {m.closedIssues}/{m.openIssues + m.closedIssues} done
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${m.progress}%` }}
            />
          </div>
          {m.dueDate && (
            <p className="mt-1 text-xs text-zinc-600">Due {m.dueDate}</p>
          )}
        </div>
      ))}
    </div>
  );
}
