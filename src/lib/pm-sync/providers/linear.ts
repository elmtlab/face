import type {
  PMSyncProvider,
  PMSyncProviderConfig,
  PMProjectInput,
  PMTaskInput,
  PMSyncResult,
} from "../types";

/**
 * Linear PM sync adapter.
 *
 * Uses Linear's GraphQL API to create projects and issues
 * that mirror FACE projects and tasks.
 */

// ── Priority mapping ──────────────────────────────────────────────

function toLinearPriority(priority?: string): number {
  switch (priority) {
    case "urgent": return 1;
    case "high": return 2;
    case "medium": return 3;
    case "low": return 4;
    default: return 0; // no priority
  }
}

// ── Provider ──────────────────────────────────────────────────────

export class LinearSyncProvider implements PMSyncProvider {
  readonly type = "linear";
  readonly displayName = "Linear";

  private apiKey = "";
  private teamId = "";
  private baseUrl = "https://api.linear.app/graphql";

  async connect(config: PMSyncProviderConfig): Promise<void> {
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
      await this.gql(`{ viewer { id name } }`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async createProject(input: PMProjectInput): Promise<PMSyncResult> {
    try {
      const data = await this.gql(
        `mutation CreateProject($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project {
              id
              url
            }
          }
        }`,
        {
          input: {
            name: input.name,
            description: input.description ?? "",
            teamIds: [this.teamId],
          },
        },
      );

      const result = data.projectCreate;
      if (!result.success) {
        return { ok: false, error: "Linear projectCreate returned success=false" };
      }

      return {
        ok: true,
        externalId: result.project.id,
        externalUrl: result.project.url,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async createTask(input: PMTaskInput): Promise<PMSyncResult> {
    try {
      const data = await this.gql(
        `mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              url
            }
          }
        }`,
        {
          input: {
            title: input.title,
            description: input.description ?? "",
            teamId: this.teamId,
            projectId: input.externalProjectId || undefined,
            priority: toLinearPriority(input.priority),
            labelIds: [], // Labels would need to be resolved by name first
          },
        },
      );

      const result = data.issueCreate;
      if (!result.success) {
        return { ok: false, error: "Linear issueCreate returned success=false" };
      }

      return {
        ok: true,
        externalId: result.issue.id,
        externalUrl: result.issue.url,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async updateTask(externalId: string, input: Partial<PMTaskInput>): Promise<PMSyncResult> {
    try {
      const updateFields: Record<string, unknown> = {};
      if (input.title !== undefined) updateFields.title = input.title;
      if (input.description !== undefined) updateFields.description = input.description;
      if (input.priority !== undefined) updateFields.priority = toLinearPriority(input.priority);

      const data = await this.gql(
        `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              url
            }
          }
        }`,
        { id: externalId, input: updateFields },
      );

      const result = data.issueUpdate;
      if (!result.success) {
        return { ok: false, error: "Linear issueUpdate returned success=false" };
      }

      return {
        ok: true,
        externalId: result.issue.id,
        externalUrl: result.issue.url,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
