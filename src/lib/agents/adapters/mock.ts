import type {
  AgentAdapter,
  AgentInfo,
  AgentTask,
  AgentEvent,
  TaskStatus,
  TaskStep,
} from "../types";

const MOCK_TASKS: AgentTask[] = [
  {
    id: "mock-task-1",
    agentId: "mock",
    title: "Refactor authentication module",
    status: "running",
    createdAt: new Date(Date.now() - 3600_000),
    updatedAt: new Date(Date.now() - 60_000),
    steps: [
      {
        id: "step-1",
        description: "Analyze existing auth flow",
        status: "completed",
        startedAt: new Date(Date.now() - 3600_000),
        completedAt: new Date(Date.now() - 3000_000),
      },
      {
        id: "step-2",
        description: "Extract auth middleware",
        status: "completed",
        startedAt: new Date(Date.now() - 3000_000),
        completedAt: new Date(Date.now() - 1800_000),
      },
      {
        id: "step-3",
        description: "Update route handlers",
        status: "running",
        startedAt: new Date(Date.now() - 1800_000),
      },
      {
        id: "step-4",
        description: "Write tests",
        status: "queued",
      },
    ],
  },
  {
    id: "mock-task-2",
    agentId: "mock",
    title: "Fix database connection pooling",
    status: "completed",
    createdAt: new Date(Date.now() - 7200_000),
    updatedAt: new Date(Date.now() - 5400_000),
    steps: [
      {
        id: "step-1",
        description: "Identify connection leak",
        status: "completed",
        startedAt: new Date(Date.now() - 7200_000),
        completedAt: new Date(Date.now() - 6600_000),
      },
      {
        id: "step-2",
        description: "Implement connection pool",
        status: "completed",
        startedAt: new Date(Date.now() - 6600_000),
        completedAt: new Date(Date.now() - 5400_000),
      },
    ],
  },
  {
    id: "mock-task-3",
    agentId: "mock",
    title: "Add API rate limiting",
    status: "queued",
    createdAt: new Date(Date.now() - 300_000),
    updatedAt: new Date(Date.now() - 300_000),
    steps: [
      {
        id: "step-1",
        description: "Design rate limit strategy",
        status: "queued",
      },
    ],
  },
  {
    id: "mock-task-4",
    agentId: "mock",
    title: "Optimize image processing pipeline",
    status: "failed",
    createdAt: new Date(Date.now() - 10800_000),
    updatedAt: new Date(Date.now() - 9000_000),
    steps: [
      {
        id: "step-1",
        description: "Profile current pipeline",
        status: "completed",
        startedAt: new Date(Date.now() - 10800_000),
        completedAt: new Date(Date.now() - 10200_000),
      },
      {
        id: "step-2",
        description: "Implement parallel processing",
        status: "failed",
        startedAt: new Date(Date.now() - 10200_000),
        completedAt: new Date(Date.now() - 9000_000),
        output: "Error: Worker thread pool exhausted",
      },
    ],
  },
];

export function createMockAdapter(): AgentAdapter {
  const listeners: Array<(event: AgentEvent) => void> = [];
  let interval: ReturnType<typeof setInterval> | null = null;

  // Simulate task progress updates
  function startSimulation() {
    interval = setInterval(() => {
      const runningTasks = MOCK_TASKS.filter((t) => t.status === "running");
      if (runningTasks.length === 0) return;

      const task = runningTasks[Math.floor(Math.random() * runningTasks.length)];
      const runningStep = task.steps.find((s) => s.status === "running");
      if (runningStep) {
        const updated: TaskStep = {
          ...runningStep,
          output: `Processing... ${Math.floor(Math.random() * 100)}% complete`,
        };
        const event: AgentEvent = {
          type: "task:step",
          taskId: task.id,
          step: updated,
        };
        listeners.forEach((fn) => fn(event));
      }
    }, 5000);
  }

  return {
    agentId: "mock",

    async healthCheck() {
      return { healthy: true, message: "Mock adapter is always healthy" };
    },

    async getInfo(): Promise<AgentInfo> {
      return {
        id: "mock",
        name: "Mock Agent",
        version: "1.0.0",
        status: "online",
        lastSeen: new Date(),
        metadata: { description: "Development mock adapter" },
      };
    },

    async getTasks(options?: {
      limit?: number;
      status?: TaskStatus[];
    }): Promise<AgentTask[]> {
      let tasks = [...MOCK_TASKS];
      if (options?.status) {
        tasks = tasks.filter((t) => options.status!.includes(t.status));
      }
      if (options?.limit) {
        tasks = tasks.slice(0, options.limit);
      }
      return tasks;
    },

    async getTask(taskId: string): Promise<AgentTask | null> {
      return MOCK_TASKS.find((t) => t.id === taskId) ?? null;
    },

    subscribe(onEvent: (event: AgentEvent) => void): () => void {
      listeners.push(onEvent);
      if (listeners.length === 1) startSimulation();
      return () => {
        const idx = listeners.indexOf(onEvent);
        if (idx >= 0) listeners.splice(idx, 1);
        if (listeners.length === 0 && interval) {
          clearInterval(interval);
          interval = null;
        }
      };
    },

    async dispose() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      listeners.length = 0;
    },
  };
}
