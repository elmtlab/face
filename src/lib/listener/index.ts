/**
 * Listener module — public API.
 *
 * Re-exports everything needed by API routes and UI.
 */

// Ensure adapter auto-registers
import "./adapters/twitter";

export type {
  PlatformAdapter,
  PlatformAdapterConfig,
  ScannedTopic,
  GeneratedContent,
  ContentStatus,
  PostEngagement,
  EngagementMetrics,
  SurfacedComment,
  SchedulerConfig,
  ListenerState,
} from "./types";

export { DEFAULT_SCHEDULER_CONFIG } from "./types";

export {
  registerPlatformAdapter,
  createPlatformAdapter,
  availablePlatformAdapters,
} from "./registry";

export {
  getTopics,
  getTopicById,
  saveTopics,
  getContent,
  getContentById,
  getContentByStatus,
  saveContent,
  updateContent,
  getEngagement,
  getEngagementForContent,
  saveEngagement,
  getComments,
  getCommentsForContent,
  getHighQualityComments,
  updateComment,
  saveComments,
  getListenerState,
  saveListenerState,
  updateListenerState,
} from "./storage";

export {
  generateContentForTopic,
  generateReplyForComment,
} from "./content-generator";

export { scoreComment, filterHighQualityComments } from "./comment-scorer";

export {
  runScanStage,
  runGenerateStage,
  runPublishStage,
  runAnalyzeStage,
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  clearAdapterCache,
} from "./scheduler";
