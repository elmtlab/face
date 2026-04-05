/**
 * Listener — Social media management pipeline.
 *
 * Pluggable platform adapter interface and shared types.
 * X/Twitter is the first adapter; more platforms can be added
 * by implementing the PlatformAdapter interface.
 */

// ── Topic scanning ───────────────────────────────────────────────

export interface ScannedTopic {
  id: string;
  platformId: string;
  platform: string;
  title: string;
  description: string;
  /** Keywords that matched this topic */
  matchedKeywords: string[];
  /** Relevance score 0–1 */
  relevanceScore: number;
  /** Volume / engagement on the platform */
  trendVolume: number;
  url?: string;
  scannedAt: string;
}

// ── Content generation & publishing ──────────────────────────────

export type ContentStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "published"
  | "failed";

export interface GeneratedContent {
  id: string;
  /** Topic that inspired this content */
  topicId: string;
  platform: string;
  /** The generated text */
  body: string;
  /** Optional media URLs */
  mediaUrls?: string[];
  status: ContentStatus;
  /** User who reviewed (if any) */
  reviewedBy?: string;
  /** Edit made by user before publishing */
  editedBody?: string;
  /** Rejection reason */
  rejectionReason?: string;
  /** Platform post ID once published */
  platformPostId?: string;
  /** Platform URL once published */
  platformPostUrl?: string;
  createdAt: string;
  publishedAt?: string;
}

// ── Engagement & comments ────────────────────────────────────────

export interface EngagementMetrics {
  likes: number;
  reposts: number;
  replies: number;
  impressions: number;
  bookmarks: number;
}

export interface PostEngagement {
  contentId: string;
  platformPostId: string;
  platform: string;
  metrics: EngagementMetrics;
  fetchedAt: string;
}

export interface SurfacedComment {
  id: string;
  contentId: string;
  platformCommentId: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  authorProfileUrl?: string;
  body: string;
  /** Quality score 0–1 from the scoring pipeline */
  qualityScore: number;
  /** Breakdown of how the score was computed */
  scoreBreakdown: {
    relevance: number;
    sentiment: number;
    engagement: number;
  };
  metrics: {
    likes: number;
    replies: number;
  };
  /** Whether the user has replied to this comment */
  replied: boolean;
  /** Our reply if sent */
  replyBody?: string;
  replyPlatformId?: string;
  surfacedAt: string;
}

// ── Platform adapter interface ───────────────────────────────────

export interface PlatformAdapterConfig {
  type: string;
  name: string;
  credentials: Record<string, string>;
  enabled: boolean;
}

export interface PlatformAdapter {
  readonly type: string;
  readonly displayName: string;

  /** Initialize the adapter with credentials */
  connect(config: PlatformAdapterConfig): Promise<void>;

  /** Test the connection and credentials */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Scan the platform for trending topics matching the given keywords.
   * Returns topics sorted by relevance.
   */
  scanTopics(keywords: string[]): Promise<ScannedTopic[]>;

  /**
   * Publish content to the platform.
   * Returns the platform post ID and URL.
   */
  publishContent(body: string, mediaUrls?: string[]): Promise<{
    platformPostId: string;
    platformPostUrl: string;
  }>;

  /**
   * Fetch engagement metrics for a published post.
   */
  fetchEngagement(platformPostId: string): Promise<EngagementMetrics>;

  /**
   * Fetch replies/comments on a published post.
   */
  fetchComments(platformPostId: string): Promise<Array<{
    platformCommentId: string;
    authorName: string;
    authorHandle: string;
    authorProfileUrl?: string;
    body: string;
    metrics: { likes: number; replies: number };
  }>>;

  /**
   * Post a reply to a comment.
   */
  postReply(platformCommentId: string, body: string): Promise<{
    replyPlatformId: string;
  }>;
}

export type PlatformAdapterFactory = () => PlatformAdapter;

// ── Scheduler config ─────────────────────────────────────────────

export interface SchedulerConfig {
  /** Scan interval in minutes */
  scanIntervalMinutes: number;
  /** Content generation interval in minutes */
  generateIntervalMinutes: number;
  /** Engagement analysis interval in minutes */
  analyzeIntervalMinutes: number;
  /** Keywords / domains to track */
  keywords: string[];
  /** Whether the scheduler is enabled */
  enabled: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  scanIntervalMinutes: 120,
  generateIntervalMinutes: 180,
  analyzeIntervalMinutes: 360,
  keywords: [
    "AI",
    "artificial intelligence",
    "project management",
    "product management",
    "software engineering",
    "semiconductor",
    "chip design",
    "LLM",
    "machine learning",
  ],
  enabled: false,
};

// ── Listener state ───────────────────────────────────────────────

export interface ListenerState {
  scheduler: SchedulerConfig;
  adapters: PlatformAdapterConfig[];
  lastScanAt?: string;
  lastGenerateAt?: string;
  lastAnalyzeAt?: string;
}
