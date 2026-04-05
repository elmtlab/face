export type FaceTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface FaceTaskStep {
  id: string;
  tool: string;
  description: string;
  status: "completed" | "running" | "failed";
  timestamp: string;
  output?: string;
}

/** High-level activity derived from grouping raw steps */
export interface FaceTaskActivity {
  id: string;
  label: string;
  category: "read" | "write" | "execute" | "search" | "plan" | "other";
  filesInvolved: string[];
  stepCount: number;
  startedAt: string;
  completedAt?: string;
}

export interface FaceTask {
  id: string;
  agent: string;
  title: string;
  status: FaceTaskStatus;
  prompt: string;
  /** Human-readable summary of what the agent is doing / did */
  summary: string | null;
  workingDirectory: string;
  createdAt: string;
  updatedAt: string;
  /** Raw tool-level steps (kept for debugging, not primary display) */
  steps: FaceTaskStep[];
  /** High-level grouped activities */
  activities: FaceTaskActivity[];
  result: string | null;
  /** Session ID from the agent (used to correlate hooks) */
  sessionId?: string;
  /** GitHub issue number to post completion summaries to */
  linkedIssue?: number;
  /** Role slug of the user who created this task (e.g. "pm", "dev") */
  creatorRole?: string;
  /** Role slugs relevant to this task (e.g. ["dev", "pm"]) */
  assignedRoles?: string[];
  /** Project ID this task belongs to */
  projectId?: string;
}

export interface AgentDetection {
  installed: boolean;
  configured: boolean;
  path: string | null;
  version?: string;
}

export interface FaceConfig {
  agents: Record<string, AgentDetection>;
  setupCompletedAt: string | null;
}
