/**
 * Listener pipeline scheduler.
 *
 * Orchestrates the automated scan → generate → publish → analyze cycle
 * with configurable intervals per stage.
 */

import type { PlatformAdapter, SchedulerConfig, SurfacedComment } from "./types";
import {
  getListenerState,
  saveTopics,
  getContentByStatus,
  saveContent,
  updateContent,
  saveEngagement,
  saveComments,
  getContent,
  updateListenerState,
} from "./storage";
import { generateContentForTopic } from "./content-generator";
import { scoreComment } from "./comment-scorer";
import { createPlatformAdapter } from "./registry";

// Import adapter to auto-register
import "./adapters/twitter";

const globalForScheduler = globalThis as unknown as {
  __listenerTimers?: Map<string, ReturnType<typeof setInterval>>;
  __listenerAdapters?: Map<string, PlatformAdapter>;
};

function getTimers() {
  if (!globalForScheduler.__listenerTimers) {
    globalForScheduler.__listenerTimers = new Map();
  }
  return globalForScheduler.__listenerTimers;
}

function getAdapters() {
  if (!globalForScheduler.__listenerAdapters) {
    globalForScheduler.__listenerAdapters = new Map();
  }
  return globalForScheduler.__listenerAdapters;
}

// ── Pipeline stages ──────────────────────────────────────────────

export async function runScanStage(): Promise<number> {
  const state = getListenerState();
  const adapters = await getConnectedAdapters();
  let totalTopics = 0;

  for (const adapter of adapters) {
    try {
      const topics = await adapter.scanTopics(state.scheduler.keywords);
      saveTopics(topics);
      totalTopics += topics.length;
      console.log(
        `[listener] Scanned ${topics.length} topics from ${adapter.type}`,
      );
    } catch (err) {
      console.error(`[listener] Scan failed for ${adapter.type}:`, err);
    }
  }

  updateListenerState({ lastScanAt: new Date().toISOString() });
  return totalTopics;
}

export async function runGenerateStage(): Promise<number> {
  // Get recent topics that don't have content yet
  const { getTopics } = await import("./storage");
  const topics = getTopics();
  const existingContent = getContent();
  const topicIdsWithContent = new Set(existingContent.map((c) => c.topicId));

  const newTopics = topics
    .filter((t) => !topicIdsWithContent.has(t.id))
    .slice(0, 5); // Generate for top 5 new topics

  let count = 0;
  for (const topic of newTopics) {
    try {
      const content = await generateContentForTopic(topic);
      saveContent(content);
      count++;
      console.log(`[listener] Generated content for topic: ${topic.title}`);
    } catch (err) {
      console.error(`[listener] Generation failed for ${topic.title}:`, err);
    }
  }

  updateListenerState({ lastGenerateAt: new Date().toISOString() });
  return count;
}

export async function runPublishStage(): Promise<number> {
  const approved = getContentByStatus("approved");
  const adapters = await getConnectedAdapters();
  let count = 0;

  for (const content of approved) {
    const adapter = adapters.find((a) => a.type === content.platform);
    if (!adapter) continue;

    try {
      const textToPublish = content.editedBody ?? content.body;
      const result = await adapter.publishContent(
        textToPublish,
        content.mediaUrls,
      );
      updateContent(content.id, {
        status: "published",
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
        publishedAt: new Date().toISOString(),
      });
      count++;
      console.log(`[listener] Published content ${content.id}`);
    } catch (err) {
      console.error(`[listener] Publish failed for ${content.id}:`, err);
      updateContent(content.id, { status: "failed" });
    }
  }

  return count;
}

export async function runAnalyzeStage(): Promise<number> {
  const published = getContentByStatus("published");
  const adapters = await getConnectedAdapters();
  let commentCount = 0;

  for (const content of published) {
    if (!content.platformPostId) continue;
    const adapter = adapters.find((a) => a.type === content.platform);
    if (!adapter) continue;

    try {
      // Fetch engagement metrics
      const metrics = await adapter.fetchEngagement(content.platformPostId);
      saveEngagement({
        contentId: content.id,
        platformPostId: content.platformPostId,
        platform: content.platform,
        metrics,
        fetchedAt: new Date().toISOString(),
      });

      // Fetch and score comments
      const rawComments = await adapter.fetchComments(
        content.platformPostId,
      );
      const postBody = content.editedBody ?? content.body;

      const scored: SurfacedComment[] = rawComments.map((c) => {
        const scores = scoreComment(c, postBody);
        return {
          id: `comment-${content.id}-${c.platformCommentId}`,
          contentId: content.id,
          platformCommentId: c.platformCommentId,
          platform: content.platform,
          authorName: c.authorName,
          authorHandle: c.authorHandle,
          authorProfileUrl: c.authorProfileUrl,
          body: c.body,
          qualityScore: scores.total,
          scoreBreakdown: {
            relevance: scores.relevance,
            sentiment: scores.sentiment,
            engagement: scores.engagement,
          },
          metrics: c.metrics,
          replied: false,
          surfacedAt: new Date().toISOString(),
        };
      });

      saveComments(scored);
      commentCount += scored.length;

      console.log(
        `[listener] Analyzed ${content.id}: ${metrics.likes} likes, ${scored.length} comments`,
      );
    } catch (err) {
      console.error(`[listener] Analyze failed for ${content.id}:`, err);
    }
  }

  updateListenerState({ lastAnalyzeAt: new Date().toISOString() });
  return commentCount;
}

// ── Scheduler control ────────────────────────────────────────────

export function startScheduler(config?: SchedulerConfig) {
  const state = getListenerState();
  const cfg = config ?? state.scheduler;

  if (!cfg.enabled) {
    console.log("[listener] Scheduler is disabled");
    return;
  }

  stopScheduler();

  const timers = getTimers();

  // Scan timer
  timers.set(
    "scan",
    setInterval(
      () => void runScanStage(),
      cfg.scanIntervalMinutes * 60_000,
    ),
  );

  // Generate timer (offset by 30s to stagger)
  timers.set(
    "generate",
    setInterval(
      () => void runGenerateStage(),
      cfg.generateIntervalMinutes * 60_000,
    ),
  );

  // Analyze timer
  timers.set(
    "analyze",
    setInterval(
      () => void runAnalyzeStage(),
      cfg.analyzeIntervalMinutes * 60_000,
    ),
  );

  // Publish check — runs every 5 min to catch newly approved content
  timers.set(
    "publish",
    setInterval(() => void runPublishStage(), 5 * 60_000),
  );

  console.log(
    `[listener] Scheduler started: scan=${cfg.scanIntervalMinutes}m, generate=${cfg.generateIntervalMinutes}m, analyze=${cfg.analyzeIntervalMinutes}m`,
  );
}

export function stopScheduler() {
  const timers = getTimers();
  for (const [key, timer] of timers) {
    clearInterval(timer);
    timers.delete(key);
  }
}

export function isSchedulerRunning(): boolean {
  return getTimers().size > 0;
}

// ── Adapter management ───────────────────────────────────────────

async function getConnectedAdapters(): Promise<PlatformAdapter[]> {
  const state = getListenerState();
  const cache = getAdapters();
  const result: PlatformAdapter[] = [];

  for (const config of state.adapters) {
    if (!config.enabled) continue;

    let adapter = cache.get(config.type);
    if (!adapter) {
      adapter = createPlatformAdapter(config);
      await adapter.connect(config);
      cache.set(config.type, adapter);
    }
    result.push(adapter);
  }

  return result;
}

export function clearAdapterCache() {
  getAdapters().clear();
}
