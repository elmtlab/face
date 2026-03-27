"use client";

import { useEffect, useState, useCallback } from "react";
import type { Issue, IssueStatus } from "@/lib/project/types";

interface Props {
  onSelectIssue: (id: string) => void;
  onAssignAgent: (id: string) => void;
}

const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_DOT: Record<string, string> = {
  backlog: "bg-zinc-500",
  todo: "bg-blue-400",
  in_progress: "bg-amber-400",
  in_review: "bg-purple-400",
  done: "bg-emerald-400",
  cancelled: "bg-red-400",
};

export function IssueListView({ onSelectIssue, onAssignAgent }: Props) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  const fetchIssues = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/project/issues?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setIssues(data.issues);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-zinc-400 mb-2">No provider configured</p>
          <p className="text-sm text-zinc-500">Go to Settings to connect a GitHub repository.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Issues</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          + New Issue
        </button>
      </div>

      {showCreate && (
        <CreateIssueForm
          onCreated={() => {
            setShowCreate(false);
            fetchIssues();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search issues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-500 text-zinc-200 placeholder-zinc-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200"
        >
          <option value="all">All Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse text-zinc-500 py-8 text-center">Loading...</div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-4 py-2 text-zinc-500 font-medium w-16">#</th>
                <th className="text-left px-4 py-2 text-zinc-500 font-medium">Title</th>
                <th className="text-left px-4 py-2 text-zinc-500 font-medium w-28">Status</th>
                <th className="text-left px-4 py-2 text-zinc-500 font-medium w-24">Priority</th>
                <th className="text-left px-4 py-2 text-zinc-500 font-medium w-32">Assignee</th>
                <th className="text-right px-4 py-2 text-zinc-500 font-medium w-20">Agent</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr
                  key={issue.id}
                  onClick={() => onSelectIssue(issue.id)}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{issue.number}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-zinc-200">{issue.title}</span>
                    {issue.labels.slice(0, 2).map((l) => (
                      <span
                        key={l.id}
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border"
                        style={{
                          borderColor: `#${l.color}40`,
                          color: `#${l.color}`,
                        }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[issue.status]}`} />
                      <span className="text-zinc-400 text-xs">{STATUS_LABELS[issue.status]}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400 capitalize">{issue.priority}</td>
                  <td className="px-4 py-2.5">
                    {issue.assignees[0] && (
                      <span className="flex items-center gap-1.5">
                        <img src={issue.assignees[0].avatar} alt="" className="w-4 h-4 rounded-full" />
                        <span className="text-xs text-zinc-400">{issue.assignees[0].name}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignAgent(issue.id);
                      }}
                      className="text-xs px-2 py-1 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors"
                    >
                      AI
                    </button>
                  </td>
                </tr>
              ))}
              {issues.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-zinc-500">
                    No issues found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateIssueForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/project/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3"
    >
      <input
        type="text"
        placeholder="Issue title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-500 text-zinc-200"
        autoFocus
      />
      <textarea
        placeholder="Description (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-500 text-zinc-200 resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Creating..." : "Create Issue"}
        </button>
      </div>
    </form>
  );
}
