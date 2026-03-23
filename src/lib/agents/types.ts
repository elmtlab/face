export type AgentStatus = "online" | "offline" | "degraded" | "unknown";
export type TaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentInfo {
  id: string;
  name: string;
  version?: string;
  status: AgentStatus;
  lastSeen: Date;
  metadata?: Record<string, unknown>;
}

export interface TaskStep {
  id: string;
  description: string;
  status: TaskStatus;
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  steps: TaskStep[];
  metadata?: Record<string, unknown>;
}

export type AgentEvent =
  | { type: "task:created"; task: AgentTask }
  | { type: "task:updated"; task: AgentTask }
  | { type: "task:step"; taskId: string; step: TaskStep }
  | { type: "agent:status"; status: AgentStatus };

export interface AgentAdapter {
  readonly agentId: string;

  /** Check if the agent process/service is reachable */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  /** Return current agent info */
  getInfo(): Promise<AgentInfo>;

  /** List active and recent tasks */
  getTasks(options?: {
    limit?: number;
    status?: TaskStatus[];
  }): Promise<AgentTask[]>;

  /** Get a single task by ID */
  getTask(taskId: string): Promise<AgentTask | null>;

  /**
   * Subscribe to real-time task updates.
   * Returns an unsubscribe function.
   */
  subscribe(onEvent: (event: AgentEvent) => void): () => void;

  /** Clean up resources */
  dispose(): Promise<void>;
}
