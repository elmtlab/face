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

function mapJiraStatus(statusName: string): IssueStatus {
  const name = statusName.toLowerCase();
  if (name === "to do" || name === "open" || name === "new") return "todo";
  if (name === "in progress" || name === "in development") return "in_progress";
  if (name === "in review" || name === "code review") return "in_review";
  if (name === "done" || name === "closed" || name === "resolved") return "done";
  if (name === "cancelled" || name === "rejected" || name === "won't do") return "cancelled";
  return "backlog";
}

function reverseStatus(status: IssueStatus): string {
  switch (status) {
    case "todo": return "To Do";
    case "in_progress": return "In Progress";
    case "in_review": return "In Review";
    case "done": return "Done";
    case "cancelled": return "Won't Do";
    case "backlog": return "Backlog";
  }
}

function mapJiraPriority(priorityName: string): IssuePriority {
  const name = priorityName.toLowerCase();
  if (name === "highest" || name === "blocker") return "urgent";
  if (name === "high") return "high";
  if (name === "medium") return "medium";
  if (name === "low" || name === "lowest") return "low";
  return "none";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(u: any): User {
  return {
    id: u.accountId ?? u.key ?? "unknown",
    name: u.displayName ?? u.name ?? "Unknown",
    avatar: u.avatarUrls?.["48x48"],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIssue(raw: any): Issue {
  const fields = raw.fields ?? {};
  return {
    id: raw.key,
    number: Number(raw.id),
    title: fields.summary ?? "",
    body: fields.description ?? "",
    status: mapJiraStatus(fields.status?.name ?? ""),
    priority: mapJiraPriority(fields.priority?.name ?? ""),
    labels: (fields.labels ?? []).map((name: string, idx: number) => ({
      id: String(idx),
      name,
      color: "0052CC", // Jira blue default
    })),
    assignees: fields.assignee ? [mapUser(fields.assignee)] : [],
    author: fields.creator ? mapUser(fields.creator) : { id: "0", name: "unknown" },
    comments: [],
    milestone: fields.fixVersions?.[0]?.name,
    createdAt: fields.created ?? new Date().toISOString(),
    updatedAt: fields.updated ?? new Date().toISOString(),
    url: raw.self ? raw.self.replace("/rest/api/3/issue/", "/browse/") : "",
    _raw: raw,
  };
}

// ── Provider ───────────────────────────────────────────────────────

export class JiraProvider implements ProjectProvider {
  readonly type = "jira";
  readonly displayName = "Jira";

  private baseUrl = "";
  private email = "";
  private apiToken = "";
  private projectKey = "";

  async connect(config: ProjectProviderConfig): Promise<void> {
    this.apiToken = config.credentials.token ?? "";
    this.email = config.credentials.email ?? "";
    this.baseUrl = config.credentials.baseUrl ?? "";
    this.projectKey = config.scope ?? config.credentials.scope ?? "";

    if (!this.baseUrl) {
      throw new Error("Jira baseUrl is required (e.g. https://yourteam.atlassian.net)");
    }
    if (!this.projectKey) {
      throw new Error("Jira project key is required (e.g. PROJ)");
    }
    // Strip trailing slash
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
  }

  private async api(path: string, init?: RequestInit) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${this.email}:${this.apiToken}`)}`,
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      // TODO: Replace with real Jira API call
      await this.api(`/rest/api/3/myself`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // ── Projects ───────────────────────────────────────────────────

  async listProjects(): Promise<Project[]> {
    // TODO: Replace with real Jira API call
    const issues = await this.listIssues();

    const board: Project = {
      id: this.projectKey,
      name: this.projectKey,
      description: `Jira project ${this.projectKey}`,
      columns: this.buildColumns(issues),
      url: `${this.baseUrl}/browse/${this.projectKey}`,
    };
    return [board];
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
    // TODO: Replace with real Jira API call
    const jqlParts: string[] = [`project = ${this.projectKey}`];
    if (filter?.assignee) jqlParts.push(`assignee = "${filter.assignee}"`);
    if (filter?.label) jqlParts.push(`labels = "${filter.label}"`);
    if (filter?.search) jqlParts.push(`text ~ "${filter.search}"`);

    const jql = jqlParts.join(" AND ");
    const params = new URLSearchParams({
      jql,
      maxResults: "100",
      fields: "summary,description,status,priority,labels,assignee,creator,created,updated,fixVersions,comment",
    });

    const data = await this.api(`/rest/api/3/search?${params}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let issues: Issue[] = (data.issues ?? []).map((raw: any) => mapIssue(raw));

    if (filter?.status?.length) {
      issues = issues.filter((i) => filter.status!.includes(i.status));
    }
    if (filter?.priority?.length) {
      issues = issues.filter((i) => filter.priority!.includes(i.priority));
    }
    return issues;
  }

  async getIssue(issueId: string): Promise<Issue | null> {
    try {
      // TODO: Replace with real Jira API call
      const raw = await this.api(`/rest/api/3/issue/${issueId}?fields=summary,description,status,priority,labels,assignee,creator,created,updated,fixVersions,comment`);
      const issue = mapIssue(raw);
      // Map comments
      const commentData = raw.fields?.comment?.comments ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      issue.comments = commentData.map((c: any) => ({
        id: c.id,
        author: mapUser(c.author),
        body: typeof c.body === "string" ? c.body : JSON.stringify(c.body),
        createdAt: c.created,
        updatedAt: c.updated,
      }));
      return issue;
    } catch {
      return null;
    }
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    // TODO: Replace with real Jira API call
    const body = {
      fields: {
        project: { key: this.projectKey },
        summary: input.title,
        description: input.body ?? "",
        issuetype: { name: "Task" },
        labels: input.labels ?? [],
        ...(input.assignees?.length ? { assignee: { accountId: input.assignees[0] } } : {}),
        ...(input.milestone ? { fixVersions: [{ name: input.milestone }] } : {}),
      },
    };

    const raw = await this.api(`/rest/api/3/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Jira create returns minimal data; fetch the full issue
    const created = await this.getIssue(raw.key);
    if (!created) throw new Error("Failed to fetch created issue");
    return created;
  }

  async updateIssue(issueId: string, input: UpdateIssueInput): Promise<Issue> {
    // TODO: Replace with real Jira API call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields: any = {};
    if (input.title !== undefined) fields.summary = input.title;
    if (input.body !== undefined) fields.description = input.body;
    if (input.labels !== undefined) fields.labels = input.labels;
    if (input.assignees !== undefined) {
      fields.assignee = input.assignees.length ? { accountId: input.assignees[0] } : null;
    }
    if (input.milestone !== undefined) {
      fields.fixVersions = input.milestone ? [{ name: input.milestone }] : [];
    }

    await this.api(`/rest/api/3/issue/${issueId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });

    // Handle status transition separately
    if (input.status !== undefined) {
      // TODO: Replace with real Jira transition API call
      // In real implementation, first GET /rest/api/3/issue/{id}/transitions
      // then POST to transition to the target status
      const targetName = reverseStatus(input.status);
      void targetName; // suppress unused warning for stub
    }

    const updated = await this.getIssue(issueId);
    if (!updated) throw new Error("Failed to fetch updated issue");
    return updated;
  }

  // ── Comments ───────────────────────────────────────────────────

  async addComment(issueId: string, body: string): Promise<Comment> {
    // TODO: Replace with real Jira API call
    const raw = await this.api(`/rest/api/3/issue/${issueId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
        },
      }),
    });
    return {
      id: raw.id,
      author: mapUser(raw.author),
      body: typeof raw.body === "string" ? raw.body : body,
      createdAt: raw.created,
    };
  }

  // ── Metadata ───────────────────────────────────────────────────

  async listLabels(): Promise<Label[]> {
    // TODO: Replace with real Jira API call
    const raw = await this.api(`/rest/api/3/label?maxResults=200`);
    return (raw.values ?? []).map((name: string, idx: number) => ({
      id: String(idx),
      name,
      color: "0052CC",
    }));
  }

  async listMilestones(): Promise<Milestone[]> {
    // TODO: Replace with real Jira API call — Jira uses "versions" as milestones
    const raw = await this.api(`/rest/api/3/project/${this.projectKey}/versions`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (raw ?? []).map((v: any) => ({
      id: String(v.id),
      title: v.name,
      description: v.description ?? "",
      dueDate: v.releaseDate,
      progress: 0, // TODO: compute from issue counts
      openIssues: 0,
      closedIssues: 0,
    }));
  }

  async listMembers(): Promise<User[]> {
    // TODO: Replace with real Jira API call
    try {
      const raw = await this.api(`/rest/api/3/user/assignable/search?project=${this.projectKey}&maxResults=100`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (raw ?? []).map((u: any) => mapUser(u));
    } catch {
      return [];
    }
  }
}
