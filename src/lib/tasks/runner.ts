import { spawn, execSync, ChildProcess } from "child_process";
import { readConfig } from "./file-manager";
import { writeTask, readTask, readAllTasks } from "./file-manager";
import { eventBus } from "../events/bus";
import type { FaceTask } from "./types";
import { postCompletionComment } from "./github-notify";
import { createPRForCompletedTask } from "../project/pr-creator";
import { cleanupWorktree, getWorktreeClonePath } from "../project/repo-manager";
import { getActiveProvider } from "../project/manager";
export { describeToolUse } from "./describe-tool";
import { describeToolUse } from "./describe-tool";

// Track running processes globally
const globalForRunner = globalThis as unknown as {
  __faceRunningTasks?: Map<string, ChildProcess>;
};
if (!globalForRunner.__faceRunningTasks) {
  globalForRunner.__faceRunningTasks = new Map();
}
const runningTasks = globalForRunner.__faceRunningTasks;

/**
 * Check for tasks on disk that claim to be "running" but have no tracked
 * process.  This happens after a server restart or crash — the in-memory
 * Map is empty but the JSON files still say "running".
 *
 * Skips tasks updated within the last 30 seconds to avoid killing tasks
 * that were just spawned (race with module reload in dev mode).
 */
export function cleanupOrphanedTasks(): void {
  const tasks = readAllTasks();
  const now = Date.now();
  const GRACE_PERIOD_MS = 30_000;

  for (const task of tasks) {
    if (task.status !== "running") continue;
    if (runningTasks.has(task.id)) continue;

    const age = now - new Date(task.updatedAt).getTime();
    if (age < GRACE_PERIOD_MS) continue;

    task.status = "failed";
    task.result = "Task process was interrupted (server restart or crash)";
    task.updatedAt = new Date().toISOString();
    writeTask(task);
  }
}

// Track whether cleanup has already run in this process to avoid
// re-running on hot module reload in dev mode.
const globalCleanup = globalThis as unknown as { __faceCleanupDone?: boolean };
if (!globalCleanup.__faceCleanupDone) {
  globalCleanup.__faceCleanupDone = true;
  cleanupOrphanedTasks();
}

/**
 * Determine the final task status by reconciling the in-memory task,
 * the on-disk task (possibly updated by hooks), and the process exit code.
 *
 * Returns an object with the resolved status and any result/summary to adopt
 * from the disk copy.
 */
export function resolveTaskStatus(
  exitCode: number | null,
  receivedResult: boolean,
  diskTask: FaceTask | null,
): { status: FaceTask["status"]; result?: string; summary?: string } {
  // If the hook already marked the task completed on disk, preserve that
  if (diskTask?.status === "completed") {
    return {
      status: "completed",
      result: diskTask.result ?? undefined,
      summary: diskTask.summary ?? undefined,
    };
  }
  // A result event from the agent stream means the task produced output
  if (receivedResult || exitCode === 0) {
    return { status: "completed" };
  }
  return { status: "failed" };
}

export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function submitTask(
  agentId: string,
  prompt: string,
  options?: {
    workingDirectory?: string;
    title?: string;
    linkedIssue?: number;
    creatorRole?: string;
    assignedRoles?: string[];
    projectId?: string;
  }
): Promise<{ taskId: string; error?: string }> {
  const config = readConfig();
  if (!config) {
    return { taskId: "", error: "FACE not configured. Run setup first." };
  }

  const agent = config.agents[agentId];
  if (!agent?.installed) {
    return { taskId: "", error: `Agent "${agentId}" is not installed.` };
  }

  if (!agent.path) {
    return { taskId: "", error: `Agent "${agentId}" path not found.` };
  }

  const taskId = generateTaskId();
  const now = new Date().toISOString();

  // Determine working directory. Callers (workflow route, submit API) resolve
  // per-project worktrees before calling submitTask and pass the path here.
  const workingDirectory = options?.workingDirectory ?? process.cwd();

  // Detect if this working directory is inside a git worktree so we can
  // record repo info for cleanup after completion.
  const clonePath = getWorktreeClonePath(workingDirectory);
  let repoInfo: FaceTask["repoInfo"];
  if (clonePath) {
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: workingDirectory,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      // Extract owner/repo from clone path (~/.face/repos/<owner>/<repo>)
      const parts = clonePath.split("/");
      const repo = parts[parts.length - 1];
      const owner = parts[parts.length - 2];
      repoInfo = {
        owner,
        repo,
        repoPath: clonePath,
        branchName: branch,
        worktreePath: workingDirectory,
      };
    } catch {
      // Not critical — continue without repo info
    }
  }

  const task: FaceTask = {
    id: taskId,
    agent: agentId,
    title: options?.title ?? prompt.slice(0, 80),
    status: "running",
    prompt,
    summary: "Starting...",
    workingDirectory,
    createdAt: now,
    updatedAt: now,
    steps: [],
    activities: [],
    result: null,
    linkedIssue: options?.linkedIssue,
    creatorRole: options?.creatorRole,
    assignedRoles: options?.assignedRoles,
    projectId: options?.projectId,
    repoInfo,
  };

  // Write initial task file
  writeTask(task);
  eventBus.emit("task-file-changed", { event: "change", filename: `${taskId}.json` });

  // Spawn the agent process
  if (agentId === "claude-code") {
    spawnClaudeCode(task, agent.path);
  } else {
    // Generic fallback - just mark as failed for unsupported agents
    task.status = "failed";
    task.result = `Agent "${agentId}" task submission not yet implemented.`;
    task.updatedAt = new Date().toISOString();
    writeTask(task);
  }

  return { taskId };
}

function spawnClaudeCode(task: FaceTask, binaryPath: string): void {
  const args = [
    "-p",
    task.prompt,
    "--verbose",
    "--output-format",
    "stream-json",
  ];

  // Allowlist env vars — don't leak secrets to child processes
  const child = spawn(binaryPath, args, {
    cwd: task.workingDirectory,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      SHELL: process.env.SHELL,
      LANG: process.env.LANG,
      TERM: process.env.TERM,
      NODE_ENV: process.env.NODE_ENV,
      FACE_TASK_ID: task.id,
    } as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  runningTasks.set(task.id, child);

  // Heartbeat: periodically update task.updatedAt so the UI doesn't
  // think the task is stale during long operations with no tool_use events.
  const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
  const heartbeat = setInterval(() => {
    task.updatedAt = new Date().toISOString();
    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });
  }, HEARTBEAT_INTERVAL_MS);

  const MAX_OUTPUT = 2 * 1024 * 1024; // 2MB cap
  let stderr = "";
  let lineBuf = ""; // buffer for partial lines from stdout
  let stepIndex = 0;
  let lastWriteAt = 0;
  let receivedResult = false;
  const WRITE_THROTTLE_MS = 1000;

  /** Persist task to disk (throttled — at most once per second). */
  function throttledWrite(force?: boolean) {
    const now = Date.now();
    if (!force && now - lastWriteAt < WRITE_THROTTLE_MS) return;
    lastWriteAt = now;
    task.updatedAt = new Date().toISOString();
    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });
  }

  /** Mark the most recent running step as completed. */
  function completeCurrentStep() {
    const running = task.steps.findLast((s) => s.status === "running");
    if (running) {
      running.status = "completed";
    }
  }

  /** Process a single parsed stream-json event. */
  function handleStreamEvent(evt: Record<string, unknown>) {
    if (evt.type === "assistant") {
      const msg = evt.message as { content?: Array<Record<string, unknown>> } | undefined;
      if (!msg?.content) return;

      for (const block of msg.content) {
        if (block.type === "tool_use") {
          // Mark any previous running step as completed
          completeCurrentStep();

          const toolName = (block.name as string) ?? "unknown";
          const toolInput = (block.input as Record<string, unknown>) ?? {};
          const description = describeToolUse(toolName, toolInput);

          task.steps.push({
            id: `step-${stepIndex++}`,
            tool: toolName,
            description,
            status: "running",
            timestamp: new Date().toISOString(),
          });

          task.summary = description;
          throttledWrite();
        }
      }
    } else if (evt.type === "result") {
      // Final event — complete last step and capture result
      completeCurrentStep();
      receivedResult = true;
      const resultText = (evt.result as string) ?? "";
      task.result = resultText;
      task.summary = resultText.slice(0, 200) || task.summary;
      // Will be written on close, no need to throttle here
    }
  }

  child.stdout?.on("data", (data: Buffer) => {
    lineBuf += data.toString();
    if (lineBuf.length > MAX_OUTPUT) {
      lineBuf = lineBuf.slice(-MAX_OUTPUT);
    }

    // Process complete lines (newline-delimited JSON)
    let newlineIdx: number;
    while ((newlineIdx = lineBuf.indexOf("\n")) !== -1) {
      const line = lineBuf.slice(0, newlineIdx).trim();
      lineBuf = lineBuf.slice(newlineIdx + 1);
      if (!line) continue;

      try {
        const evt = JSON.parse(line) as Record<string, unknown>;
        handleStreamEvent(evt);
      } catch {
        // Not valid JSON — ignore (could be stray stderr or partial line)
      }
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    if (stderr.length < MAX_OUTPUT) stderr += data.toString();
  });

  child.on("close", (code) => {
    clearInterval(heartbeat);
    runningTasks.delete(task.id);

    // Process any remaining partial line in the buffer
    if (lineBuf.trim()) {
      try {
        const evt = JSON.parse(lineBuf.trim()) as Record<string, unknown>;
        handleStreamEvent(evt);
      } catch {
        // ignore
      }
    }

    completeCurrentStep();

    // Reconcile in-memory state, disk state, and exit code
    const diskTask = readTask(task.id);
    const resolved = resolveTaskStatus(code, receivedResult, diskTask);
    task.status = resolved.status;
    if (resolved.result && !task.result) {
      task.result = resolved.result;
    }
    if (resolved.summary) {
      task.summary = resolved.summary;
    }

    task.updatedAt = new Date().toISOString();

    // If no result was captured from stream events, fall back to stderr
    if (!task.result) {
      task.result = stderr || `Process exited with code ${code}`;
    }

    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });

    // Post completion comment to linked GitHub issue (fire-and-forget)
    postCompletionComment(task);

    // Auto-create PR for completed implementation tasks.
    // If PR creation fails and the task has a linked issue on the PR path,
    // mark the requirement as "failed" so it doesn't stay "in progress" forever.
    if (task.status === "completed") {
      createPRForCompletedTask(task).catch(async (err) => {
        console.error(`[face] PR creation failed for task ${task.id}:`, err);
        if (task.linkedIssue && task.repoInfo) {
          try {
            const provider = await getActiveProvider();
            if (provider) {
              await provider.updateIssue(String(task.linkedIssue), { status: "failed" });
              console.log(`[face] Set issue #${task.linkedIssue} status to failed after PR creation failure`);
            }
          } catch (statusErr) {
            console.error(`[face] Failed to update issue #${task.linkedIssue} status to failed:`, statusErr);
          }
        }
      });
    }

    // Clean up worktree on failure (PR creator handles cleanup on success)
    if (task.status === "failed" && task.repoInfo) {
      try {
        cleanupWorktree(task.repoInfo.repoPath, task.repoInfo.worktreePath);
        console.log(`[face] Cleaned up worktree for failed task ${task.id}`);
      } catch {
        // best-effort
      }
    }
  });

  child.on("error", (err) => {
    clearInterval(heartbeat);
    runningTasks.delete(task.id);
    task.status = "failed";
    task.result = err.message;
    task.updatedAt = new Date().toISOString();
    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });

    // Post completion comment to linked GitHub issue (fire-and-forget)
    postCompletionComment(task);

    // Clean up worktree on failure
    if (task.repoInfo) {
      try {
        cleanupWorktree(task.repoInfo.repoPath, task.repoInfo.worktreePath);
      } catch {
        // best-effort
      }
    }
  });
}

export function getRunningTaskIds(): string[] {
  return Array.from(runningTasks.keys());
}

export function cancelTask(taskId: string): boolean {
  const child = runningTasks.get(taskId);
  if (child) {
    child.kill("SIGTERM");
    runningTasks.delete(taskId);
    return true;
  }
  return false;
}
