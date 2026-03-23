import type { AgentAdapter } from "./types";

class AgentRegistry {
  private adapters: Map<string, AgentAdapter> = new Map();

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.agentId, adapter);
  }

  unregister(agentId: string): void {
    this.adapters.delete(agentId);
  }

  get(agentId: string): AgentAdapter | undefined {
    return this.adapters.get(agentId);
  }

  getAll(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  async healthCheckAll(): Promise<
    Map<string, { healthy: boolean; message?: string }>
  > {
    const results = new Map<string, { healthy: boolean; message?: string }>();
    const checks = this.getAll().map(async (adapter) => {
      try {
        const result = await adapter.healthCheck();
        results.set(adapter.agentId, result);
      } catch (err) {
        results.set(adapter.agentId, {
          healthy: false,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
    await Promise.all(checks);
    return results;
  }
}

// Use globalThis to survive Next.js module re-evaluation in dev
const globalForRegistry = globalThis as unknown as {
  __agentRegistry?: AgentRegistry;
};

export const agentRegistry =
  globalForRegistry.__agentRegistry ??
  (globalForRegistry.__agentRegistry = new AgentRegistry());
