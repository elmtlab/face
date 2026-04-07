"use client";

import { useState, useEffect } from "react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ProjectFilterSelect } from "@/components/shared/ProjectFilterSelect";
import { useProjectContext } from "@/lib/projects/ProjectContext";

interface Column {
  id: string;
  name: string;
  status: string;
  issueIds: string[];
  issues?: BoardIssue[];
}

interface BoardIssue {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
}

interface WorkflowRef {
  issueId: string | null;
  projectId: string | null;
}

interface IssueBoardWidgetProps {
  readOnly?: boolean;
}

export function IssueBoardWidget({ readOnly }: IssueBoardWidgetProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [issueProjectMap, setIssueProjectMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const { filterProjectId } = useProjectContext();

  // Build an issue→project mapping from workflows
  useEffect(() => {
    fetch("/api/project/workflow")
      .then((r) => r.json())
      .then((d) => {
        const map = new Map<string, string>();
        for (const w of (d.workflows ?? []) as WorkflowRef[]) {
          if (w.issueId && w.projectId) {
            map.set(w.issueId, w.projectId);
          }
        }
        setIssueProjectMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/project/board").then((r) => r.ok ? r.json() : null),
      fetch("/api/project/issues").then((r) => r.ok ? r.json() : null),
    ])
      .then(([boardData, issueData]) => {
        const cols = boardData?.project?.columns ?? boardData?.columns ?? [];
        setColumns(cols);
        if (issueData?.issues) setIssues(issueData.issues);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingSpinner label="Loading board..." />;
  }

  if (columns.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-zinc-500">No board data available. Create issues or connect a provider in Settings.</p>
      </div>
    );
  }

  const issueMap = new Map(issues.map((i) => [i.id, i]));

  // Filter issues by selected project (matching TaskList pattern)
  const isIssueVisible = (issue: BoardIssue): boolean => {
    if (filterProjectId === "all") return true;
    return issueProjectMap.get(issue.id) === filterProjectId;
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <ProjectFilterSelect />
      </div>
      <div className={`flex gap-3 overflow-x-auto ${readOnly ? "pointer-events-none" : ""}`}>
        {columns.map((col) => {
          // Use hydrated issues from the board response if available, then apply project filter
          const allColIssues = col.issues ?? col.issueIds.map((id) => issueMap.get(id)).filter(Boolean) as BoardIssue[];
          const colIssues = allColIssues.filter(isIssueVisible);
          return (
            <div
              key={col.id}
              className="min-w-[180px] flex-shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/30 p-2"
            >
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                {col.name}{" "}
                <span className="text-zinc-600">{colIssues.length}</span>
              </h4>
              <div className="space-y-1">
                {colIssues.slice(0, 5).map((issue) => (
                  <div
                    key={issue.id}
                    className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs text-zinc-300"
                  >
                    <span className="text-zinc-500">#{issue.number}</span>{" "}
                    {issue.title}
                  </div>
                ))}
                {colIssues.length > 5 && (
                  <p className="text-xs text-zinc-600 pl-1">
                    +{colIssues.length - 5} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
