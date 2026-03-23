export type {
  AgentStatus,
  TaskStatus,
  AgentInfo,
  TaskStep,
  AgentTask,
  AgentEvent,
  AgentAdapter,
} from "@/lib/agents/types";

export interface LayoutWeight {
  componentId: string;
  weight: number;
  interactionCount: number;
  lastInteraction: Date | null;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  agents: Record<string, { healthy: boolean; message?: string }>;
  db: boolean;
}

export interface TrackingEvent {
  eventType: "click" | "view" | "expand" | "collapse";
  componentId: string;
  section: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}
