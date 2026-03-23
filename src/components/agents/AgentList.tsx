"use client";

import { useEffect, useState } from "react";
import { AgentCard } from "./AgentCard";

interface Agent {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
  version: string | null;
}

export function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/agents");
        setAgents(await res.json());
      } catch (err) {
        console.error("Failed to load agents:", err);
      }
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Agents
      </h2>
      <div className="space-y-2">
        {agents.length === 0 ? (
          <p className="text-xs text-zinc-600">Detecting agents...</p>
        ) : (
          agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>
    </div>
  );
}
