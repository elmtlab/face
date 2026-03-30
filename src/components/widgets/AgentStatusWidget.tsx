"use client";

import { useState, useEffect } from "react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

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
    return <LoadingSpinner label="Checking agents..." />;
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
