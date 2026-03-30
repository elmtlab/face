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

export interface PullRequestInfo {
  number: number;
  url: string;
  repo: string;          // "owner/repo"
  branch: string;
  status: "open" | "merged" | "closed"; // tracks current PR state
  conflicted?: boolean;  // true when rebase onto base branch failed
}

/** A snapshot of a previous requirement revision before it was edited. */
export interface RequirementRevision {
  version: number;
  requirement: string;          // the requirement text at this version
  story: GeneratedStory | null; // the generated story at this version
  taskId: string | null;        // the task that implemented this version
  pr: PullRequestInfo | null;   // PR from this version
  timestamp: string;
}

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
  pr: PullRequestInfo | null;   // PR created after implementation
  /** Role slug of the user who created this requirement (e.g. "pm", "dev") */
  creatorRole: string | null;
  /** Role slugs relevant to this requirement (e.g. ["dev", "pm"]) */
  assignedRoles: string[];
  /** Project this requirement belongs to */
  projectId: string | null;
  /** History of requirement revisions (oldest first) */
  revisions: RequirementRevision[];
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
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    // Backfill fields added after initial schema
    if (!("creatorRole" in raw)) raw.creatorRole = null;
    if (!("assignedRoles" in raw)) raw.assignedRoles = [];
    if (!("projectId" in raw)) raw.projectId = null;
    if (!("revisions" in raw)) raw.revisions = [];
    return raw;
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
      const id = f.replace(".json", "");
      return loadWorkflow(id);
    })
    .filter((w): w is WorkflowState => w !== null)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function createWorkflow(options?: { creatorRole?: string; assignedRoles?: string[]; projectId?: string }): WorkflowState {
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
    pr: null,
    creatorRole: options?.creatorRole ?? null,
    assignedRoles: options?.assignedRoles ?? [],
    projectId: options?.projectId ?? null,
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
  saveWorkflow(w);
  return w;
}

// ── AI prompt builders ─────────────────────────────────────────────

export function buildGatheringSystemPrompt(projectContext?: { projectName?: string; repoLink?: string; allProjects?: { id: string; name: string; repoLink: string }[] }): string {
  let projectInfo = "";

  if (projectContext?.projectName) {
    projectInfo = `\n\nCURRENT PROJECT: ${projectContext.projectName}${projectContext.repoLink ? ` (${projectContext.repoLink})` : ""}`;
  }

  if (projectContext?.allProjects && projectContext.allProjects.length > 1 && !projectContext.projectName) {
    projectInfo = `\n\nAVAILABLE PROJECTS:\n${projectContext.allProjects.map((p) => `- ${p.name}${p.repoLink ? ` (${p.repoLink})` : ""} [id: ${p.id}]`).join("\n")}

PROJECT DETECTION:
- Analyze the user's requirement to determine which project it belongs to based on keywords, repo references, and context.
- If you can confidently determine the project, include "[PROJECT_ID:<id>]" in your response (this tag will be hidden from the user).
- If the requirement could apply to multiple projects or you're unsure, ask the user which project this is for. List the project names for them to choose from.`;
  }

  return `You are a senior technical product manager AI assistant. Your job is to help the user refine a software requirement into a clear, actionable story.
${projectInfo}
RULES:
- If the user's message is already detailed and actionable (clear goal, scope, and steps), acknowledge the plan briefly and include "[READY_TO_PLAN]" in your FIRST response — do not ask unnecessary questions
- Only ask clarifying questions when the requirement is genuinely vague or ambiguous
- Ask at most one question at a time; focus on: user impact, acceptance criteria, edge cases, technical constraints
- When you have enough information, say EXACTLY: "[READY_TO_PLAN]" at the end of your message — this can be after 1 exchange or up to 5, whatever the requirement needs
- Keep responses concise — 2-3 sentences max
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
- Before starting, run: git fetch origin main && git checkout -b <feature-branch> origin/main
- Commit with clear messages referencing the issue`;
}

export function buildReimplementationPrompt(
  updatedRequirement: string,
  previousStory: GeneratedStory,
  pr: PullRequestInfo | null,
  issueUrl?: string,
): string {
  let previousContext = `PREVIOUS IMPLEMENTATION:\n`;
  previousContext += `Title: ${previousStory.title}\n\n`;
  previousContext += `${previousStory.body}\n`;
  if (pr) {
    previousContext += `\nPR: #${pr.number} (${pr.status}) on branch "${pr.branch}"`;
    if (pr.url) previousContext += ` — ${pr.url}`;
    previousContext += `\n`;
  }

  return `You are revising an existing implementation based on updated requirements. Build incrementally on what was already delivered — do NOT start from scratch.
${issueUrl ? `\nISSUE: ${issueUrl}\n` : ""}
${previousContext}
UPDATED REQUIREMENT:
${updatedRequirement}

INSTRUCTIONS:
- Review what was already implemented in the previous PR/branch
- Only make changes needed to satisfy the updated requirement — leave prior work intact
- If there is an existing feature branch, check it out and continue from there: git fetch origin && git checkout <branch>
- If no branch exists, create one from main
- Write clean, production-quality code
- Commit with clear messages explaining what changed and why`;
}
