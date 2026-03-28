import { NextRequest, NextResponse } from "next/server";
import { readTask, writeTask, readAllTasks } from "@/lib/tasks/file-manager";
import { buildActivities, buildSummary } from "@/lib/tasks/summarize";
import { summarizePrompt } from "@/lib/tasks/ai-summarize";
import { eventBus } from "@/lib/events/bus";
import { postCompletionComment } from "@/lib/tasks/github-notify";
import type { FaceTask, FaceTaskStep } from "@/lib/tasks/types";

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_HOOK_TYPES = new Set([
  "UserPromptSubmit",
  "PostToolUse",
  "Stop",
  "unknown",
]);

function sanitizeId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, 128);
  return SAFE_ID_RE.test(trimmed) ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const sessionId = sanitizeId(body.session_id ?? body.sessionId);
    const hookType = VALID_HOOK_TYPES.has(body.hook_type ?? body.hookType)
      ? (body.hook_type ?? body.hookType)
      : "unknown";
    const taskIdFromEnv = sanitizeId(body.env?.FACE_TASK_ID);

    // --- Find or create task ---
    let task: FaceTask | null = null;

    if (taskIdFromEnv) {
      task = readTask(taskIdFromEnv);
    }

    if (!task && sessionId) {
      const allTasks = readAllTasks();
      task =
        allTasks.find(
          (t) => t.sessionId === sessionId && t.status === "running"
        ) ?? null;
    }

    if (!task) {
      const now = new Date().toISOString();
      task = {
        id: sessionId ? `session-${sessionId}` : `ext-${Date.now()}`,
        agent: "claude-code",
        title: "", // Will be set from UserPromptSubmit
        status: "running",
        prompt: "",
        summary: "Starting...",
        workingDirectory: body.cwd ?? "",
        createdAt: now,
        updatedAt: now,
        steps: [],
        activities: [],
        result: null,
        sessionId: sessionId ?? undefined,
      };
    }

    if (!task.activities) task.activities = [];

    // --- Handle by hook type ---

    if (hookType === "UserPromptSubmit" && body.prompt) {
      const userPrompt = String(body.prompt).trim();
      task.prompt = userPrompt;
      task.updatedAt = new Date().toISOString();

      // Show "New task" immediately while AI generates a real title
      task.title = "New task";
      task.summary = "Summarizing...";

      // AI generates the title in the background
      const taskId = task.id;
      summarizePrompt(userPrompt).then((aiTitle) => {
        const latest = readTask(taskId);
        if (latest) {
          latest.title = aiTitle;
          if (latest.summary === "Summarizing...") {
            latest.summary = aiTitle;
          }
          writeTask(latest);
          eventBus.emit("task-file-changed", {
            event: "change",
            filename: `${latest.id}.json`,
          });
        }
      }).catch(() => {
        // If AI fails, use simple fallback
        const latest = readTask(taskId);
        if (latest && latest.title === "New task") {
          latest.title = distillTitle(userPrompt);
          latest.summary = latest.title;
          writeTask(latest);
        }
      });
    }

    if (hookType === "PostToolUse" || body.tool_name) {
      const toolName = body.tool_name ?? "unknown";
      const input = body.tool_input ?? {};

      // Build a meaningful description from tool input
      const description = buildStepDescription(toolName, input);

      const step: FaceTaskStep = {
        id: `step-${task.steps.length + 1}`,
        tool: toolName,
        description,
        status: "completed",
        timestamp: new Date().toISOString(),
        output: body.tool_result
          ? String(body.tool_result).slice(0, 500)
          : undefined,
      };
      task.steps.push(step);
      task.updatedAt = new Date().toISOString();

      // Rebuild activities and summary
      task.activities = buildActivities(task.steps);
      task.summary = buildSummary(task);
    }

    if (hookType === "Stop" || body.stop_reason) {
      task.status = "completed";
      task.updatedAt = new Date().toISOString();

      // The agent's own explanation of what it did — this IS the summary
      const agentResponse = body.last_assistant_message ?? body.result;
      if (agentResponse) {
        const text = String(agentResponse);
        task.result = text.slice(0, 5000);
        // Use first paragraph or first ~300 chars as summary
        const firstPara = text.split(/\n\n/)[0].trim();
        task.summary = firstPara.length > 300
          ? firstPara.slice(0, 300) + "..."
          : firstPara;
      }
    }

    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });

    // Post completion comment to linked GitHub issue on terminal states (fire-and-forget)
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      postCompletionComment(task);
    }

    return NextResponse.json({ ok: true, taskId: task.id });
  } catch (err) {
    console.error("[face] Hook processing error:", err);
    return NextResponse.json(
      { error: "Failed to process hook" },
      { status: 500 }
    );
  }
}

/**
 * Build a human-readable description of what a tool did, focused on purpose.
 */
function buildStepDescription(
  tool: string,
  input: Record<string, unknown>
): string {
  const t = tool.toLowerCase();

  if (t === "edit" || t === "replace") {
    const file = input.file_path ?? input.filePath ?? "";
    return `Edit ${String(file)}`;
  }

  if (t === "write") {
    const file = input.file_path ?? input.filePath ?? "";
    return `Create ${String(file)}`;
  }

  if (t === "read") {
    const file = input.file_path ?? input.filePath ?? "";
    return `Read ${String(file)}`;
  }

  if (t === "bash") {
    const cmd = String(input.command ?? input.description ?? "").trim();
    return cmd.slice(0, 120) || "Running command";
  }

  if (t === "glob") {
    return `Search files: ${input.pattern ?? ""}`;
  }

  if (t === "grep") {
    return `Search content: ${input.pattern ?? ""}`;
  }

  // Fallback
  const desc =
    input.description ?? input.command ?? input.file_path ?? input.pattern;
  if (desc) return String(desc).slice(0, 120);
  return `${tool}`;
}

/**
 * Distill a user prompt into a concise, actionable title.
 *
 * Examples:
 *   "we don't need the left side bar" → "Remove the left sidebar"
 *   "fix the bug where login fails on mobile" → "Fix login failure on mobile"
 *   "can you add dark mode support" → "Add dark mode support"
 *   "I want to refactor the auth module to use JWT tokens instead" → "Refactor auth module to use JWT"
 */
function distillTitle(prompt: string): string {
  // Take first line only
  let text = prompt.split("\n")[0].trim();

  // Remove conversational fluff
  text = text
    .replace(/^(hey|hi|hello|please|can you|could you|I want to|I'd like to|let's|we should|we need to|I think we should)\s*/i, "")
    .replace(/^(go ahead and|try to|make sure to)\s*/i, "")
    .trim();

  // Convert negative phrasing to action
  // "we don't need X" → "Remove X"
  text = text.replace(
    /^(we |I )?(don'?t|do not) (need|want|like|use)\s+/i,
    "Remove "
  );
  // "there's no need for X" → "Remove X"
  text = text.replace(/^there'?s no need for\s+/i, "Remove ");
  // "get rid of X" → "Remove X"
  text = text.replace(/^get rid of\s+/i, "Remove ");

  // Capitalize first letter
  if (text.length > 0) {
    text = text[0].toUpperCase() + text.slice(1);
  }

  // Trim trailing punctuation
  text = text.replace(/[.!?]+$/, "").trim();

  // Cap length
  if (text.length > 80) {
    text = text.slice(0, 77) + "...";
  }

  return text || "Agent task";
}
