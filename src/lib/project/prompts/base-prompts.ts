/**
 * Base prompts for PM tool integrations.
 *
 * Each prompt describes the expected API shape, field mappings, and
 * normalization rules for a specific provider.  The AI agent uses these
 * prompts when interacting with PM tool APIs.  If the runtime encounters
 * an unexpected response, a *patch* prompt is generated automatically
 * and persisted in ~/.face/prompt-patches/ so future runs silently adapt.
 *
 * Versioned so that codebase updates can gracefully invalidate stale patches.
 */

export interface BasePrompt {
  /** Provider type key (matches ProjectProvider.type) */
  provider: string;
  /** Semver-style version — bump when the prompt changes materially */
  version: string;
  /** Human-readable description for logging */
  description: string;
  /** The prompt text itself */
  content: string;
}

// ── GitHub ────────────────────────────────────────────────────────────

export const GITHUB_BASE_PROMPT: BasePrompt = {
  provider: "github",
  version: "1.0.0",
  description: "GitHub REST API v3 integration prompt",
  content: `## GitHub Integration

### API Basics
- Base URL: https://api.github.com
- Auth: Bearer token via Authorization header
- API version header: X-GitHub-Api-Version: 2022-11-28
- Accept: application/vnd.github+json

### Issue Schema
Expected fields on GET /repos/{owner}/{repo}/issues/{number}:
- number (integer): issue number
- title (string): issue title
- body (string | null): issue body markdown
- state (string): "open" or "closed"
- state_reason (string | null): "completed", "not_planned", or null
- labels (array): objects with { id, name, color }
- assignees (array): objects with { login, id, avatar_url }
- user (object): author with { login, id, avatar_url }
- milestone (object | null): { title, number, html_url }
- created_at (string): ISO 8601 timestamp
- updated_at (string): ISO 8601 timestamp
- html_url (string): web URL for the issue
- pull_request (object | undefined): present only if this is a PR

### Status Mapping
- state:"closed" + state_reason:"not_planned" -> "cancelled"
- state:"closed" (otherwise) -> "done"
- Labels containing "in review"/"in-review"/"review" -> "in_review"
- Labels containing "in progress"/"in-progress"/"wip" -> "in_progress"
- Open issue with linked PR -> "in_progress"
- Open issue (default) -> "todo"

### Priority Mapping (from labels)
- Label contains "urgent" or "p0" -> "urgent"
- Label contains "high" or "p1" -> "high"
- Label contains "medium" or "p2" -> "medium"
- Label contains "low" or "p3" -> "low"
- No priority label -> "none"

### Search API
- GET /search/issues?q=repo:{owner}/{repo}+is:issue+is:open+linked:pr
- Returns { items: [...] } — may be rate-limited, degrade gracefully

### PR Endpoints
- GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open
- POST /repos/{owner}/{repo}/pulls with { title, body, head, base }
- GET /repos/{owner}/{repo}/pulls/{number} — check merged/state fields`,
};

// ── Linear ────────────────────────────────────────────────────────────

export const LINEAR_BASE_PROMPT: BasePrompt = {
  provider: "linear",
  version: "1.0.0",
  description: "Linear GraphQL API integration prompt",
  content: `## Linear Integration

### API Basics
- Endpoint: https://api.linear.app/graphql
- Auth: API key directly in Authorization header (no "Bearer" prefix)
- Content-Type: application/json
- All queries use GraphQL

### Issue Schema (GraphQL type: Issue)
Expected fields:
- id (string): UUID
- identifier (string): e.g. "ENG-123"
- title (string): issue title
- description (string | null): markdown body
- state (object): { name, type } — type is one of "backlog","unstarted","started","completed","cancelled"
- priority (integer): 0=none, 1=urgent, 2=high, 3=medium, 4=low
- labels (object): { nodes: [{ id, name, color }] }
- assignee (object | null): { id, name, avatarUrl }
- creator (object): { id, name }
- createdAt (string): ISO 8601
- updatedAt (string): ISO 8601
- url (string): web URL

### Status Mapping (from state.name)
- "Backlog" -> "backlog"
- "Todo" -> "todo"
- "In Progress" -> "in_progress"
- "In Review" -> "in_review"
- "Done" -> "done"
- "Cancelled" / "Canceled" -> "cancelled"

### Priority Mapping (from priority integer)
- 0 -> "none"
- 1 -> "urgent"
- 2 -> "high"
- 3 -> "medium"
- 4 -> "low"

### Common Queries
- Viewer: { viewer { id name } }
- Team issues: { team(id: $teamId) { issues { nodes { ...fields } } } }
- Create: mutation { issueCreate(input: { teamId, title, description }) { issue { id } } }
- Update: mutation { issueUpdate(id: $id, input: { title }) { issue { id } } }

### Known Quirks
- Labels are returned as a connection: { nodes: [...] }, not a flat array
- Pagination uses cursor-based { pageInfo { hasNextPage, endCursor } }
- State names are workspace-customizable — match case-insensitively`,
};

// ── Jira ──────────────────────────────────────────────────────────────

export const JIRA_BASE_PROMPT: BasePrompt = {
  provider: "jira",
  version: "1.0.0",
  description: "Jira REST API v3 (Cloud) integration prompt",
  content: `## Jira Integration

### API Basics
- Base URL: {instance}.atlassian.net
- Auth: Basic auth with email:apiToken (base64 encoded)
- Accept: application/json
- API path prefix: /rest/api/3

### Issue Schema (GET /rest/api/3/issue/{key})
Expected fields nested under "fields":
- summary (string): issue title
- description (object | string | null): ADF document or plain text
- status (object): { name, statusCategory: { key } }
- priority (object): { name }
- labels (array of strings): flat label names
- assignee (object | null): { accountId, displayName, avatarUrls }
- creator (object): { accountId, displayName }
- created (string): ISO 8601
- updated (string): ISO 8601
- fixVersions (array): [{ id, name, releaseDate }] — used as milestones
- comment (object): { comments: [{ id, author, body, created }] }
Top-level fields:
- key (string): e.g. "PROJ-42"
- id (string): numeric ID as string
- self (string): API URL

### Status Mapping (from status.name, case-insensitive)
- "To Do" / "Open" / "New" -> "todo"
- "In Progress" / "In Development" -> "in_progress"
- "In Review" / "Code Review" -> "in_review"
- "Done" / "Closed" / "Resolved" -> "done"
- "Cancelled" / "Rejected" / "Won't Do" -> "cancelled"
- Default -> "backlog"

### Priority Mapping (from priority.name, case-insensitive)
- "Highest" / "Blocker" -> "urgent"
- "High" -> "high"
- "Medium" -> "medium"
- "Low" / "Lowest" -> "low"
- Default -> "none"

### Search (JQL)
- POST /rest/api/3/search with { jql, maxResults, fields }
- Common fields: summary,description,status,priority,labels,assignee,creator,created,updated,fixVersions,comment

### Status Transitions
- GET /rest/api/3/issue/{key}/transitions -> { transitions: [{ id, name, to }] }
- POST /rest/api/3/issue/{key}/transitions with { transition: { id } }
- Must look up transition ID by target status name

### Known Quirks
- description is ADF (Atlassian Document Format) by default, not markdown
- Comments also use ADF: { type: "doc", version: 1, content: [...] }
- Some endpoints return different shapes for Cloud vs. Server/Data Center
- Status changes require the transitions API, not direct field update`,
};

// ── Registry ──────────────────────────────────────────────────────────

const BASE_PROMPTS: Record<string, BasePrompt> = {
  github: GITHUB_BASE_PROMPT,
  linear: LINEAR_BASE_PROMPT,
  jira: JIRA_BASE_PROMPT,
};

export function getBasePrompt(provider: string): BasePrompt | null {
  return BASE_PROMPTS[provider] ?? null;
}

export function getAllBasePrompts(): BasePrompt[] {
  return Object.values(BASE_PROMPTS);
}
