export type {
  FaceTask,
  FaceTaskStep,
  FaceTaskActivity,
  FaceTaskStatus,
  FaceConfig,
  AgentDetection,
} from "@/lib/tasks/types";

export interface LayoutWeight {
  componentId: string;
  weight: number;
  interactionCount: number;
  lastInteraction: Date | null;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "setup_required";
  agents: Record<
    string,
    { installed: boolean; configured: boolean; healthy: boolean }
  >;
  db: boolean;
}
