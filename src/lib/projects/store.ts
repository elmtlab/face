/**
 * Multi-project storage.
 *
 * Persists projects as JSON in ~/.face/projects.json and tracks the
 * active project per-user. Each project has an id, name, and repo link.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Types ──────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  repoLink: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;
}

// ── Persistence ────────────────────────────────────────────────────

const FACE_DIR = join(homedir(), ".face");
const STORE_PATH = join(FACE_DIR, "projects.json");

function ensureDir() {
  if (!existsSync(FACE_DIR)) mkdirSync(FACE_DIR, { recursive: true });
}

function readStore(): ProjectStore {
  ensureDir();
  if (!existsSync(STORE_PATH)) {
    return { projects: [], activeProjectId: null };
  }
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { projects: [], activeProjectId: null };
  }
}

/**
 * Atomic write: write to a temp file in the same directory, then rename.
 * This prevents partial/corrupt writes if the process crashes mid-write.
 */
function writeStore(store: ProjectStore) {
  ensureDir();
  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2));
  try {
    renameSync(tmpPath, STORE_PATH);
  } catch {
    // Fallback for environments where rename fails (e.g. cross-device)
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  }
}

// ── Errors ─────────────────────────────────────────────────────────

export class DuplicateProjectError extends Error {
  constructor(name: string) {
    super(`A project named "${name}" already exists`);
    this.name = "DuplicateProjectError";
  }
}

// ── CRUD ───────────────────────────────────────────────────────────

export function listProjects(): Project[] {
  return readStore().projects;
}

export function getProject(id: string): Project | null {
  return readStore().projects.find((p) => p.id === id) ?? null;
}

export function createProject(name: string, repoLink: string): Project {
  const store = readStore();

  const duplicate = store.projects.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    throw new DuplicateProjectError(name);
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    repoLink,
    createdAt: now,
    updatedAt: now,
  };
  store.projects.push(project);

  // Auto-set as active if it's the first project
  if (store.projects.length === 1) {
    store.activeProjectId = project.id;
  }

  writeStore(store);
  return project;
}

export function updateProject(id: string, updates: { name?: string; repoLink?: string }): Project | null {
  const store = readStore();
  const project = store.projects.find((p) => p.id === id);
  if (!project) return null;

  if (updates.name !== undefined) project.name = updates.name;
  if (updates.repoLink !== undefined) project.repoLink = updates.repoLink;
  project.updatedAt = new Date().toISOString();

  writeStore(store);
  return project;
}

export function deleteProject(id: string): boolean {
  const store = readStore();
  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx === -1) return false;

  store.projects.splice(idx, 1);

  // Clear active if deleted
  if (store.activeProjectId === id) {
    store.activeProjectId = store.projects[0]?.id ?? null;
  }

  writeStore(store);
  return true;
}

// ── Active project ─────────────────────────────────────────────────

export function getActiveProjectId(): string | null {
  return readStore().activeProjectId;
}

export function setActiveProjectId(id: string | null): boolean {
  const store = readStore();
  if (id !== null && !store.projects.find((p) => p.id === id)) {
    return false;
  }
  store.activeProjectId = id;
  writeStore(store);
  return true;
}

export function getActiveProject(): Project | null {
  const store = readStore();
  if (!store.activeProjectId) return null;
  return store.projects.find((p) => p.id === store.activeProjectId) ?? null;
}
