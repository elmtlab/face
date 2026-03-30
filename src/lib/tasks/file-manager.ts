import fs from "fs";
import path from "path";
import os from "os";
import type { FaceTask, FaceConfig } from "./types";

const FACE_DIR = path.join(os.homedir(), ".face");
const TASKS_DIR = path.join(FACE_DIR, "tasks");
const CONFIG_PATH = path.join(FACE_DIR, "config.json");

export function ensureFaceDir(): void {
  if (!fs.existsSync(FACE_DIR)) {
    fs.mkdirSync(FACE_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
}

// --- Config ---

export function readConfig(): FaceConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeConfig(config: FaceConfig): void {
  ensureFaceDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// --- Tasks ---

export function writeTask(task: FaceTask): void {
  ensureFaceDir();
  const filePath = path.join(TASKS_DIR, `${task.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2), "utf-8");
}

export function readTask(taskId: string): FaceTask | null {
  try {
    const filePath = path.join(TASKS_DIR, `${taskId}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readAllTasks(): FaceTask[] {
  try {
    ensureFaceDir();
    const files = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json"));
    const tasks: FaceTask[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(TASKS_DIR, file), "utf-8");
        tasks.push(JSON.parse(raw));
      } catch {
        // Skip malformed files
      }
    }

    // Sort by updatedAt descending
    tasks.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return tasks;
  } catch {
    return [];
  }
}

export function deleteTask(taskId: string): boolean {
  try {
    const filePath = path.join(TASKS_DIR, `${taskId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// --- File Watcher ---

let watcher: fs.FSWatcher | null = null;

export function watchTasks(
  callback: (event: "change" | "rename", filename: string | null) => void
): () => void {
  ensureFaceDir();

  if (watcher) {
    watcher.close();
  }

  watcher = fs.watch(TASKS_DIR, (event, filename) => {
    if (filename && filename.endsWith(".json")) {
      callback(event as "change" | "rename", filename);
    }
  });

  return () => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };
}
