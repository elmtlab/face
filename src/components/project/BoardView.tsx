"use client";

import { useEffect, useState } from "react";
import type { Issue, IssueStatus } from "@/lib/project/types";
import { useProjectEvents } from "@/lib/project/use-project-events";

interface ColumnData {
  id: string;
  name: string;
  status: IssueStatus;
  issues: Issue[];
}

interface Props {
  onSelectIssue: (id: string) => void;
  onAssignAgent: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  backlog: "text-zinc-500",
  todo: "text-blue-400",
  in_progress: "text-amber-400",
  in_review: "text-purple-400",
  done: "text-emerald-400",
  cancelled: "text-red-400",
};

const STATUS_DOT: Record<string, string> = {
  backlog: "bg-zinc-500",
  todo: "bg-blue-400",
  in_progress: "bg-amber-400",
  in_review: "bg-purple-400",
  done: "bg-emerald-400",
  cancelled: "bg-red-400",
};

export function BoardView({ onSelectIssue, onAssignAgent }: Props) {
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<string | null>(null);

  useEffect(() => {
    const fetchBoard = () => {
      fetch("/api/project/board")
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setColumns(data.project.columns);
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    };

    fetchBoard();
    const interval = setInterval(fetchBoard, 30_000);
    return () => clearInterval(interval);
  }, []);

  useProjectEvents(() => {
    // Re-fetch board data on any issue event
    fetch("/api/project/board")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setColumns(data.project.columns);
      });
  }, ["issue_created", "issue_updated"]);

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDropTargetColumn(columnId);
  };

  const handleDragLeave = (e: React.DragEvent, columnId: string) => {
    // Only clear if leaving the column itself, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDropTargetColumn((prev) => (prev === columnId ? null : prev));
    }
  };

  const handleDrop = (e: React.DragEvent, targetColumn: ColumnData) => {
    e.preventDefault();
    setDropTargetColumn(null);
    setDraggingIssueId(null);

    const issueId = e.dataTransfer.getData("text/plain");
    if (!issueId) return;

    // Find the source column and issue
    const sourceColumn = columns.find((col) =>
      col.issues.some((issue) => issue.id === issueId)
    );
    if (!sourceColumn || sourceColumn.id === targetColumn.id) return;

    const issue = sourceColumn.issues.find((i) => i.id === issueId);
    if (!issue) return;

    // Optimistic update
    const previousColumns = columns;
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === sourceColumn.id) {
          return { ...col, issues: col.issues.filter((i) => i.id !== issueId) };
        }
        if (col.id === targetColumn.id) {
          return {
            ...col,
            issues: [...col.issues, { ...issue, status: targetColumn.status }],
          };
        }
        return col;
      })
    );

    // Persist via API
    fetch(`/api/project/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetColumn.status }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to update issue status");
      })
      .catch(() => {
        // Revert on error
        setColumns(previousColumns);
      });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="animate-pulse">Loading board...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-zinc-400 mb-2">No provider configured</p>
          <p className="text-sm text-zinc-500">
            Go to Settings to connect a GitHub repository.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Board</h2>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={(e) => handleDragLeave(e, col.id)}
            onDrop={(e) => handleDrop(e, col)}
            className={`min-w-[280px] max-w-[320px] flex-shrink-0 bg-zinc-900 rounded-lg border transition-colors ${
              dropTargetColumn === col.id
                ? "border-indigo-500 bg-indigo-500/5"
                : "border-zinc-800"
            }`}
          >
            <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[col.status] ?? "bg-zinc-500"}`} />
              <span className={`text-sm font-medium ${STATUS_COLORS[col.status] ?? "text-zinc-400"}`}>
                {col.name}
              </span>
              <span className="text-xs text-zinc-600 ml-auto">{col.issues.length}</span>
            </div>
            <div className="p-2 space-y-2 max-h-[calc(100vh-180px)] overflow-y-auto">
              {col.issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onSelect={() => onSelectIssue(issue.id)}
                  onAssignAgent={() => onAssignAgent(issue.id)}
                  isDragging={draggingIssueId === issue.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", issue.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingIssueId(issue.id);
                  }}
                  onDragEnd={() => {
                    setDraggingIssueId(null);
                    setDropTargetColumn(null);
                  }}
                />
              ))}
              {col.issues.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">No issues</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueCard({
  issue,
  onSelect,
  onAssignAgent,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  issue: Issue;
  onSelect: () => void;
  onAssignAgent: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable="true"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`p-3 bg-zinc-850 bg-zinc-800/50 rounded-md border border-zinc-700/50 hover:border-zinc-600 cursor-pointer transition-colors group ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-zinc-500 font-mono">#{issue.number}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAssignAgent();
          }}
          title="Assign to AI agent"
          className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-all"
        >
          AI
        </button>
      </div>
      <p className="text-sm mt-1 text-zinc-200 leading-snug">{issue.title}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {issue.labels.slice(0, 3).map((l) => (
          <span
            key={l.id}
            className="text-[10px] px-1.5 py-0.5 rounded-full border"
            style={{
              borderColor: `#${l.color}40`,
              color: `#${l.color}`,
              backgroundColor: `#${l.color}10`,
            }}
          >
            {l.name}
          </span>
        ))}
        {issue.assignees.length > 0 && (
          <div className="flex -space-x-1 ml-auto">
            {issue.assignees.slice(0, 2).map((a) => (
              <img
                key={a.id}
                src={a.avatar}
                alt={a.name}
                title={a.name}
                className="w-5 h-5 rounded-full border border-zinc-800"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
