"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectContext } from "@/lib/projects/ProjectContext";

// ── Types (mirroring server) ───────────────────────────────────────

interface SetupMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

type SetupPhase = "greeting" | "collecting" | "connecting" | "scaffolding" | "complete" | "error";

interface SetupSession {
  id: string;
  phase: SetupPhase;
  messages: SetupMessage[];
  hasExistingProject: boolean | null;
  pmTool: string | null;
  projectInfo: {
    name: string | null;
    description: string | null;
    goals: string | null;
    repoLink: string | null;
  };
  credentials: null; // Always null on client
  scope: string | null;
  autoScaffold: boolean | null;
  createdProjectId: string | null;
  connectedProviderName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Phase progress bar ──────────────────────────────────────────────

const SETUP_PHASES: { key: SetupPhase; label: string }[] = [
  { key: "greeting", label: "Welcome" },
  { key: "collecting", label: "Project Info" },
  { key: "connecting", label: "Connect" },
  { key: "scaffolding", label: "Structure" },
  { key: "complete", label: "Done" },
];

function SetupPhaseBar({ current }: { current: SetupPhase }) {
  const idx = SETUP_PHASES.findIndex((p) => p.key === current);
  const effectiveIdx = current === "error" ? -1 : idx;

  return (
    <div className="flex items-center gap-1 px-4 py-3 border-b border-zinc-800 overflow-x-auto">
      {SETUP_PHASES.map((p, i) => (
        <div key={p.key} className="flex items-center gap-1 shrink-0">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < effectiveIdx
                ? "bg-emerald-600 text-white"
                : i === effectiveIdx
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {i < effectiveIdx ? "\u2713" : i + 1}
          </div>
          <span
            className={`text-xs ${
              i === effectiveIdx ? "text-zinc-200 font-medium" : "text-zinc-500"
            }`}
          >
            {p.label}
          </span>
          {i < SETUP_PHASES.length - 1 && (
            <div className={`w-6 h-px ${i < effectiveIdx ? "bg-emerald-600" : "bg-zinc-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onProjectCreated: () => void;
}

export function ProjectSetupChat({ onClose, onProjectCreated }: Props) {
  const [session, setSession] = useState<SetupSession | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { refreshProjects } = useProjectContext();

  // Start or resume session on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Check for active session first
        const checkRes = await fetch("/api/project/setup/chat");
        const checkData = await checkRes.json();
        if (checkData.session) {
          setSession(checkData.session);
          return;
        }

        // Start a new session
        const res = await fetch("/api/project/setup/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        const data = await res.json();
        if (data.session) setSession(data.session);
        if (data.error) setError(data.error);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length]);

  // Focus input
  useEffect(() => {
    if (session && !loading) inputRef.current?.focus();
  }, [session, loading]);

  // Notify parent when project is created
  useEffect(() => {
    if (session?.phase === "complete" && session.createdProjectId) {
      refreshProjects();
      onProjectCreated();
    }
  }, [session?.phase, session?.createdProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async () => {
    if (!session || !input.trim() || loading) return;
    const messageText = input.trim();
    setLoading(true);
    setError(null);
    setInput("");

    // Optimistically show user message
    const userMsg: SetupMessage = {
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    };
    setSession((s) => s ? { ...s, messages: [...s.messages, userMsg] } : null);

    try {
      const res = await fetch("/api/project/setup/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, message: messageText }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
      if (data.error) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, input, loading]);

  const doAction = useCallback(async (action: string) => {
    if (!session || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/project/setup/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, action }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
      if (data.error) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, loading]);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Starting setup...
      </div>
    );
  }

  const isComplete = session.phase === "complete";
  const isScaffolding = session.phase === "scaffolding";
  const canType = !isComplete && !loading;

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">New Project Setup</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">&times;</button>
      </div>

      <SetupPhaseBar current={session.phase} />

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.messages.map((msg, i) => (
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
                  {msg.role === "user" ? "You" : "Setup Assistant"}
                </span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm bg-zinc-800 text-zinc-200 border border-zinc-700">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Setup Assistant
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

      {/* Input area */}
      {!isComplete && (
        <div className="border-t border-zinc-800 p-4">
          {error && (
            <p className="text-xs text-red-400 mb-2 bg-red-600/10 px-3 py-1.5 rounded">{error}</p>
          )}

          {/* Scaffolding action buttons */}
          {isScaffolding && (
            <div className="flex justify-center gap-3 mb-3">
              <button
                onClick={() => doAction("scaffold")}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                Yes, create project structure
              </button>
              <button
                onClick={() => doAction("skip_scaffold")}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-md border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                Skip, just connect
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
                isScaffolding
                  ? "Or type your response..."
                  : session.messages.length <= 1
                    ? "Tell me about your project..."
                    : "Type your response..."
              }
              rows={2}
              disabled={!canType}
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

      {/* Completion view */}
      {isComplete && (
        <div className="border-t border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-400 font-medium">Project setup complete!</p>
              {session.projectInfo.name && (
                <p className="text-xs text-zinc-500 mt-1">
                  {session.projectInfo.name}
                  {session.connectedProviderName ? ` — connected via ${session.pmTool}` : " — local management"}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
