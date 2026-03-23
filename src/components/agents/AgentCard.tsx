"use client";

interface Agent {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
  version: string | null;
}

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              agent.configured
                ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                : agent.installed
                  ? "bg-amber-400"
                  : "bg-zinc-600"
            }`}
          />
          <span className="text-sm font-medium text-zinc-100">
            {agent.name}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            agent.configured
              ? "bg-emerald-950 text-emerald-400"
              : agent.installed
                ? "bg-amber-950 text-amber-400"
                : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {agent.configured ? "Ready" : agent.installed ? "Not configured" : "Not found"}
        </span>
      </div>
      {agent.version && (
        <div className="mt-1.5 text-xs text-zinc-500">{agent.version}</div>
      )}
    </div>
  );
}
