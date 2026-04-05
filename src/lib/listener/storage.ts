/**
 * Listener storage — file-based persistence for topics, content,
 * engagement, comments, and configuration.
 *
 * Follows the same pattern as tasks/file-manager.ts:
 * stores JSON files under ~/.face/listener/
 */

import fs from "fs";
import path from "path";
import os from "os";
import type {
  ScannedTopic,
  GeneratedContent,
  PostEngagement,
  SurfacedComment,
  ListenerState,
} from "./types";
import { DEFAULT_SCHEDULER_CONFIG } from "./types";

const FACE_DIR = path.join(os.homedir(), ".face");
const LISTENER_DIR = path.join(FACE_DIR, "listener");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// ── Paths ────────────────────────────────────────────────────────

const TOPICS_FILE = path.join(LISTENER_DIR, "topics.json");
const CONTENT_FILE = path.join(LISTENER_DIR, "content.json");
const ENGAGEMENT_FILE = path.join(LISTENER_DIR, "engagement.json");
const COMMENTS_FILE = path.join(LISTENER_DIR, "comments.json");
const STATE_FILE = path.join(LISTENER_DIR, "state.json");

// ── Topics ───────────────────────────────────────────────────────

export function getTopics(): ScannedTopic[] {
  return readJson<ScannedTopic[]>(TOPICS_FILE, []);
}

export function saveTopics(topics: ScannedTopic[]) {
  const existing = getTopics();
  const existingIds = new Set(existing.map((t) => t.id));
  const merged = [...existing, ...topics.filter((t) => !existingIds.has(t.id))];
  // Keep last 500 topics
  writeJson(TOPICS_FILE, merged.slice(-500));
}

export function getTopicById(id: string): ScannedTopic | undefined {
  return getTopics().find((t) => t.id === id);
}

// ── Content ──────────────────────────────────────────────────────

export function getContent(): GeneratedContent[] {
  return readJson<GeneratedContent[]>(CONTENT_FILE, []);
}

export function saveContent(content: GeneratedContent) {
  const existing = getContent();
  const idx = existing.findIndex((c) => c.id === content.id);
  if (idx >= 0) {
    existing[idx] = content;
  } else {
    existing.push(content);
  }
  writeJson(CONTENT_FILE, existing.slice(-500));
}

export function updateContent(
  id: string,
  update: Partial<GeneratedContent>,
): GeneratedContent | null {
  const all = getContent();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...update };
  writeJson(CONTENT_FILE, all);
  return all[idx];
}

export function getContentById(id: string): GeneratedContent | undefined {
  return getContent().find((c) => c.id === id);
}

export function getContentByStatus(
  status: GeneratedContent["status"],
): GeneratedContent[] {
  return getContent().filter((c) => c.status === status);
}

// ── Engagement ───────────────────────────────────────────────────

export function getEngagement(): PostEngagement[] {
  return readJson<PostEngagement[]>(ENGAGEMENT_FILE, []);
}

export function saveEngagement(engagement: PostEngagement) {
  const existing = getEngagement();
  const idx = existing.findIndex((e) => e.contentId === engagement.contentId);
  if (idx >= 0) {
    existing[idx] = engagement;
  } else {
    existing.push(engagement);
  }
  writeJson(ENGAGEMENT_FILE, existing);
}

export function getEngagementForContent(
  contentId: string,
): PostEngagement | undefined {
  return getEngagement().find((e) => e.contentId === contentId);
}

// ── Comments ─────────────────────────────────────────────────────

export function getComments(): SurfacedComment[] {
  return readJson<SurfacedComment[]>(COMMENTS_FILE, []);
}

export function saveComments(comments: SurfacedComment[]) {
  const existing = getComments();
  const existingIds = new Set(existing.map((c) => c.id));
  const merged = [
    ...existing,
    ...comments.filter((c) => !existingIds.has(c.id)),
  ];
  writeJson(COMMENTS_FILE, merged.slice(-1000));
}

export function updateComment(
  id: string,
  update: Partial<SurfacedComment>,
): SurfacedComment | null {
  const all = getComments();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...update };
  writeJson(COMMENTS_FILE, all);
  return all[idx];
}

export function getCommentsForContent(contentId: string): SurfacedComment[] {
  return getComments().filter((c) => c.contentId === contentId);
}

export function getHighQualityComments(
  minScore: number = 0.6,
): SurfacedComment[] {
  return getComments()
    .filter((c) => c.qualityScore >= minScore && !c.replied)
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

// ── State / config ───────────────────────────────────────────────

export function getListenerState(): ListenerState {
  return readJson<ListenerState>(STATE_FILE, {
    scheduler: { ...DEFAULT_SCHEDULER_CONFIG },
    adapters: [],
  });
}

export function saveListenerState(state: ListenerState) {
  writeJson(STATE_FILE, state);
}

export function updateListenerState(update: Partial<ListenerState>) {
  const current = getListenerState();
  saveListenerState({ ...current, ...update });
}
