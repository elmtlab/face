import { spawn, ChildProcess } from "child_process";
import { readConfig } from "./file-manager";
import { writeTask } from "./file-manager";
import { eventBus } from "../events/bus";
import type { FaceTask } from "./types";

// Track running processes globally
const globalForRunner = globalThis as unknown as {
  __faceRunningTasks?: Map<string, ChildProcess>;
};
if (!globalForRunner.__faceRunningTasks) {
  globalForRunner.__faceRunningTasks = new Map();
}
const runningTasks = globalForRunner.__faceRunningTasks;

export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function submitTask(
  agentId: string,
  prompt: string,
  options?: {
    workingDirectory?: string;
    title?: string;
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

  const task: FaceTask = {
    id: taskId,
    agent: agentId,
    title: options?.title ?? prompt.slice(0, 80),
    status: "running",
    prompt,
    summary: "Starting...",
    workingDirectory: options?.workingDirectory ?? process.cwd(),
    createdAt: now,
    updatedAt: now,
    steps: [],
    activities: [],
    result: null,
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
    "--output-format",
    "json",
  ];

  const child = spawn(binaryPath, args, {
    cwd: task.workingDirectory,
    env: {
      ...process.env,
      FACE_TASK_ID: task.id,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  runningTasks.set(task.id, child);

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", (code) => {
    runningTasks.delete(task.id);

    task.status = code === 0 ? "completed" : "failed";
    task.updatedAt = new Date().toISOString();

    // Try to parse JSON output
    try {
      const result = JSON.parse(stdout);
      task.result = result.result ?? stdout;
      task.summary = result.result?.slice(0, 200) ?? null;
    } catch {
      task.result = stdout || stderr || `Process exited with code ${code}`;
    }

    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });
  });

  child.on("error", (err) => {
    runningTasks.delete(task.id);
    task.status = "failed";
    task.result = err.message;
    task.updatedAt = new Date().toISOString();
    writeTask(task);
    eventBus.emit("task-file-changed", {
      event: "change",
      filename: `${task.id}.json`,
    });
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
