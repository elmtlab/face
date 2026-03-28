"use client";

import { useState, useEffect } from "react";

interface AgentInfo {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

export function AgentStatusWidget() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.agents) setAgents(data.agents);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <svg className="h-3.5 w-3.5 animate-spin text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeOpacity="0.3" /><path d="M8 2a6 6 0 014.24 1.76" />
        </svg>
        <p className="text-xs text-zinc-500">Checking agents...</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return <div className="py-4 text-center"><p className="text-xs text-zinc-500">No agents detected.</p></div>;
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <div key={agent.id} className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              agent.available ? "bg-green-400" : "bg-zinc-600"
            }`}
          />
          <span className="text-zinc-300">{agent.name}</span>
          {agent.version && (
            <span className="text-zinc-600">{agent.version}</span>
          )}
        </div>
      ))}
    </div>
  );
}
