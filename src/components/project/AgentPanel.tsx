"use client";

import { useEffect, useState } from "react";
import type { Issue } from "@/lib/project/types";
import { TaskStatusPanel } from "./TaskStatusPanel";

interface Props {
  issueId: string;
  onClose: () => void;
}

export function AgentPanel({ issueId, onClose }: Props) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskDone, setTaskDone] = useState(false);

  useEffect(() => {
    fetch(`/api/project/issues/${issueId}`)
      .then((r) => r.json())
      .then((data) => {
        setIssue(data.issue);
        if (data.issue) {
          setPrompt(
            `Issue #${data.issue.number}: ${data.issue.title}\n\n${data.issue.body ?? ""}\n\nPlease work on this issue.`
          );
        }
      });
  }, [issueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          agent: "claude-code",
        }),
      });
      const data = await res.json();
      if (data.task?.id) {
        setTaskId(data.task.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-[420px] border-l border-zinc-800 bg-zinc-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-300">AI Agent</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {issue && (
          <div className="bg-zinc-800/50 rounded-md p-3">
            <p className="text-xs text-zinc-500 mb-1">Working on issue:</p>
            <p className="text-sm text-zinc-200">
              #{issue.number} {issue.title}
            </p>
          </div>
        )}

        {!taskId ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Agent Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-500 text-zinc-200 resize-none font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !prompt.trim()}
              className="w-full px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting..." : "Send to AI Agent"}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <TaskStatusPanel
              taskId={taskId}
              onStatusChange={(status) => {
                if (status === "completed" || status === "failed") {
                  setTaskDone(true);
                }
              }}
            />

            {taskDone && (
              <button
                onClick={() => {
                  setTaskId(null);
                  setTaskDone(false);
                }}
                className="w-full px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Send Another Task
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
