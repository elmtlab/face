/**
 * Requirement → Story → Approval → Implementation workflow.
 *
 * Manages the lifecycle of turning a conversation with an AI agent
 * into a tracked, approved, and auto-implemented project story.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Types ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface GeneratedStory {
  title: string;
  body: string;          // markdown with acceptance criteria
  labels: string[];
  priority: "urgent" | "high" | "medium" | "low";
  estimatedEffort: string; // e.g. "small", "medium", "large"
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface WorkflowState {
  id: string;
  phase: "gathering" | "planning" | "review" | "approved" | "implementing" | "done";
  messages: ChatMessage[];
  generatedStory: GeneratedStory | null;
  issueId: string | null;       // GitHub issue number once created
  issueUrl: string | null;
  pmApproval: ApprovalStatus;
  engApproval: ApprovalStatus;
  taskId: string | null;        // FACE task ID once implementation starts
  createdAt: string;
  updatedAt: string;
}

// ── Persistence ────────────────────────────────────────────────────

const WORKFLOW_DIR = join(homedir(), ".face", "workflows");

function ensureDir() {
  if (!existsSync(WORKFLOW_DIR)) mkdirSync(WORKFLOW_DIR, { recursive: true });
}

export function saveWorkflow(w: WorkflowState) {
  ensureDir();
  writeFileSync(join(WORKFLOW_DIR, `${w.id}.json`), JSON.stringify(w, null, 2));
}

export function loadWorkflow(id: string): WorkflowState | null {
  const path = join(WORKFLOW_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function listWorkflows(): WorkflowState[] {
  ensureDir();
  const { readdirSync } = require("fs");
  const files: string[] = readdirSync(WORKFLOW_DIR);
  return files
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => {
      try {
        return JSON.parse(readFileSync(join(WORKFLOW_DIR, f), "utf-8")) as WorkflowState;
      } catch {
        return null;
      }
    })
    .filter((w): w is WorkflowState => w !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function createWorkflow(): WorkflowState {
  const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const w: WorkflowState = {
    id,
    phase: "gathering",
    messages: [],
    generatedStory: null,
    issueId: null,
    issueUrl: null,
    pmApproval: "pending",
    engApproval: "pending",
    taskId: null,
    createdAt: now,
    updatedAt: now,
  };
  saveWorkflow(w);
  return w;
}

// ── AI prompt builders ─────────────────────────────────────────────

export function buildGatheringSystemPrompt(): string {
  return `You are a senior technical product manager AI assistant. Your job is to help the user refine a software requirement into a clear, actionable story.

RULES:
- Ask clarifying questions ONE AT A TIME to understand the requirement fully
- Focus on: user impact, acceptance criteria, edge cases, technical constraints
- When you have enough information (usually 3-5 exchanges), say EXACTLY: "[READY_TO_PLAN]" at the end of your message
- Keep responses concise — 2-3 sentences per question
- Don't write the story yet, just gather information`;
}

export function buildPlanningPrompt(messages: ChatMessage[]): string {
  const conversation = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");

  return `Based on this conversation, generate a GitHub issue / user story.

CONVERSATION:
${conversation}

Respond with EXACTLY this JSON format (no markdown fencing):
{
  "title": "concise issue title",
  "body": "## Summary\\n...\\n\\n## Acceptance Criteria\\n- [ ] ...\\n\\n## Technical Notes\\n...\\n\\n## Out of Scope\\n...",
  "labels": ["enhancement"],
  "priority": "medium",
  "estimatedEffort": "medium"
}

Requirements for the body:
- Summary: 2-3 sentences describing the feature
- Acceptance Criteria: specific, testable checkboxes
- Technical Notes: implementation hints and constraints
- Out of Scope: what this story does NOT cover`;
}

export function buildImplementationPrompt(story: GeneratedStory, issueUrl?: string): string {
  return `You are implementing the following approved story. Work on it carefully and completely.
${issueUrl ? `\nISSUE: ${issueUrl}\n` : ""}
TITLE: ${story.title}

${story.body}

INSTRUCTIONS:
- Implement all acceptance criteria
- Write clean, production-quality code
- Follow existing code patterns in the repository
- Create a new branch for this work
- Commit with clear messages referencing the issue`;
}
