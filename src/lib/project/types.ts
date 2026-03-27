/**
 * Project management provider abstraction.
 *
 * Each concrete provider (GitHub, Jira, Linear, …) implements the
 * ProjectProvider interface so the UI and API layer stay tool-agnostic.
 */

// ── Core domain types ──────────────────────────────────────────────

export type IssuePriority = "urgent" | "high" | "medium" | "low" | "none";
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";

export interface Label {
  id: string;
  name: string;
  color: string; // hex without #
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Comment {
  id: string;
  author: User;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Issue {
  id: string;
  number: number;
  title: string;
  body: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: Label[];
  assignees: User[];
  author: User;
  comments: Comment[];
  milestone?: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  /** Provider-native raw data */
  _raw?: unknown;
}

export interface Column {
  id: string;
  name: string;
  status: IssueStatus;
  issueIds: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  columns: Column[];
  url: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate?: string;
  progress: number; // 0-100
  openIssues: number;
  closedIssues: number;
}

// ── Mutation inputs ────────────────────────────────────────────────

export interface CreateIssueInput {
  title: string;
  body?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  labels?: string[];
  assignees?: string[];
  milestone?: string;
}

export interface UpdateIssueInput {
  title?: string;
  body?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  labels?: string[];
  assignees?: string[];
  milestone?: string;
}

export interface IssueFilter {
  status?: IssueStatus[];
  priority?: IssuePriority[];
  assignee?: string;
  label?: string;
  milestone?: string;
  search?: string;
}

// ── Provider interface ─────────────────────────────────────────────

export interface ProjectProviderConfig {
  type: string;           // "github" | "jira" | "linear"
  /** Display name for the connection */
  name: string;
  /** Provider-specific config (tokens, base URLs, etc.) */
  credentials: Record<string, string>;
  /** e.g. "owner/repo" for GitHub, project key for Jira */
  scope: string;
}

export interface ProjectProvider {
  readonly type: string;
  readonly displayName: string;

  // Connection
  connect(config: ProjectProviderConfig): Promise<void>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  // Projects / boards
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;

  // Issues
  listIssues(filter?: IssueFilter): Promise<Issue[]>;
  getIssue(issueId: string): Promise<Issue | null>;
  createIssue(input: CreateIssueInput): Promise<Issue>;
  updateIssue(issueId: string, input: UpdateIssueInput): Promise<Issue>;

  // Comments
  addComment(issueId: string, body: string): Promise<Comment>;

  // Metadata
  listLabels(): Promise<Label[]>;
  listMilestones(): Promise<Milestone[]>;
  listMembers(): Promise<User[]>;
}

// ── Provider registry ──────────────────────────────────────────────

export type ProviderFactory = () => ProjectProvider;
