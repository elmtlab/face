"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TaskStatusPanel } from "./TaskStatusPanel";
import { useRoleSlug } from "@/components/shared/useRoleSlug";
import { RoleTagBadge } from "@/components/shared/RoleTagBadge";
import { useProjectContext } from "@/lib/projects/ProjectContext";

// ── Types (mirroring server) ───────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface QueuedMessage {
  id: string;
  content: string;
  queuedAt: string;
}

interface GeneratedStory {
  title: string;
  body: string;
  labels: string[];
  priority: string;
  estimatedEffort: string;
}

type Phase = "gathering" | "planning" | "evaluating" | "review" | "approved" | "debating" | "implementing" | "done";

interface DebateMessage {
  role: "planner" | "evaluator" | "generator";
  content: string;
  timestamp: string;
  isApproval: boolean;
}

interface ConsensusState {
  messages: DebateMessage[];
  approvals: Record<string, boolean>;
  round: number;
  maxRounds: number;
  reached: boolean;
  escalated: boolean;
  startedAt: string;
  completedAt: string | null;
}

interface PullRequestInfo {
  number: number;
  url: string;
  repo: string;
  branch: string;
  status: "open" | "merged" | "closed";
  conflicted?: boolean;
}

interface RequirementRevision {
  version: number;
  requirement: string;
  story: GeneratedStory | null;
  taskId: string | null;
  pr: PullRequestInfo | null;
  timestamp: string;
}

interface WorkflowState {
  id: string;
  phase: Phase;
  messages: ChatMessage[];
  generatedStory: GeneratedStory | null;
  issueId: string | null;
  issueUrl: string | null;
  taskId: string | null;
  pr: PullRequestInfo | null;
  creatorRole: string | null;
  assignedRoles: string[];
  projectId: string | null;
  revisions: RequirementRevision[];
  evaluatorAssessment: string | null;
  consensus: ConsensusState | null;
  createdAt: string;
  updatedAt: string;
}

// ── Phase indicator ────────────────────────────────────────────────

const PHASES: { key: Phase; label: string }[] = [
  { key: "gathering", label: "Gather" },
  { key: "planning", label: "Plan" },
  { key: "evaluating", label: "Evaluate" },
  { key: "review", label: "Review" },
  { key: "approved", label: "Ready" },
  { key: "debating", label: "Consensus" },
  { key: "implementing", label: "Implement" },
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
  /** Project to associate with new workflows */
  activeProjectId?: string | null;
}

export function RequirementWorkflow({ workflowId, onClose, onCreated, activeProjectId }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [withdrawnId, setWithdrawnId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevPhaseRef = useRef<Phase | undefined>(undefined);
  const queueIdCounter = useRef(0);
  const { currentSlug: userRoleSlug } = useRoleSlug();

  // Project selection for new workflows — reuses data from ProjectContext
  const { activeProjectId: ctxActiveProjectId, projects, loaded: projectsLoaded } = useProjectContext();
  const effectiveActiveProjectId = activeProjectId ?? ctxActiveProjectId;
  const isNewWorkflow = !workflowId;
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(effectiveActiveProjectId ?? null);

  // Auto-select when only one project exists and nothing is selected yet
  useEffect(() => {
    if (isNewWorkflow && !selectedProjectId && projectsLoaded && projects.length === 1) {
      setSelectedProjectId(projects[0].id);
    }
  }, [isNewWorkflow, selectedProjectId, projectsLoaded, projects]);

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
        taskId: null,
        pr: null,
        creatorRole: null,
        assignedRoles: [],
        projectId: selectedProjectId ?? effectiveActiveProjectId ?? null,
        revisions: [],
        evaluatorAssessment: null,
        consensus: null,
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
    if (workflow) inputRef.current?.focus();
  }, [workflow]);

  // Auto-trigger story generation when entering planning from gathering.
  // This handles the case where AI signals [READY_TO_PLAN] in a chat reply.
  // The "Ready to Plan" button has its own chained handler so this effect
  // won't double-fire (loading is true during the button flow).
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = workflow?.phase;

    if (
      workflow?.phase === "planning" &&
      prev === "gathering" &&
      !workflow.generatedStory &&
      workflow.id &&
      !loading
    ) {
      doAction("generate_story");
    }
  }, [workflow?.phase, workflow?.generatedStory, workflow?.id, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const projectRequired = isNewWorkflow && projectsLoaded && projects.length > 0 && !selectedProjectId;

  // Withdraw a queued message before it is sent
  const withdrawMessage = useCallback((id: string) => {
    setMessageQueue((q) => q.filter((m) => m.id !== id));
    setWithdrawnId(id);
    setTimeout(() => setWithdrawnId((cur) => (cur === id ? null : cur)), 2000);
  }, []);

  // Core: send a single message to the API (does not touch queue)
  const processMessage = useCallback(async (messageText: string) => {
    setLoading(true);
    setError(null);

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
      let wfId = workflow?.id ?? "";

      // If this is a brand-new workflow (not yet persisted), create it first
      if (!wfId) {
        const createRes = await fetch("/api/project/workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorRole: userRoleSlug ?? undefined,
            assignedRoles: userRoleSlug ? [userRoleSlug] : [],
            projectId: selectedProjectId ?? effectiveActiveProjectId ?? undefined,
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
  }, [workflow?.id, userRoleSlug, selectedProjectId, effectiveActiveProjectId]);

  // Process the next queued message when AI finishes
  useEffect(() => {
    if (loading || messageQueue.length === 0) return;
    const [next, ...rest] = messageQueue;
    setMessageQueue(rest);
    processMessage(next.content);
  }, [loading, messageQueue, processMessage]);

  const sendMessage = () => {
    if (!workflow || !input.trim() || projectRequired) return;
    const messageText = input.trim();
    setInput("");

    if (loading) {
      // AI is busy — queue the message
      const id = `q-${++queueIdCounter.current}-${Date.now()}`;
      setMessageQueue((q) => [...q, { id, content: messageText, queuedAt: new Date().toISOString() }]);
      return;
    }

    processMessage(messageText);
  };

  // Chain "ready to plan" + "generate story" in a single loading session
  // so the user only clicks once. Loading stays true throughout both API calls.
  const handleReadyToPlan = async () => {
    if (!workflow?.id || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Step 1: Advance to planning
      const res1 = await fetch(`/api/project/workflow/${workflow.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ready_to_plan" }),
      });
      const data1 = await res1.json();
      if (data1.error) {
        setError(data1.error);
        return;
      }
      if (data1.workflow) setWorkflow(data1.workflow);

      // Step 2: Immediately generate story
      const res2 = await fetch(`/api/project/workflow/${workflow.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_story" }),
      });
      const data2 = await res2.json();
      if (data2.workflow) setWorkflow(data2.workflow);
      if (data2.error) setError(data2.error);
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

      {/* Project selector for new workflows */}
      {isNewWorkflow && projectsLoaded && projects.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
          <label className="text-xs font-medium text-zinc-400 whitespace-nowrap">
            Project <span className="text-red-400">*</span>
          </label>
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setSelectedProjectId(id);
              setWorkflow((w) => w ? { ...w, projectId: id } : null);
            }}
            className="flex-1 max-w-xs rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          >
            <option value="" disabled>Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {!selectedProjectId && (
            <span className="text-xs text-amber-400">Required</span>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Chat messages */}
        {(workflow.phase === "gathering" || workflow.phase === "planning") && (
          <ChatArea
            messages={workflow.messages}
            chatEndRef={chatEndRef}
            loading={loading}
            queuedMessages={messageQueue}
            onWithdraw={withdrawMessage}
          />
        )}

        {/* Evaluator assessment */}
        {workflow.phase === "evaluating" && workflow.generatedStory && (
          <EvaluatingView
            workflow={workflow}
            onAccept={() => doAction("accept_evaluation")}
            onReject={() => doAction("reject_evaluation")}
            loading={loading}
          />
        )}

        {/* Story review */}
        {workflow.phase === "review" && workflow.generatedStory && (
          <StoryReview
            story={workflow.generatedStory}
            workflow={workflow}
            onConfirm={() => doAction("confirm")}
            onRequestChanges={() => doAction("request_changes")}
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

        {/* Approved — ready to implement or debate */}
        {workflow.phase === "approved" && (
          <ApprovedView
            workflow={workflow}
            onStartDebate={() => doAction("start_debate")}
            onImplement={() => doAction("implement")}
            loading={loading}
          />
        )}

        {/* 3-agent consensus debate */}
        {workflow.phase === "debating" && (
          <DebatingView
            workflow={workflow}
            onRunRound={() => doAction("run_debate_round")}
            onImplement={() => doAction("implement")}
            onSkip={() => doAction("skip_debate")}
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
            onRevise={async (requirement: string) => {
              if (!workflow.id || loading) return;
              setLoading(true);
              setError(null);
              try {
                const res = await fetch(`/api/project/workflow/${workflow.id}/chat`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "revise_requirement", requirement }),
                });
                const data = await res.json();
                if (data.workflow) {
                  setWorkflow(data.workflow);
                  onCreated();
                }
                if (data.error) setError(data.error);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
            loading={loading}
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
                onClick={handleReadyToPlan}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                Ready to Plan →
              </button>
            </div>
          )}

          {workflow.phase === "planning" && (
            <div className="flex justify-center mb-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
                  <div className="w-4 h-4 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin" />
                  Generating story from your conversation...
                </div>
              ) : (
                <button
                  onClick={() => doAction("generate_story")}
                  className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  Generate Story from Conversation
                </button>
              )}
            </div>
          )}

          {/* Withdrawn confirmation */}
          {withdrawnId && (
            <p className="text-xs text-zinc-400 mb-2 bg-zinc-800/50 px-3 py-1.5 rounded">
              Message withdrawn from queue.
            </p>
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
                projectRequired
                  ? "Select a project above to get started…"
                  : loading
                    ? "Type your next message (it will be queued)..."
                    : workflow.messages.length === 0
                      ? "Describe what you want to build..."
                      : "Answer the question or add more context..."
              }
              rows={2}
              disabled={projectRequired}
              className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-200 placeholder-zinc-500 resize-none disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || projectRequired}
              className="px-4 self-end py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {loading ? "Queue" : "Send"}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">
            {loading ? "AI is thinking — messages will be queued and sent automatically" : "Press Enter to send, Shift+Enter for new line"}
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
  queuedMessages = [],
  onWithdraw,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  loading?: boolean;
  queuedMessages?: QueuedMessage[];
  onWithdraw?: (id: string) => void;
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

      {/* Queued messages shown inline in chat */}
      {queuedMessages.map((qm) => (
        <div key={qm.id} className="flex justify-end">
          <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm bg-indigo-600/10 text-indigo-200 border border-indigo-600/20 border-dashed">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Queued
              </span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed opacity-70">
              {qm.content}
            </p>
            {onWithdraw && (
              <button
                onClick={() => onWithdraw(qm.id)}
                className="mt-1.5 text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-300 transition-colors"
              >
                Withdraw
              </button>
            )}
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
  onConfirm,
  onRequestChanges,
  onCreateIssue,
  onAssignedRolesChange,
  loading,
}: {
  story: GeneratedStory;
  workflow: WorkflowState;
  onConfirm: () => void;
  onRequestChanges: () => void;
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

      {/* Confirm / Request Changes */}
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 px-4 py-2.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? "Confirming..." : "Confirm"}
        </button>
        <button
          onClick={onRequestChanges}
          disabled={loading}
          className="flex-1 px-4 py-2.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? "Sending..." : "Request Changes"}
        </button>
      </div>
    </div>
  );
}

function EvaluatingView({
  workflow,
  onAccept,
  onReject,
  loading,
}: {
  workflow: WorkflowState;
  onAccept: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Story preview */}
      {workflow.generatedStory && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-200">{workflow.generatedStory.title}</h3>
          </div>
          <div className="p-4 text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {workflow.generatedStory.body}
          </div>
        </div>
      )}

      {/* Evaluator assessment */}
      <div className="bg-zinc-900 border border-amber-600/30 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-amber-600/20 flex items-center justify-center text-[10px] font-bold text-amber-400">E</span>
          <h3 className="text-sm font-semibold text-zinc-200">Evaluator Assessment</h3>
        </div>
        <div className="p-4">
          {workflow.evaluatorAssessment ? (
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {workflow.evaluatorAssessment.replace("[APPROVE]", "").trim()}
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:300ms]" />
              <span className="text-xs text-zinc-500 ml-2">Evaluator is reviewing...</span>
            </div>
          )}
        </div>
      </div>

      {workflow.evaluatorAssessment && (
        <div className="flex gap-3">
          <button
            onClick={onAccept}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? "Accepting..." : "Accept & Continue to Review"}
          </button>
          <button
            onClick={onReject}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? "Rejecting..." : "Revise Story"}
          </button>
        </div>
      )}
    </div>
  );
}

function ApprovedView({
  workflow,
  onStartDebate,
  onImplement,
  loading,
}: {
  workflow: WorkflowState;
  onStartDebate: () => void;
  onImplement: () => void;
  loading: boolean;
}) {
  const autoStarted = useRef(false);

  // Auto-start debate when story is freshly approved (no prior debate)
  useEffect(() => {
    if (!autoStarted.current && !loading && !workflow.consensus) {
      autoStarted.current = true;
      onStartDebate();
    }
  }, [loading, workflow.consensus, onStartDebate]);

  const isAutoStarting = !workflow.consensus && loading;

  return (
    <div className="p-6 flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-full bg-emerald-600/20 flex items-center justify-center">
        <span className="text-2xl">&#x2713;</span>
      </div>
      <h3 className="text-lg font-semibold text-zinc-200">Story Approved</h3>
      <p className="text-sm text-zinc-400 text-center max-w-md">
        This story has been confirmed and is ready for implementation.
        {workflow.issueUrl && (
          <>
            {" "}Issue:{" "}
            <a href={workflow.issueUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
              {workflow.issueUrl}
            </a>
          </>
        )}
      </p>

      {isAutoStarting && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600/10 border border-indigo-600/20">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-xs text-indigo-300">Auto-starting agent debate...</span>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onStartDebate}
          disabled={loading}
          className="px-6 py-2.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? "Starting..." : "Start Agent Debate"}
        </button>
        <button
          onClick={onImplement}
          disabled={loading}
          className="px-6 py-2.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? "Triggering..." : "Skip Debate & Implement"}
        </button>
      </div>
      <p className="text-[10px] text-zinc-600 text-center max-w-sm">
        The debate pipeline runs automatically after approval. Manual controls are available as fallbacks.
      </p>
    </div>
  );
}

function DebatingView({
  workflow,
  onRunRound,
  onImplement,
  onSkip,
  loading,
}: {
  workflow: WorkflowState;
  onRunRound: () => void;
  onImplement: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  const consensus = workflow.consensus;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const autoImplementTriggered = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consensus?.messages.length]);

  // Auto-run next round when debate is still in progress
  useEffect(() => {
    if (!loading && consensus && !consensus.reached && !consensus.escalated) {
      onRunRound();
    }
  }, [loading, consensus, onRunRound]);

  // Auto-trigger implementation when consensus is reached
  useEffect(() => {
    if (!loading && consensus?.reached && !autoImplementTriggered.current) {
      autoImplementTriggered.current = true;
      onImplement();
    }
  }, [loading, consensus?.reached, onImplement]);

  const roleColors: Record<string, { bg: string; border: string; label: string; badge: string }> = {
    planner: { bg: "bg-blue-600/10", border: "border-blue-600/30", label: "text-blue-400", badge: "bg-blue-600/20" },
    evaluator: { bg: "bg-amber-600/10", border: "border-amber-600/30", label: "text-amber-400", badge: "bg-amber-600/20" },
    generator: { bg: "bg-emerald-600/10", border: "border-emerald-600/30", label: "text-emerald-400", badge: "bg-emerald-600/20" },
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-zinc-200">Agent Consensus Debate</h3>
          {consensus && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              Round {consensus.round}/{consensus.maxRounds}
            </span>
          )}
        </div>
        {consensus && (
          <div className="flex items-center gap-2">
            {(["planner", "evaluator", "generator"] as const).map((role) => (
              <span
                key={role}
                className={`text-[10px] px-2 py-0.5 rounded ${
                  consensus.approvals[role]
                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                    : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                }`}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}{" "}
                {consensus.approvals[role] ? "&#x2713;" : "..."}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Debate messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {consensus?.messages.map((msg, i) => {
          const colors = roleColors[msg.role] ?? roleColors.planner;
          return (
            <div key={i} className={`rounded-lg px-4 py-3 ${colors.bg} border ${colors.border}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-5 h-5 rounded-full ${colors.badge} flex items-center justify-center text-[9px] font-bold ${colors.label}`}>
                  {msg.role.charAt(0).toUpperCase()}
                </span>
                <span className={`text-[10px] font-medium uppercase tracking-wider ${colors.label}`}>
                  {msg.role}
                </span>
                {msg.isApproval && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-600/30">
                    APPROVED
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {msg.content.replace("[APPROVE]", "").trim()}
              </p>
            </div>
          );
        })}

        {loading && (
          <div className="rounded-lg px-4 py-3 bg-zinc-800/50 border border-zinc-700">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
              <span className="text-xs text-zinc-500 ml-2">Agents are discussing...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Pipeline status & actions */}
      <div className="border-t border-zinc-800 p-3 space-y-2">
        {/* Auto-running indicator */}
        {!consensus?.reached && !consensus?.escalated && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-600/10 border border-indigo-600/20 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs text-indigo-300">
              Pipeline running automatically — Round {consensus?.round ?? 0}/{consensus?.maxRounds ?? 10}
            </span>
          </div>
        )}

        {consensus?.reached && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600/10 border border-emerald-600/20 mb-2">
            <span className="text-emerald-400 text-sm">&#x2713;</span>
            <span className="text-xs text-emerald-300">
              Consensus reached — auto-starting implementation...
            </span>
          </div>
        )}

        {consensus?.escalated && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-600/10 border border-amber-600/20 mb-2">
            <span className="text-amber-400 text-sm">!</span>
            <span className="text-xs text-amber-300">
              Pipeline halted: debate reached {consensus.maxRounds} rounds without consensus. Review the conversation and decide whether to proceed or skip.
            </span>
          </div>
        )}

        <div className="flex gap-3">
          {!consensus?.reached && !consensus?.escalated && (
            <button
              onClick={onRunRound}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? "Running round..." : "Run Next Round"}
            </button>
          )}

          {(consensus?.reached || consensus?.escalated) && (
            <button
              onClick={onImplement}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? "Starting..." : "Start Implementation"}
            </button>
          )}

          <button
            onClick={onSkip}
            disabled={loading}
            className="px-4 py-2.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
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
  const [taskCompleted, setTaskCompleted] = useState(false);

  const handleStatusChange = useCallback(
    (status: string) => {
      // When a PR workflow is expected, don't mark done on task completion —
      // the PR merge poller will handle the "done" transition.
      // Only auto-advance for non-PR workflows (no issue linked).
      if (status === "completed" && !workflow.issueId) {
        onDone();
      } else if (status === "completed") {
        setTaskCompleted(true);
      }
    },
    [onDone, workflow.issueId]
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

      {taskCompleted && workflow.issueId && !workflow.pr?.conflicted && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-600/10 border border-indigo-600/20">
          <span className="text-indigo-400 text-sm animate-pulse">&#x231B;</span>
          <span className="text-xs text-indigo-300">
            Task completed — waiting for PR to be created and merged
          </span>
          {workflow.pr?.url && (
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

      {workflow.pr?.conflicted && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-600/10 border border-red-600/20">
          <span className="text-red-400 text-sm">!</span>
          <span className="text-xs text-red-300">
            Branch has conflicts with main that need manual resolution before a PR can be created
          </span>
        </div>
      )}
    </div>
  );
}

function DoneView({
  workflow,
  onClose,
  onReopen,
  onRevise,
  loading: parentLoading,
}: {
  workflow: WorkflowState;
  onClose: () => void;
  onReopen: (newTaskId: string) => void;
  onRevise: (requirement: string) => Promise<void>;
  loading: boolean;
}) {
  const [taskFailed, setTaskFailed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(workflow.generatedStory?.body ?? "");
  const [showRevisions, setShowRevisions] = useState(false);

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
        const res = await fetch(`/api/tasks/${taskId}/restart`, { method: "POST" });
        const data = await res.json();
        if (!data.taskId) return;

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

  const handleRevise = async () => {
    if (!editText.trim() || parentLoading) return;
    await onRevise(editText.trim());
  };

  const currentVersion = (workflow.revisions?.length ?? 0) + 1;

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
              : `The AI agent has finished working on this story${currentVersion > 1 ? ` (v${currentVersion})` : ""}`}
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
          GitHub Issue: {workflow.issueUrl} &#x2197;
        </a>
      )}

      {/* Delivered summary */}
      {workflow.generatedStory && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Delivered Requirement
              </h4>
              {currentVersion > 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-600/30">
                  v{currentVersion}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {workflow.pr?.url && (
                <a
                  href={workflow.pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-indigo-400 hover:text-indigo-300"
                >
                  PR #{workflow.pr.number} &#x2197;
                </a>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
                {workflow.generatedStory.priority}
              </span>
            </div>
          </div>
          <div className="p-4">
            <h4 className="text-sm font-medium text-zinc-100 mb-2">{workflow.generatedStory.title}</h4>
            <div className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {workflow.generatedStory.body}
            </div>
          </div>
        </div>
      )}

      {/* Task execution result */}
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
          <span className="text-emerald-400 text-sm">&#x2713;</span>
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
              View PR &#x2197;
            </a>
          )}
        </div>
      )}

      {/* Edit / revise requirement */}
      {workflow.generatedStory && !taskFailed && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => { setEditMode(!editMode); setEditText(workflow.generatedStory?.body ?? ""); }}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Revise Requirement
            </span>
            <span className="text-zinc-500 text-xs">{editMode ? "Cancel" : "Edit"}</span>
          </button>
          {editMode && (
            <div className="p-4 border-t border-zinc-800 space-y-3">
              <p className="text-[10px] text-zinc-500">
                Edit the requirement below. The agent will build incrementally on the previous implementation.
              </p>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-200 placeholder-zinc-500 resize-y font-mono"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevise}
                  disabled={parentLoading || !editText.trim() || editText.trim() === workflow.generatedStory?.body}
                  className="px-4 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
                >
                  {parentLoading ? "Submitting..." : "Save & Re-implement"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revision history */}
      {workflow.revisions && workflow.revisions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowRevisions(!showRevisions)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Revision History ({workflow.revisions.length} prior {workflow.revisions.length === 1 ? "version" : "versions"})
            </span>
            <span className="text-zinc-500 text-xs">{showRevisions ? "Hide" : "Show"}</span>
          </button>
          {showRevisions && (
            <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
              {[...workflow.revisions].reverse().map((rev) => (
                <div key={rev.version} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        v{rev.version}
                      </span>
                      {rev.story && (
                        <span className="text-xs text-zinc-300">{rev.story.title}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(rev.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto font-mono">
                    {rev.requirement}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                    {rev.taskId && <span>Task: {rev.taskId.slice(0, 16)}...</span>}
                    {rev.pr && (
                      <a
                        href={rev.pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        PR #{rev.pr.number} ({rev.pr.status}) &#x2197;
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
