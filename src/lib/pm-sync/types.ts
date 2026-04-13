/**
 * PM tool sync provider abstraction.
 *
 * Each concrete adapter (Linear, Jira, Asana, …) implements the
 * PMSyncProvider interface so FACE can push projects and tasks
 * to any external project management tool.
 */

// ── Sync item types ───────────────────────────────────────────────

export type SyncItemType = "project" | "task";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface SyncReference {
  /** FACE entity ID (project or task/issue) */
  faceId: string;
  /** Type of entity being synced */
  type: SyncItemType;
  /** External PM tool item ID once synced */
  externalId?: string;
  /** External PM tool URL for the item */
  externalUrl?: string;
  /** Current sync status */
  status: SyncStatus;
  /** Number of retry attempts so far */
  retryCount: number;
  /** Last error message if failed */
  lastError?: string;
  /** ISO timestamp of last sync attempt */
  lastAttemptAt?: string;
  /** ISO timestamp of successful sync */
  syncedAt?: string;
}

// ── Provider inputs ───────────────────────────────────────────────

export interface PMProjectInput {
  /** FACE project ID */
  faceId: string;
  name: string;
  description?: string;
}

export interface PMTaskInput {
  /** FACE issue/task ID */
  faceId: string;
  /** External project ID in the PM tool (returned from createProject) */
  externalProjectId: string;
  title: string;
  description?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled" | "failed";
  labels?: string[];
}

export interface PMSyncResult {
  ok: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

// ── Provider config ───────────────────────────────────────────────

export interface PMSyncProviderConfig {
  /** Provider type identifier: "linear" | "jira" | "asana" */
  type: string;
  /** Display name for this connection */
  name: string;
  /** Provider-specific credentials (API keys, tokens) */
  credentials: Record<string, string>;
  /** Provider-specific scope (team ID, project key, workspace ID) */
  scope: string;
  /** Whether sync is enabled for this provider */
  enabled: boolean;
}

// ── Provider interface ────────────────────────────────────────────

export interface PMSyncProvider {
  readonly type: string;
  readonly displayName: string;

  /** Initialize the provider with config */
  connect(config: PMSyncProviderConfig): Promise<void>;

  /** Test the connection and credentials */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /** Create a project/workspace in the external PM tool */
  createProject(input: PMProjectInput): Promise<PMSyncResult>;

  /** Create a task/issue in the external PM tool */
  createTask(input: PMTaskInput): Promise<PMSyncResult>;

  /** Update an existing task/issue in the external PM tool */
  updateTask(externalId: string, input: Partial<PMTaskInput>): Promise<PMSyncResult>;

  /** Archive (cancel) a task/issue in the external PM tool */
  archiveTask(externalId: string): Promise<PMSyncResult>;
}

// ── Provider factory ──────────────────────────────────────────────

export type PMSyncProviderFactory = () => PMSyncProvider;
