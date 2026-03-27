import type {
  ProjectProvider,
  ProjectProviderConfig,
  Project,
  Issue,
  IssueFilter,
  CreateIssueInput,
  UpdateIssueInput,
  Comment,
  Label,
  Milestone,
  User,
  IssueStatus,
  IssuePriority,
  Column,
} from "../types";

// ── Helpers ────────────────────────────────────────────────────────

// Used when mapping real Linear API responses (see TODO markers)
export function mapLinearState(stateName: string): IssueStatus {
  const name = stateName.toLowerCase();
  if (name === "backlog") return "backlog";
  if (name === "todo") return "todo";
  if (name === "in progress") return "in_progress";
  if (name === "in review") return "in_review";
  if (name === "done") return "done";
  if (name === "cancelled" || name === "canceled") return "cancelled";
  return "todo";
}

export function mapLinearPriority(priority: number): IssuePriority {
  switch (priority) {
    case 0: return "none";
    case 1: return "urgent";
    case 2: return "high";
    case 3: return "medium";
    case 4: return "low";
    default: return "none";
  }
}

function makePlaceholderIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "0",
    number: 0,
    title: "",
    body: "",
    status: "todo",
    priority: "none",
    labels: [],
    assignees: [],
    author: { id: "0", name: "unknown" },
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    url: "",
    ...overrides,
  };
}

// ── Provider ───────────────────────────────────────────────────────

export class LinearProvider implements ProjectProvider {
  readonly type = "linear";
  readonly displayName = "Linear";

  private apiKey = "";
  private teamId = "";
  private baseUrl = "https://api.linear.app/graphql";

  async connect(config: ProjectProviderConfig): Promise<void> {
    this.apiKey = config.credentials.token ?? "";
    this.teamId = config.scope;
    if (!this.apiKey) {
      throw new Error("Linear API key is required (credentials.token)");
    }
    if (!this.teamId) {
      throw new Error("Linear team ID is required (scope)");
    }
  }

  private async gql(query: string, variables?: Record<string, unknown>) {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linear API ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL: ${json.errors[0].message}`);
    }
    return json.data;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      // TODO: Replace with real Linear API call
      await this.gql(`{ viewer { id name } }`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // ── Projects ───────────────────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    // TODO: Replace with real Linear API call
    // Linear "projects" map to team projects; use team as a single board for now
    return [
      {
        id: this.teamId,
        name: "All Issues",
        description: `All issues in team ${this.teamId}`,
        columns: this.buildColumns([]),
        url: `https://linear.app/team/${this.teamId}`,
      },
    ];
  }

  private buildColumns(issues: Issue[]): Column[] {
    const statusOrder: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"];
    const statusNames: Record<IssueStatus, string> = {
      backlog: "Backlog",
      todo: "To Do",
      in_progress: "In Progress",
      in_review: "In Review",
      done: "Done",
      cancelled: "Cancelled",
    };

    return statusOrder.map((status) => ({
      id: status,
      name: statusNames[status],
      status,
      issueIds: issues.filter((i) => i.status === status).map((i) => i.id),
    }));
  }

  async getProject(projectId: string): Promise<Project | null> {
    // TODO: Replace with real Linear API call
    const projects = await this.listProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  // ── Issues ─────────────────────────────────────────────────────

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    // TODO: Replace with real Linear API call
    void filter;
    return [];
  }

  async getIssue(issueId: string): Promise<Issue | null> {
    // TODO: Replace with real Linear API call
    void issueId;
    return null;
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    // TODO: Replace with real Linear API call
    return makePlaceholderIssue({
      id: crypto.randomUUID(),
      title: input.title,
      body: input.body ?? "",
      status: input.status ?? "todo",
      priority: input.priority ?? "none",
    });
  }

  async updateIssue(issueId: string, input: UpdateIssueInput): Promise<Issue> {
    // TODO: Replace with real Linear API call
    return makePlaceholderIssue({
      id: issueId,
      title: input.title ?? "",
      body: input.body ?? "",
      status: input.status ?? "todo",
      priority: input.priority ?? "none",
    });
  }

  // ── Comments ───────────────────────────────────────────────────

  async addComment(issueId: string, body: string): Promise<Comment> {
    // TODO: Replace with real Linear API call
    void issueId;
    return {
      id: crypto.randomUUID(),
      author: { id: "0", name: "unknown" },
      body,
      createdAt: new Date().toISOString(),
    };
  }

  // ── Metadata ───────────────────────────────────────────────────

  async listLabels(): Promise<Label[]> {
    // TODO: Replace with real Linear API call
    return [];
  }

  async listMilestones(): Promise<Milestone[]> {
    // TODO: Replace with real Linear API call
    // Linear uses "cycles" and "projects" instead of milestones
    return [];
  }

  async listMembers(): Promise<User[]> {
    // TODO: Replace with real Linear API call
    return [];
  }
}
