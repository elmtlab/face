"use client";

import { useState, useRef, useEffect } from "react";

interface Agent {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
}

export function TaskSubmit({
  onSubmitted,
  initialPrompt = "",
}: {
  onSubmitted?: () => void;
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [bubble, setBubble] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => {
        setAgents(data.filter((a) => a.installed && a.configured));
        const first = data.find((a) => a.installed && a.configured);
        if (first) setSelectedAgent(first.id);
      });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !selectedAgent || submitting) return;

    setSubmitting(true);
    setBubble(null);

    try {
      const res = await fetch("/api/tasks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
          prompt: prompt.trim(),
        }),
      });
      const data = await res.json();

      if (data.error) {
        setBubble({ message: data.error, type: "error" });
      } else {
        setBubble({
          message: `Task started! ID: ${data.taskId}`,
          type: "success",
        });
        setPrompt("");
        onSubmitted?.();
        setTimeout(() => setBubble(null), 4000);
      }
    } catch {
      setBubble({ message: "Failed to submit task", type: "error" });
    }
    setSubmitting(false);
  }

  if (agents.length === 0) return null;

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 backdrop-blur-sm transition-colors focus-within:border-zinc-600">
          {/* Agent selector */}
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="flex-shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Prompt input */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Describe a task for the agent..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-6 text-zinc-100 placeholder-zinc-600 focus:outline-none py-0.5"
            style={{ maxHeight: "120px" }}
          />

          {/* Submit button */}
          <button
            type="submit"
            disabled={!prompt.trim() || submitting}
            className="flex-shrink-0 rounded-lg bg-blue-600 p-2 text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/20 disabled:opacity-30 disabled:hover:bg-blue-600 disabled:hover:shadow-none"
          >
            {submitting ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
                <path d="M8 2a6 6 0 014.24 1.76" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.75a.75.75 0 011.06-.02l12 11.5a.75.75 0 01-1.04 1.08L1.52 2.81a.75.75 0 01-.02-1.06z" />
                <path d="M14.25 1.5a.75.75 0 01.75.75v5a.75.75 0 01-1.5 0V3.56L2.28 14.28a.75.75 0 01-1.06-1.06L12.44 2H8.75a.75.75 0 010-1.5h5.5z" />
              </svg>
            )}
          </button>
        </div>

        {/* Inline notification */}
        {bubble && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              bubble.type === "success"
                ? "border-emerald-500/20 bg-emerald-950/90 text-emerald-300"
                : "border-red-500/20 bg-red-950/90 text-red-300"
            }`}
          >
            {bubble.message}
          </div>
        )}
      </form>
    </div>
  );
}
