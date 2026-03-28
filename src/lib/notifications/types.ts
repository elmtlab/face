/**
 * Notification provider abstraction.
 *
 * Each concrete provider (Slack, Telegram, …) implements the
 * NotificationProvider interface so the AI layer can push
 * notifications without coupling to a specific channel.
 */

// ── Event types that trigger notifications ────────────────────────

export type NotificationEventType =
  | "stale_pr"
  | "unblocked_task"
  | "milestone_at_risk"
  | "task_completed"
  | "task_failed"
  | "issue_created"
  | "issue_updated"
  | "review_requested";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationPayload {
  /** Unique event ID for dedup */
  id: string;
  eventType: NotificationEventType;
  priority: NotificationPriority;
  /** Human-readable title */
  title: string;
  /** Longer description / body text */
  body: string;
  /** Optional deep-link back into FACE or external tool */
  url?: string;
  /** Arbitrary metadata for provider-specific formatting */
  metadata?: Record<string, unknown>;
  /** ISO timestamp of when the event occurred */
  timestamp: string;
}

export interface NotificationResult {
  ok: boolean;
  /** Provider-specific message ID if sent successfully */
  messageId?: string;
  error?: string;
}

// ── Provider config ───────────────────────────────────────────────

export interface NotificationProviderConfig {
  type: string; // "slack" | "telegram"
  name: string;
  credentials: Record<string, string>;
  /** Provider-specific target (channel ID, chat ID, etc.) */
  target: string;
  /** Which event types this provider should receive (empty = all) */
  eventFilter?: NotificationEventType[];
}

// ── Provider interface ────────────────────────────────────────────

export interface NotificationProvider {
  readonly type: string;
  readonly displayName: string;

  connect(config: NotificationProviderConfig): Promise<void>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /** Send a single notification */
  send(payload: NotificationPayload): Promise<NotificationResult>;

  /** Send multiple notifications (default: sequential send) */
  sendBatch?(payloads: NotificationPayload[]): Promise<NotificationResult[]>;
}

// ── Provider factory ──────────────────────────────────────────────

export type NotificationProviderFactory = () => NotificationProvider;
