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

function mapGitHubState(
  state: string,
  stateReason?: string | null,
  hasLinkedPR?: boolean,
  labels?: Array<{ name: string }>,
): IssueStatus {
  if (state === "closed") return stateReason === "not_planned" ? "cancelled" : "done";

  // Check labels for explicit status hints
  const labelNames = (labels ?? []).map((l) => l.name.toLowerCase());
  if (labelNames.some((n) => n === "in review" || n === "in-review" || n === "review")) return "in_review";
  if (labelNames.some((n) => n === "in progress" || n === "in-progress" || n === "wip")) return "in_progress";

  // Issues with a linked PR are at least in progress
  if (hasLinkedPR) return "in_progress";

  return "todo";
}

function reverseStatus(status: IssueStatus): "open" | "closed" {
  return status === "done" || status === "cancelled" ? "closed" : "open";
}

function mapPriority(labels: Array<{ name: string }>): IssuePriority {
  for (const l of labels) {
    const n = l.name.toLowerCase();
    if (n.includes("urgent") || n.includes("p0")) return "urgent";
    if (n.includes("high") || n.includes("p1")) return "high";
    if (n.includes("medium") || n.includes("p2")) return "medium";
    if (n.includes("low") || n.includes("p3")) return "low";
  }
  return "none";
}

function mapUser(u: { login: string; id: number; avatar_url: string }): User {
  return { id: String(u.id), name: u.login, avatar: u.avatar_url };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIssue(raw: any, hasLinkedPR = false): Issue {
  return {
    id: String(raw.number),
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    status: mapGitHubState(raw.state, raw.state_reason, hasLinkedPR, raw.labels),
    priority: mapPriority(raw.labels ?? []),
    labels: (raw.labels ?? []).map((l: { id: number; name: string; color: string }) => ({
      id: String(l.id),
      name: l.name,
      color: l.color,
    })),
    assignees: (raw.assignees ?? []).map(mapUser),
    author: raw.user ? mapUser(raw.user) : { id: "0", name: "unknown" },
    comments: [],
    milestone: raw.milestone?.title,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    url: raw.html_url,
    _raw: raw,
  };
}

// ── Provider ───────────────────────────────────────────────────────

export class GitHubProvider implements ProjectProvider {
  readonly type = "github";
  readonly displayName = "GitHub";

  private token = "";
  private owner = "";
  private repo = "";
  private baseUrl = "https://api.github.com";

  async connect(config: ProjectProviderConfig): Promise<void> {
    this.token = config.credentials.token ?? "";
    const [owner, repo] = config.scope.split("/");
    this.owner = owner;
    this.repo = repo;
    if (!this.owner || !this.repo) {
      throw new Error('GitHub scope must be "owner/repo"');
    }
  }

  private async api(path: string, init?: RequestInit) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.api(`/repos/${this.owner}/${this.repo}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // ── Projects ───────────────────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    // Use repo milestones as a lightweight "project" concept
    const milestones = await this.api(`/repos/${this.owner}/${this.repo}/milestones?state=open`);
    const issues = await this.listIssues();

    // Also return a default "All Issues" board
    const allBoard: Project = {
      id: "__all__",
      name: "All Issues",
      description: `All issues in ${this.owner}/${this.repo}`,
      columns: this.buildColumns(issues),
      url: `https://github.com/${this.owner}/${this.repo}/issues`,
    };

    const milestoneBoards: Project[] = milestones.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => ({
        id: String(m.number),
        name: m.title,
        description: m.description ?? "",
        columns: this.buildColumns(issues.filter((i) => i.milestone === m.title)),
        url: m.html_url,
      })
    );

    return [allBoard, ...milestoneBoards];
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
    const projects = await this.listProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  // ── Issues ─────────────────────────────────────────────────────

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    const params = new URLSearchParams({ per_page: "100", state: "all" });
    if (filter?.assignee) params.set("assignee", filter.assignee);
    if (filter?.label) params.set("labels", filter.label);
    if (filter?.milestone) params.set("milestone", filter.milestone);

    const raw = await this.api(`/repos/${this.owner}/${this.repo}/issues?${params}`);

    // Find which open issues have linked PRs via search API (single request)
    const issuesWithPR = await this.getIssuesWithLinkedPRs();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let issues: Issue[] = raw
      .filter((i: any) => !i.pull_request)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i: any) => mapIssue(i, issuesWithPR.has(i.number)));

    if (filter?.status?.length) {
      issues = issues.filter((i) => filter.status!.includes(i.status));
    }
    if (filter?.priority?.length) {
      issues = issues.filter((i) => filter.priority!.includes(i.priority));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      issues = issues.filter(
        (i) => i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q)
      );
    }
    return issues;
  }

  async getIssue(issueId: string): Promise<Issue | null> {
    try {
      const raw = await this.api(`/repos/${this.owner}/${this.repo}/issues/${issueId}`);
      const issue = mapIssue(raw);
      // Fetch comments
      const rawComments = await this.api(`/repos/${this.owner}/${this.repo}/issues/${issueId}/comments`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      issue.comments = rawComments.map((c: any) => ({
        id: String(c.id),
        author: mapUser(c.user),
        body: c.body,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
      return issue;
    } catch {
      return null;
    }
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    const raw = await this.api(`/repos/${this.owner}/${this.repo}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: input.assignees,
        milestone: input.milestone ? Number(input.milestone) : undefined,
      }),
    });
    return mapIssue(raw);
  }

  async updateIssue(issueId: string, input: UpdateIssueInput): Promise<Issue> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.body !== undefined) body.body = input.body;
    if (input.status !== undefined) body.state = reverseStatus(input.status);
    if (input.labels !== undefined) body.labels = input.labels;
    if (input.assignees !== undefined) body.assignees = input.assignees;
    if (input.milestone !== undefined) body.milestone = input.milestone ? Number(input.milestone) : null;

    const raw = await this.api(`/repos/${this.owner}/${this.repo}/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return mapIssue(raw);
  }

  // ── Comments ───────────────────────────────────────────────────

  async addComment(issueId: string, body: string): Promise<Comment> {
    const raw = await this.api(`/repos/${this.owner}/${this.repo}/issues/${issueId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    return {
      id: String(raw.id),
      author: mapUser(raw.user),
      body: raw.body,
      createdAt: raw.created_at,
    };
  }

  // ── Metadata ───────────────────────────────────────────────────

  async listLabels(): Promise<Label[]> {
    const raw = await this.api(`/repos/${this.owner}/${this.repo}/labels?per_page=100`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((l: any) => ({ id: String(l.id), name: l.name, color: l.color }));
  }

  async listMilestones(): Promise<Milestone[]> {
    const raw = await this.api(`/repos/${this.owner}/${this.repo}/milestones?state=all`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((m: any) => ({
      id: String(m.number),
      title: m.title,
      description: m.description ?? "",
      dueDate: m.due_on,
      progress: m.open_issues + m.closed_issues > 0
        ? Math.round((m.closed_issues / (m.open_issues + m.closed_issues)) * 100)
        : 0,
      openIssues: m.open_issues,
      closedIssues: m.closed_issues,
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Use GitHub search to find open issues that have a linked PR.
   * Returns a Set of issue numbers.
   */
  private async getIssuesWithLinkedPRs(): Promise<Set<number>> {
    try {
      const q = encodeURIComponent(`repo:${this.owner}/${this.repo} is:issue is:open linked:pr`);
      const data = await this.api(`/search/issues?q=${q}&per_page=100`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Set((data.items ?? []).map((i: any) => i.number as number));
    } catch {
      // Search API may be rate-limited; degrade gracefully
      return new Set();
    }
  }

  // ── Pull Requests ──────────────────────────────────────────────

  /**
   * List open PRs whose head branch matches the given branch name.
   */
  async findPRByBranch(branch: string): Promise<{ number: number; url: string } | null> {
    try {
      const prs = await this.api(
        `/repos/${this.owner}/${this.repo}/pulls?head=${this.owner}:${branch}&state=open&per_page=1`
      );
      if (prs.length > 0) {
        return { number: prs[0].number, url: prs[0].html_url };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Create a pull request.
   */
  async createPullRequest(input: {
    title: string;
    body: string;
    head: string;
    base?: string;
  }): Promise<{ number: number; url: string }> {
    const raw = await this.api(`/repos/${this.owner}/${this.repo}/pulls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base ?? "main",
      }),
    });
    return { number: raw.number, url: raw.html_url };
  }

  /**
   * Get merge status of a PR by number.
   * Returns "open", "merged", or "closed" (closed without merge).
   */
  async getPRStatus(prNumber: number): Promise<"open" | "merged" | "closed"> {
    const raw = await this.api(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}`);
    if (raw.merged) return "merged";
    if (raw.state === "closed") return "closed";
    return "open";
  }

  /** Expose owner/repo for callers that need the repo identifier. */
  getRepo(): string {
    return `${this.owner}/${this.repo}`;
  }

  async listMembers(): Promise<User[]> {
    try {
      const raw = await this.api(`/repos/${this.owner}/${this.repo}/collaborators?per_page=100`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return raw.map((u: any) => mapUser(u));
    } catch {
      // Collaborators endpoint requires push access; fallback to assignees
      const raw = await this.api(`/repos/${this.owner}/${this.repo}/assignees?per_page=100`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return raw.map((u: any) => mapUser(u));
    }
  }
}
