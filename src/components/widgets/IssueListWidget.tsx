"use client";

import { useState, useEffect } from "react";

interface ListIssue {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  labels: Array<{ name: string }>;
}

interface IssueListWidgetProps {
  filterLabel?: string;
}

export function IssueListWidget({ filterLabel }: IssueListWidgetProps) {
  const [issues, setIssues] = useState<ListIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = filterLabel ? `?label=${encodeURIComponent(filterLabel)}` : "";
    fetch(`/api/project/issues${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.issues) setIssues(data.issues);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filterLabel]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <svg className="h-3.5 w-3.5 animate-spin text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeOpacity="0.3" /><path d="M8 2a6 6 0 014.24 1.76" />
        </svg>
        <p className="text-xs text-zinc-500">Loading issues...</p>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-zinc-500">
          {filterLabel ? `No issues with label "${filterLabel}"` : "No issues found"}
        </p>
      </div>
    );
  }

  const priorityColors: Record<string, string> = {
    urgent: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-blue-400",
    none: "text-zinc-500",
  };

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {issues.slice(0, 20).map((issue) => (
        <div
          key={issue.id}
          className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs"
        >
          <span className={`${priorityColors[issue.priority] ?? "text-zinc-500"}`}>
            {issue.priority === "none" ? "\u2022" : "\u25cf"}
          </span>
          <span className="text-zinc-500">#{issue.number}</span>
          <span className="flex-1 truncate text-zinc-300">{issue.title}</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
            {issue.status}
          </span>
        </div>
      ))}
      {issues.length > 20 && (
        <p className="text-xs text-zinc-600 pl-1">+{issues.length - 20} more</p>
      )}
    </div>
  );
}
