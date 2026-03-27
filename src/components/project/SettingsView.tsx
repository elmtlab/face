"use client";

import { useEffect, useState, useRef } from "react";
import type { ProjectProviderConfig } from "@/lib/project/types";

interface ProviderState {
  providers: ProjectProviderConfig[];
  active: string | null;
  available: string[];
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export function SettingsView() {
  const [state, setState] = useState<ProviderState>({
    providers: [],
    active: null,
    available: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchProviders = () => {
    fetch("/api/project/providers")
      .then((r) => r.json())
      .then(setState)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleSetActive = async (name: string) => {
    await fetch("/api/project/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setActive", name }),
    });
    fetchProviders();
  };

  const handleRemove = async (name: string) => {
    await fetch("/api/project/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", name }),
    });
    fetchProviders();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Connected providers bar */}
      {state.providers.length > 0 && (
        <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Connected:</span>
            {state.providers.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700"
              >
                <span className="text-xs text-zinc-200">{p.name}</span>
                <span className="text-[10px] text-zinc-500">{p.type}</span>
                {state.active === p.name ? (
                  <span className="text-[10px] px-1 rounded bg-emerald-600/20 text-emerald-400">
                    active
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetActive(p.name)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    activate
                  </button>
                )}
                <button
                  onClick={() => handleRemove(p.name)}
                  className="text-[10px] text-zinc-600 hover:text-red-400 ml-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat-based setup */}
      <SetupChat onConnected={fetchProviders} />
    </div>
  );
}

function SetupChat({ onConnected }: { onConnected: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'll help you connect a project management tool. Which provider would you like to set up?\n\n- **GitHub** — connect a GitHub repository\n- **Jira** — connect a Jira project (coming soon)\n- **Linear** — connect a Linear team (coming soon)\n\nJust tell me what you'd like to connect, for example: \"Connect my GitHub repo owner/repo\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!sending) inputRef.current?.focus();
  }, [sending]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/project/settings/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      setMessages([...newMessages, { role: "assistant", content: data.reply }]);

      if (data.connected) {
        onConnected();
      }
    } catch (e) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: `Something went wrong: ${(e as Error).message}. Try again?` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden max-w-2xl mx-auto w-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600/20 text-indigo-100 border border-indigo-600/30"
                  : "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50"
              }`}
            >
              <span className="text-[10px] text-zinc-500 block mb-1">
                {msg.role === "user" ? "You" : "Setup Assistant"}
              </span>
              <div className="whitespace-pre-wrap">
                {renderMarkdown(msg.content)}
              </div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-4 py-3">
              <span className="text-sm text-zinc-400 animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Tell me what to connect, or paste your token..."
            rows={2}
            disabled={sending}
            className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-200 placeholder-zinc-500 resize-none disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 self-end py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Enter to send · Tokens are stored locally and never displayed back
        </p>
      </div>
    </div>
  );
}

/** Minimal markdown rendering for bold and lists */
function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    // Bold
    const parts = line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={j} className="text-zinc-100 font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      // Inline code
      return part.split(/(`[^`]+`)/g).map((seg, k) => {
        if (seg.startsWith("`") && seg.endsWith("`")) {
          return (
            <code key={k} className="px-1 py-0.5 rounded bg-zinc-700 text-zinc-300 text-xs font-mono">
              {seg.slice(1, -1)}
            </code>
          );
        }
        return seg;
      });
    });

    if (line.startsWith("- ")) {
      return (
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-zinc-500">•</span>
          <span>{parts.slice(0).map((p, pi) => <span key={pi}>{p}</span>)}</span>
        </div>
      );
    }

    return (
      <div key={i}>
        {parts.map((p, pi) => (
          <span key={pi}>{p}</span>
        ))}
      </div>
    );
  });
}
