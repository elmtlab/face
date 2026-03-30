"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TaskStatusPanel } from "./TaskStatusPanel";
import { useRoleSlug } from "@/components/shared/useRoleSlug";
import { RoleTagBadge } from "@/components/shared/RoleTagBadge";

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

interface PullRequestInfo {
  number: number;
  url: string;
  repo: string;
  branch: string;
  status: "open" | "merged" | "closed";
}

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
  pr: PullRequestInfo | null;
  creatorRole: string | null;
  assignedRoles: string[];
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
  workflowId?: string | null; // if provided, load existing workflow
  onClose: () => void;
  onCreated: () => void; // refresh parent
}

export function RequirementWorkflow({ workflowId, onClose, onCreated }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { currentSlug: userRoleSlug } = useRoleSlug();

  // Load existing workflow, or set up a local-only placeholder for new ones.
  // New workflows are only persisted on the first message (see sendMessage).
  useEffect(() => {
    if (workflowId) {
      fetch(`/api/project/workflow/${workflowId}`)
        .then((r) => r.json())
        .then((d) => setWorkflow(d.workflow));
    } else {
      // Local-only placeholder — not persisted until the user sends a message
      setWorkflow({
        id: "",
        phase: "gathering",
        messages: [],
        generatedStory: null,
        issueId: null,
        issueUrl: null,
        pmApproval: "pending",
        engApproval: "pending",
        taskId: null,
        pr: null,
        creatorRole: null,
        assignedRoles: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, [workflowId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [workflow?.messages.length]);

  // Focus input
  useEffect(() => {
    if (workflow && !loading) inputRef.current?.focus();
  }, [workflow, loading]);

  // Persist workflow "done" state to disk and update local state
  const markDone = useCallback(async () => {
    if (!workflow || !workflow.id) return;
    setWorkflow((w) =>
      w ? { ...w, phase: "done", updatedAt: new Date().toISOString() } : null
    );
    // Persist to disk
    try {
      await fetch(`/api/project/workflow/${workflow.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
    } catch {
      // best-effort
    }
    onCreated();
  }, [workflow?.id, onCreated]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async () => {
    if (!workflow || !input.trim() || loading) return;
    const messageText = input.trim();
    setLoading(true);
    setError(null);
    setInput("");

    // Immediately show user message in chat
    const userMessage: ChatMessage = {
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    };
    setWorkflow((w) =>
      w ? { ...w, messages: [...w.messages, userMessage] } : null
    );

    try {
      let wfId = workflow.id;

      // If this is a brand-new workflow (not yet persisted), create it first
      if (!wfId) {
        const createRes = await fetch("/api/project/workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorRole: userRoleSlug ?? undefined,
            assignedRoles: userRoleSlug ? [userRoleSlug] : [],
          }),
        });
        const createData = await createRes.json();
        if (!createData.workflow?.id) throw new Error("Failed to create workflow");
        wfId = createData.workflow.id;
        setWorkflow((w) => (w ? { ...w, id: wfId } : null));
      }

      const res = await fetch(`/api/project/workflow/${wfId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
      });
      const data = await res.json();
      if (data.workflow) setWorkflow(data.workflow);
      if (data.error) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const doAction = async (action: string, extra?: Record<string, string>) => {
    if (!workflow || !workflow.id || loading) return;
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
      if (data.error) {
        setError(data.error);
      } else if (action === "create_issue" || action === "implement") {
        onCreated();
      }
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
            loading={loading}
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
            onAssignedRolesChange={(roles) => {
              setWorkflow((w) => w ? { ...w, assignedRoles: roles } : null);
              if (workflow.id) {
                fetch(`/api/project/workflow/${workflow.id}/chat`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "update_roles", assignedRoles: roles }),
                });
              }
            }}
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
          <ImplementingView
            workflow={workflow}
            onDone={markDone}
            onTaskRestarted={(newTaskId) => {
              setWorkflow((w) => w ? { ...w, taskId: newTaskId, updatedAt: new Date().toISOString() } : null);
            }}
          />
        )}

        {/* Done */}
        {workflow.phase === "done" && (
          <DoneView
            workflow={workflow}
            onClose={onClose}
            onReopen={(newTaskId) => {
              setWorkflow((w) =>
                w ? { ...w, phase: "implementing", taskId: newTaskId, updatedAt: new Date().toISOString() } : null
              );
              onCreated();
            }}
          />
        )}
      </div>

      {/* Input area (gathering phase) */}
      {(workflow.phase === "gathering" || workflow.phase === "planning") && (
        <div className="border-t border-zinc-800 p-3">
          {error && (
            <p className="text-xs text-red-400 mb-2 bg-red-600/10 px-3 py-1.5 rounded">{error}</p>
          )}

          {workflow.phase === "gathering" && workflow.messages.length >= 2 && (
            <div className="flex justify-center mb-3">
              <button
                onClick={() => doAction("ready_to_plan")}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                Ready to Plan →
              </button>
            </div>
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
  loading,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  loading?: boolean;
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

      {loading && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm bg-zinc-800 text-zinc-200 border border-zinc-700">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                AI Agent
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
              <span className="text-xs text-zinc-500 ml-2">Thinking...</span>
            </div>
          </div>
        </div>
      )}

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
  onAssignedRolesChange,
  loading,
}: {
  story: GeneratedStory;
  workflow: WorkflowState;
  onApprove: (role: string) => void;
  onReject: (role: string) => void;
  onCreateIssue: () => void;
  onAssignedRolesChange: (roles: string[]) => void;
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

      {/* Role tags */}
      <RoleTagSelector
        creatorRole={workflow.creatorRole}
        assignedRoles={workflow.assignedRoles}
        onChange={onAssignedRolesChange}
      />

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
        This will spawn an AI agent task — progress shown here in real time
      </p>
    </div>
  );
}

function ImplementingView({
  workflow,
  onDone,
  onTaskRestarted,
}: {
  workflow: WorkflowState;
  onDone: () => void;
  onTaskRestarted: (newTaskId: string) => void;
}) {
  const [restarting, setRestarting] = useState(false);

  const handleStatusChange = useCallback(
    (status: string) => {
      // Only auto-advance on success, not on failure
      if (status === "completed") onDone();
    },
    [onDone]
  );

  const handleRestart = useCallback(
    async (taskId: string) => {
      if (restarting || !workflow.id) return;
      setRestarting(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/restart`, { method: "POST" });
        const data = await res.json();
        if (!data.taskId) return;

        await fetch(`/api/project/workflow/${workflow.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_task", taskId: data.taskId }),
        });

        onTaskRestarted(data.taskId);
      } catch (err) {
        console.error("Failed to restart implementation:", err);
      } finally {
        setRestarting(false);
      }
    },
    [restarting, workflow.id, onTaskRestarted]
  );

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center animate-pulse shrink-0">
          <span className="text-lg">&#x26A1;</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-200">Implementation In Progress</h3>
          <p className="text-xs text-zinc-500">AI agent is working on this story</p>
        </div>
      </div>

      {workflow.issueUrl && (
        <a
          href={workflow.issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-indigo-400 hover:text-indigo-300"
        >
          GitHub Issue: {workflow.issueUrl} &#x2197;
        </a>
      )}

      {workflow.taskId && (
        <TaskStatusPanel
          taskId={workflow.taskId}
          onStatusChange={handleStatusChange}
          onRestart={handleRestart}
        />
      )}

      {restarting && (
        <p className="text-xs text-indigo-400 animate-pulse">Restarting task...</p>
      )}
    </div>
  );
}

function DoneView({
  workflow,
  onClose,
  onReopen,
}: {
  workflow: WorkflowState;
  onClose: () => void;
  onReopen: (newTaskId: string) => void;
}) {
  const [taskFailed, setTaskFailed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const handleStatusChange = useCallback((status: string) => {
    if (status === "failed" || status === "cancelled") {
      setTaskFailed(true);
    }
  }, []);

  const handleRestart = useCallback(
    async (taskId: string) => {
      if (restarting || !workflow.id) return;
      setRestarting(true);
      try {
        // 1. Restart the task
        const res = await fetch(`/api/tasks/${taskId}/restart`, { method: "POST" });
        const data = await res.json();
        if (!data.taskId) return;

        // 2. Reopen the workflow
        await fetch(`/api/project/workflow/${workflow.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reopen", taskId: data.taskId }),
        });

        onReopen(data.taskId);
      } catch (err) {
        console.error("Failed to restart implementation:", err);
      } finally {
        setRestarting(false);
      }
    },
    [restarting, workflow.id, onReopen]
  );

  return (
    <div className="p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            taskFailed ? "bg-red-600/20" : "bg-emerald-600/20"
          }`}
        >
          <span className="text-lg">{taskFailed ? "!" : "✓"}</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-200">
            {taskFailed ? "Implementation Failed" : "Implementation Complete"}
          </h3>
          <p className="text-xs text-zinc-500">
            {taskFailed
              ? "The AI agent encountered an error while working on this story"
              : "The AI agent has finished working on this story"}
          </p>
        </div>
      </div>

      {workflow.issueUrl && (
        <a
          href={workflow.issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-indigo-400 hover:text-indigo-300"
        >
          GitHub Issue: {workflow.issueUrl} ↗
        </a>
      )}

      {workflow.taskId && (
        <TaskStatusPanel
          taskId={workflow.taskId}
          onStatusChange={handleStatusChange}
          onRestart={handleRestart}
        />
      )}

      {restarting && (
        <p className="text-xs text-indigo-400 animate-pulse">Restarting task...</p>
      )}

      {workflow.pr?.status === "merged" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600/10 border border-emerald-600/20">
          <span className="text-emerald-400 text-sm">✓</span>
          <span className="text-xs text-emerald-300">
            Auto-completed via PR #{workflow.pr.number} merge
          </span>
          {workflow.pr.url && (
            <a
              href={workflow.pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 ml-auto"
            >
              View PR ↗
            </a>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {taskFailed && workflow.taskId && (
          <button
            onClick={() => handleRestart(workflow.taskId!)}
            disabled={restarting}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {restarting ? "Restarting..." : "Retry Implementation"}
          </button>
        )}
        {!workflow.pr && (
          <button
            onClick={onClose}
            className={`px-4 py-2 text-sm rounded-md ${
              taskFailed
                ? "border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "bg-indigo-600 hover:bg-indigo-500"
            } transition-colors`}
          >
            {taskFailed ? "Close" : "Done"}
          </button>
        )}
      </div>
    </div>
  );
}

function RoleTagSelector({
  creatorRole,
  assignedRoles,
  onChange,
}: {
  creatorRole: string | null;
  assignedRoles: string[];
  onChange: (roles: string[]) => void;
}) {
  const { roles } = useRoleSlug();

  const toggle = (slug: string) => {
    if (assignedRoles.includes(slug)) {
      onChange(assignedRoles.filter((r) => r !== slug));
    } else {
      onChange([...assignedRoles, slug]);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-400">Role Tags</span>
        {creatorRole && (
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            Creator: <RoleTagBadge role={creatorRole} variant="creator" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => {
          const active = assignedRoles.includes(r.slug);
          return (
            <button
              key={r.slug}
              onClick={() => toggle(r.slug)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                active
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-600/40"
                  : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {r.slug}
            </button>
          );
        })}
      </div>
    </div>
  );
}
