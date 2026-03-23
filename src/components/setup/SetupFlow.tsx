"use client";

import { useState, useEffect } from "react";
import type { FaceConfig } from "@/lib/tasks/types";
import { RoleSelector } from "@/components/user/RoleSelector";

interface SetupStatus {
  config: FaceConfig;
  needsSetup: boolean;
  hasAnyAgent: boolean;
}

type SetupStep = "role" | "agents";

export function SetupFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<SetupStep>("role");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{
    message: string;
    type: "info" | "success" | "error";
  } | null>(null);

  // Check if user already has a profile — skip role step
  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needsOnboarding) {
          setStep("agents");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step === "agents") loadStatus();
  }, [step]);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/status");
      const data = await res.json();
      setStatus(data);

      if (!data.hasAnyAgent) {
        showBubble(
          "No AI agents detected on your system. Install Claude Code or Codex to get started.",
          "info"
        );
      } else if (data.needsSetup) {
        showBubble(
          "Found AI agents! Let\u2019s configure them to work with FACE.",
          "info"
        );
      } else {
        showBubble("All agents are configured. You\u2019re ready to go!", "success");
        setTimeout(onComplete, 1500);
      }
    } catch {
      showBubble("Failed to check agent status.", "error");
    }
    setLoading(false);
  }

  function showBubble(
    message: string,
    type: "info" | "success" | "error"
  ) {
    setBubble({ message, type });
  }

  async function configureAgent(agentId: string) {
    setConfiguring(agentId);
    showBubble(`Configuring ${agentId}...`, "info");

    try {
      const res = await fetch("/api/setup/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const data = await res.json();

      if (data.success) {
        showBubble(data.message, "success");
        await loadStatus();
      } else {
        showBubble(data.message, "error");
      }
    } catch {
      showBubble("Configuration failed. Please try again.", "error");
    }
    setConfiguring(null);
  }

  const bubbleColors = {
    info: "from-blue-600/90 to-indigo-600/90 border-blue-500/30",
    success: "from-emerald-600/90 to-green-600/90 border-emerald-500/30",
    error: "from-red-600/90 to-rose-600/90 border-red-500/30",
  };

  // Step 1: Role selection
  if (step === "role") {
    return <RoleSelector onComplete={() => setStep("agents")} />;
  }

  // Step 2: Agent configuration
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100">
            FACE
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            AI Agent Task Dashboard
          </p>
        </div>

        {/* Bubble message */}
        {bubble && (
          <div
            className={`mb-8 rounded-2xl border bg-gradient-to-br p-4 shadow-2xl backdrop-blur-sm transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 ${bubbleColors[bubble.type]}`}
          >
            <p className="text-sm font-medium text-white">{bubble.message}</p>
          </div>
        )}

        {/* Agent cards */}
        {!loading && status && (
          <div className="space-y-3">
            {Object.entries(status.config.agents).map(([id, agent]) => (
              <div
                key={id}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        agent.configured
                          ? "bg-emerald-400 shadow-lg shadow-emerald-400/30"
                          : agent.installed
                            ? "bg-amber-400 shadow-lg shadow-amber-400/30"
                            : "bg-zinc-600"
                      }`}
                    />
                    <div>
                      <span className="text-sm font-semibold text-zinc-100">
                        {id === "claude-code" ? "Claude Code" : "Codex"}
                      </span>
                      {agent.version && (
                        <span className="ml-2 text-xs text-zinc-500">
                          {agent.version}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    {agent.configured ? (
                      <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-medium text-emerald-400">
                        Ready
                      </span>
                    ) : agent.installed ? (
                      <button
                        onClick={() => configureAgent(id)}
                        disabled={configuring !== null}
                        className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/20 disabled:opacity-50"
                      >
                        {configuring === id ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
                              <path d="M8 2a6 6 0 014.24 1.76" />
                            </svg>
                            Setting up...
                          </span>
                        ) : (
                          "Configure"
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-600">
                        Not installed
                      </span>
                    )}
                  </div>
                </div>

                {agent.installed && !agent.configured && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Will add task reporting hooks to your agent config
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Skip / Continue */}
        {!loading && status && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={onComplete}
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {status.needsSetup ? "Skip setup for now" : "Continue to dashboard"} &rarr;
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <svg className="h-6 w-6 animate-spin text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
              <path d="M8 2a6 6 0 014.24 1.76" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
