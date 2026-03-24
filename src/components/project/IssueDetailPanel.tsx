"use client";

import { useEffect, useState } from "react";
import type { Issue, IssueStatus } from "@/lib/project/types";

interface Props {
  issueId: string;
  onClose: () => void;
  onAssignAgent: (id: string) => void;
  onUpdate: () => void;
}

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export function IssueDetailPanel({ issueId, onClose, onAssignAgent, onUpdate }: Props) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/project/issues/${issueId}`)
      .then((r) => r.json())
      .then((data) => setIssue(data.issue))
      .finally(() => setLoading(false));
  }, [issueId]);

  const handleStatusChange = async (status: IssueStatus) => {
    await fetch(`/api/project/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setIssue((prev) => (prev ? { ...prev, status } : null));
    onUpdate();
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommenting(true);
    try {
      const res = await fetch(`/api/project/issues/${issueId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText }),
      });
      const { comment } = await res.json();
      setIssue((prev) =>
        prev ? { ...prev, comments: [...prev.comments, comment] } : null
      );
      setCommentText("");
    } finally {
      setCommenting(false);
    }
  };

  return (
    <div className="w-[420px] border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-300">
          {issue ? `#${issue.number}` : "Issue"}
        </span>
        <div className="flex items-center gap-2">
          {issue && (
            <button
              onClick={() => onAssignAgent(issueId)}
              className="text-xs px-2 py-1 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30"
            >
              Assign AI Agent
            </button>
          )}
          {issue?.url && (
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Open ↗
            </a>
          )}
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 animate-pulse">
          Loading...
        </div>
      ) : !issue ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          Issue not found
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Title & body */}
          <div className="p-4 space-y-3">
            <h3 className="text-lg font-medium text-zinc-100">{issue.title}</h3>

            {/* Status selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Status:</span>
              <select
                value={issue.status}
                onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
                className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
              <span>by {issue.author.name}</span>
              <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
              {issue.milestone && <span>Milestone: {issue.milestone}</span>}
            </div>

            {/* Labels */}
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {issue.labels.map((l) => (
                  <span
                    key={l.id}
                    className="text-[10px] px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: `#${l.color}40`,
                      color: `#${l.color}`,
                      backgroundColor: `#${l.color}10`,
                    }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            )}

            {/* Assignees */}
            {issue.assignees.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Assignees:</span>
                {issue.assignees.map((a) => (
                  <span key={a.id} className="flex items-center gap-1">
                    <img src={a.avatar} alt="" className="w-4 h-4 rounded-full" />
                    <span className="text-xs text-zinc-400">{a.name}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Body */}
            {issue.body && (
              <div className="mt-3 text-sm text-zinc-300 whitespace-pre-wrap border-t border-zinc-800 pt-3">
                {issue.body}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="border-t border-zinc-800 p-4">
            <h4 className="text-sm font-medium text-zinc-400 mb-3">
              Comments ({issue.comments.length})
            </h4>
            <div className="space-y-3">
              {issue.comments.map((c) => (
                <div key={c.id} className="bg-zinc-800/50 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {c.author.avatar && (
                      <img src={c.author.avatar} alt="" className="w-4 h-4 rounded-full" />
                    )}
                    <span className="text-xs font-medium text-zinc-300">{c.author.name}</span>
                    <span className="text-xs text-zinc-600">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddComment} className="mt-3">
              <textarea
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-500 text-zinc-200 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={commenting || !commentText.trim()}
                  className="px-3 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 transition-colors"
                >
                  {commenting ? "Posting..." : "Comment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
