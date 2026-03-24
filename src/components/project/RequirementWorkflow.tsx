"use client";

import { useState, useEffect, useRef } from "react";

// ── Types (mirroring server) ───────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface GeneratedStory {
  title: string;
  body: string;
  labels: string[];
  priority: string;
  estimatedEffort: string;
}

type Phase = "gathering" | "planning" | "review" | "approved" | "implementing" | "done";
type ApprovalStatus = "pending" | "approved" | "rejected";

interface WorkflowState {
  id: string;
  phase: Phase;
  messages: ChatMessage[];
  generatedStory: GeneratedStory | null;
  issueId: string | null;
  issueUrl: string | null;
  pmApproval: ApprovalStatus;
  engApproval: ApprovalStatus;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Phase indicator ────────────────────────────────────────────────

const PHASES: { key: Phase; label: string }[] = [
  { key: "gathering", label: "Gather Requirements" },
  { key: "planning", label: "Generate Story" },
  { key: "review", label: "Review & Approve" },
  { key: "approved", label: "Ready" },
  { key: "implementing", label: "Implementing" },
  { key: "done", label: "Done" },
];

function PhaseBar({ current }: { current: Phase }) {
  const idx = PHASES.findIndex((p) => p.key === current);
  return (
    <div className="flex items-center gap-1 px-4 py-3 border-b border-zinc-800 overflow-x-auto">
      {PHASES.map((p, i) => (
        <div key={p.key} className="flex items-center gap-1 shrink-0">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < idx
                ? "bg-emerald-600 text-white"
                : i === idx
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {i < idx ? "✓" : i + 1}
          </div>
          <span
            className={`text-xs ${
              i === idx ? "text-zinc-200 font-medium" : "text-zinc-500"
            }`}
          >
            {p.label}
          </span>
          {i < PHASES.length - 1 && (
            <div className={`w-6 h-px ${i < idx ? "bg-emerald-600" : "bg-zinc-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: () => void; // refresh parent
}

export function RequirementWorkflow({ onClose, onCreated }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Create workflow on mount
  useEffect(() => {
    fetch("/api/project/workflow", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setWorkflow(d.workflow));
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [workflow?.messages.length]);

  // Focus input
  useEffect(() => {
    if (workflow && !loading) inputRef.current?.focus();
  }, [workflow, loading]);

  // Poll task status during implementation
  useEffect(() => {
    if (workflow?.phase !== "implementing" || !workflow.taskId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${workflow.taskId}`);
        const data = await res.json();
        if (data.task?.status === "completed" || data.task?.status === "failed") {
          setWorkflow((w) =>
            w ? { ...w, phase: "done", updatedAt: new Date().toISOString() } : null
          );
          clearInterval(interval);
          onCreated();
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [workflow?.phase, workflow?.taskId, onCreated]);

  const sendMessage = async () => {
    if (!workflow || !input.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/project/workflow/${workflow.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim() }),
      });
      const data = await res.json();
      if (data.workflow) setWorkflow(data.workflow);
      if (data.error) setError(data.error);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const doAction = async (action: string, extra?: Record<string, string>) => {
    if (!workflow || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/project/workflow/${workflow.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (data.workflow) setWorkflow(data.workflow);
      if (data.error) setError(data.error);
      if (action === "create_issue" || action === "implement") onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Starting workflow...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">New Requirement</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">×</button>
      </div>

      <PhaseBar current={workflow.phase} />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Chat messages */}
        {(workflow.phase === "gathering" || workflow.phase === "planning") && (
          <ChatArea
            messages={workflow.messages}
            chatEndRef={chatEndRef}
          />
        )}

        {/* Story review */}
        {workflow.phase === "review" && workflow.generatedStory && (
          <StoryReview
            story={workflow.generatedStory}
            workflow={workflow}
            onApprove={(role) => doAction("approve", { role })}
            onReject={(role) => doAction("reject", { role })}
            onCreateIssue={() => doAction("create_issue")}
            loading={loading}
          />
        )}

        {/* Approved — ready to implement */}
        {workflow.phase === "approved" && (
          <ApprovedView
            workflow={workflow}
            onImplement={() => doAction("implement")}
            loading={loading}
          />
        )}

        {/* Implementing */}
        {workflow.phase === "implementing" && (
          <ImplementingView workflow={workflow} />
        )}

        {/* Done */}
        {workflow.phase === "done" && (
          <DoneView workflow={workflow} onClose={onClose} />
        )}
      </div>

      {/* Input area (gathering phase) */}
      {(workflow.phase === "gathering" || workflow.phase === "planning") && (
        <div className="border-t border-zinc-800 p-3">
          {error && (
            <p className="text-xs text-red-400 mb-2 bg-red-600/10 px-3 py-1.5 rounded">{error}</p>
          )}

          {workflow.phase === "planning" && (
            <div className="flex justify-center mb-3">
              <button
                onClick={() => doAction("generate_story")}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {loading ? "Generating story..." : "Generate Story from Conversation"}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                workflow.messages.length === 0
                  ? "Describe what you want to build..."
                  : "Answer the question or add more context..."
              }
              rows={2}
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-200 placeholder-zinc-500 resize-none disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-4 self-end py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function ChatArea({
  messages,
  chatEndRef,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="p-4 space-y-4">
      {messages.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-400 text-sm mb-2">Describe your requirement</p>
          <p className="text-zinc-600 text-xs max-w-md mx-auto">
            The AI will ask clarifying questions to understand the full scope,
            then generate a structured story for your project board.
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-indigo-600/20 text-indigo-100 border border-indigo-600/30"
                : "bg-zinc-800 text-zinc-200 border border-zinc-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {msg.role === "user" ? "You" : "AI Agent"}
              </span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">
              {msg.content.replace("[READY_TO_PLAN]", "").trim()}
            </p>
          </div>
        </div>
      ))}

      <div ref={chatEndRef} />
    </div>
  );
}

function StoryReview({
  story,
  workflow,
  onApprove,
  onReject,
  onCreateIssue,
  loading,
}: {
  story: GeneratedStory;
  workflow: WorkflowState;
  onApprove: (role: string) => void;
  onReject: (role: string) => void;
  onCreateIssue: () => void;
  loading: boolean;
}) {
  return (
    <div className="p-4 space-y-4">
      {/* Story card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Generated Story</h3>
          <div className="flex gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
              {story.priority}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {story.estimatedEffort}
            </span>
          </div>
        </div>

        <div className="p-4">
          <h4 className="text-base font-medium text-zinc-100 mb-3">{story.title}</h4>
          <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed space-y-2">
            {story.body.split("\n").map((line, i) => {
              if (line.startsWith("## ")) {
                return (
                  <h5 key={i} className="text-zinc-200 font-semibold mt-4 mb-1 text-sm">
                    {line.replace("## ", "")}
                  </h5>
                );
              }
              if (line.startsWith("- [ ] ")) {
                return (
                  <label key={i} className="flex items-start gap-2 text-zinc-400">
                    <input type="checkbox" disabled className="mt-1 accent-indigo-500" />
                    <span>{line.replace("- [ ] ", "")}</span>
                  </label>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <p key={i} className="text-zinc-400 pl-4">
                    • {line.replace("- ", "")}
                  </p>
                );
              }
              return line.trim() ? <p key={i}>{line}</p> : <br key={i} />;
            })}
          </div>

          {story.labels.length > 0 && (
            <div className="flex gap-1.5 mt-4">
              {story.labels.map((l) => (
                <span
                  key={l}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-600 text-zinc-400"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create issue button */}
      {!workflow.issueId && (
        <button
          onClick={onCreateIssue}
          disabled={loading}
          className="w-full px-4 py-2.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create Issue in GitHub"}
        </button>
      )}

      {workflow.issueUrl && (
        <a
          href={workflow.issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-indigo-400 hover:text-indigo-300"
        >
          Issue created: {workflow.issueUrl} ↗
        </a>
      )}

      {/* Approvals */}
      <div className="grid grid-cols-2 gap-3">
        <ApprovalCard
          role="pm"
          label="Project Manager"
          status={workflow.pmApproval}
          onApprove={() => onApprove("pm")}
          onReject={() => onReject("pm")}
          loading={loading}
        />
        <ApprovalCard
          role="eng"
          label="Engineer"
          status={workflow.engApproval}
          onApprove={() => onApprove("eng")}
          onReject={() => onReject("eng")}
          loading={loading}
        />
      </div>
    </div>
  );
}

function ApprovalCard({
  label,
  status,
  onApprove,
  onReject,
  loading,
}: {
  role: string;
  label: string;
  status: ApprovalStatus;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            status === "approved"
              ? "bg-emerald-600/20 text-emerald-400"
              : status === "rejected"
                ? "bg-red-600/20 text-red-400"
                : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {status}
        </span>
      </div>
      {status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            disabled={loading}
            className="flex-1 px-2 py-1.5 text-xs rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={loading}
            className="flex-1 px-2 py-1.5 text-xs rounded bg-red-600/10 text-red-400 hover:bg-red-600/20 disabled:opacity-50"
          >
            Request Changes
          </button>
        </div>
      )}
    </div>
  );
}

function ApprovedView({
  workflow,
  onImplement,
  loading,
}: {
  workflow: WorkflowState;
  onImplement: () => void;
  loading: boolean;
}) {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-full bg-emerald-600/20 flex items-center justify-center">
        <span className="text-2xl">✓</span>
      </div>
      <h3 className="text-lg font-semibold text-zinc-200">Story Approved</h3>
      <p className="text-sm text-zinc-400 text-center max-w-md">
        Both PM and Engineering have approved this story.
        {workflow.issueUrl && (
          <>
            {" "}Issue:{" "}
            <a href={workflow.issueUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
              {workflow.issueUrl}
            </a>
          </>
        )}
      </p>
      <button
        onClick={onImplement}
        disabled={loading}
        className="px-6 py-2.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
      >
        {loading ? "Triggering..." : "Start Implementation with AI Agent"}
      </button>
      <p className="text-[10px] text-zinc-600 text-center">
        This will spawn an AI agent task visible in the FACE dashboard
      </p>
    </div>
  );
}

function ImplementingView({ workflow }: { workflow: WorkflowState }) {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-full bg-amber-600/20 flex items-center justify-center animate-pulse">
        <span className="text-2xl">⚡</span>
      </div>
      <h3 className="text-lg font-semibold text-zinc-200">Implementation In Progress</h3>
      <p className="text-sm text-zinc-400 text-center">
        AI agent is working on this story.
      </p>
      {workflow.taskId && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-center">
          <p className="text-xs text-zinc-500 mb-1">Task ID</p>
          <code className="text-sm text-zinc-300 font-mono">{workflow.taskId}</code>
        </div>
      )}
      <a
        href="/"
        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        View in FACE Dashboard →
      </a>
    </div>
  );
}

function DoneView({ workflow, onClose }: { workflow: WorkflowState; onClose: () => void }) {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-full bg-emerald-600/20 flex items-center justify-center">
        <span className="text-2xl">✓</span>
      </div>
      <h3 className="text-lg font-semibold text-zinc-200">Implementation Complete</h3>
      <p className="text-sm text-zinc-400 text-center max-w-md">
        The AI agent has finished working on this story.
        Check the FACE dashboard for results.
      </p>
      <div className="flex gap-3">
        {workflow.issueUrl && (
          <a
            href={workflow.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            View Issue ↗
          </a>
        )}
        <a
          href="/"
          className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          FACE Dashboard
        </a>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500"
        >
          Done
        </button>
      </div>
    </div>
  );
}
