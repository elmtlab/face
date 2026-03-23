import { agentRegistry } from "./registry";
import { createMockAdapter } from "./adapters/mock";
import { eventBus } from "../events/bus";
import type { AgentAdapter } from "./types";

interface AdapterEntry {
  factory: () => AgentAdapter;
  enabled: boolean;
}

const ADAPTERS: AdapterEntry[] = [
  { factory: createMockAdapter, enabled: true },
  // Future: { factory: createClaudeCodeAdapter, enabled: true },
  // Future: { factory: createCodexAdapter, enabled: true },
];

export async function initializeAgents(): Promise<void> {
  for (const { factory, enabled } of ADAPTERS) {
    if (!enabled) continue;

    const adapter = factory();
    const health = await adapter.healthCheck();

    console.log(
      `[face] Agent "${adapter.agentId}": ${health.healthy ? "online" : "offline"}${health.message ? ` (${health.message})` : ""}`
    );

    agentRegistry.register(adapter);

    // Wire adapter events into the central event bus
    adapter.subscribe((event) => {
      eventBus.emit("agent-event", { agentId: adapter.agentId, ...event });
    });
  }
}

export async function shutdownAgents(): Promise<void> {
  for (const adapter of agentRegistry.getAll()) {
    await adapter.dispose();
    agentRegistry.unregister(adapter.agentId);
  }
}
