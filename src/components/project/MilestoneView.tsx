"use client";

import { useEffect, useState } from "react";
import type { Milestone } from "@/lib/project/types";

interface Props {
  onFilterBoard: (milestoneTitle: string) => void;
}

export function MilestoneView({ onFilterBoard }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/project/milestones")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setMilestones(data.milestones);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Loading milestones...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-zinc-400 mb-2">No provider configured</p>
          <p className="text-sm text-zinc-500">Go to Settings to connect a project provider.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Milestones</h2>
      {milestones.length === 0 ? (
        <p className="text-zinc-500 text-sm">No milestones found</p>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => (
            <MilestoneCard key={m.id} milestone={m} onFilter={() => onFilterBoard(m.title)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneCard({ milestone, onFilter }: { milestone: Milestone; onFilter: () => void }) {
  const total = milestone.openIssues + milestone.closedIssues;
  const daysRemaining = milestone.dueDate
    ? Math.ceil((new Date(milestone.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  let urgencyColor = "text-zinc-500";
  let urgencyBg = "";
  if (daysRemaining !== null) {
    if (daysRemaining < 0) {
      urgencyColor = "text-red-400";
      urgencyBg = "bg-red-600/10 border-red-600/20";
    } else if (daysRemaining <= 7) {
      urgencyColor = "text-amber-400";
      urgencyBg = "bg-amber-600/10 border-amber-600/20";
    } else {
      urgencyColor = "text-emerald-400";
      urgencyBg = "bg-emerald-600/10 border-emerald-600/20";
    }
  }

  return (
    <button
      onClick={onFilter}
      className="w-full text-left p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-200">{milestone.title}</h3>
        <div className="flex items-center gap-2">
          {daysRemaining !== null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${urgencyBg} ${urgencyColor}`}>
              {daysRemaining < 0
                ? `${Math.abs(daysRemaining)}d overdue`
                : daysRemaining === 0
                  ? "Due today"
                  : `${daysRemaining}d remaining`}
            </span>
          )}
          {milestone.dueDate && (
            <span className="text-[10px] text-zinc-600">
              {new Date(milestone.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {milestone.description && (
        <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{milestone.description}</p>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${milestone.progress}%` }}
          />
        </div>
        <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
          {milestone.closedIssues}/{total} ({milestone.progress}%)
        </span>
      </div>
    </button>
  );
}
