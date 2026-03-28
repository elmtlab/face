"use client";

import { useState, useEffect } from "react";

interface Column {
  id: string;
  name: string;
  status: string;
  issueIds: string[];
}

interface BoardIssue {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
}

interface IssueBoardWidgetProps {
  readOnly?: boolean;
}

export function IssueBoardWidget({ readOnly }: IssueBoardWidgetProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/project/board").then((r) => r.ok ? r.json() : null),
      fetch("/api/project/issues").then((r) => r.ok ? r.json() : null),
    ])
      .then(([boardData, issueData]) => {
        if (boardData?.columns) setColumns(boardData.columns);
        if (issueData?.issues) setIssues(issueData.issues);
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
        <p className="text-xs text-zinc-500">Loading board...</p>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-zinc-500">No project configured. Connect a provider in Settings.</p>
      </div>
    );
  }

  const issueMap = new Map(issues.map((i) => [i.id, i]));

  return (
    <div className={`flex gap-3 overflow-x-auto ${readOnly ? "pointer-events-none" : ""}`}>
      {columns.map((col) => (
        <div
          key={col.id}
          className="min-w-[180px] flex-shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2"
        >
          <h4 className="mb-2 text-xs font-medium text-zinc-400">
            {col.name}{" "}
            <span className="text-zinc-600">{col.issueIds.length}</span>
          </h4>
          <div className="space-y-1">
            {col.issueIds.slice(0, 5).map((id) => {
              const issue = issueMap.get(id);
              if (!issue) return null;
              return (
                <div
                  key={id}
                  className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs text-zinc-300"
                >
                  <span className="text-zinc-500">#{issue.number}</span>{" "}
                  {issue.title}
                </div>
              );
            })}
            {col.issueIds.length > 5 && (
              <p className="text-xs text-zinc-600 pl-1">
                +{col.issueIds.length - 5} more
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
