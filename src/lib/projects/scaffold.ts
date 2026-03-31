/**
 * Project scaffolding: creates default labels, milestones, and structure
 * in the connected PM tool after project setup.
 */

import { listProviderConfigs, getActiveProviderName } from "@/lib/project/manager";

// ── Default labels for new projects ───────────────────────────────

const DEFAULT_LABELS = [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "enhancement", color: "a2eeef", description: "New feature or request" },
  { name: "documentation", color: "0075ca", description: "Improvements or additions to docs" },
  { name: "high", color: "B60205", description: "High priority" },
  { name: "medium", color: "FBCA04", description: "Medium priority" },
  { name: "low", color: "0E8A16", description: "Low priority" },
  { name: "in progress", color: "5319E7", description: "Currently being worked on" },
  { name: "in review", color: "1D76DB", description: "Under review" },
];

const DEFAULT_MILESTONES = [
  { title: "MVP", description: "Minimum viable product — core features" },
  { title: "v1.0", description: "First public release" },
];

// ── Scaffold types ────────────────────────────────────────────────

export interface ScaffoldResult {
  labelsCreated: number;
  milestonesCreated: number;
  errors: string[];
}

// ── GitHub scaffolding ────────────────────────────────────────────

async function githubApi(
  owner: string,
  repo: string,
  token: string,
  path: string,
  init?: RequestInit,
) {
  const url = `https://api.github.com/repos/${owner}/${repo}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

async function scaffoldGitHub(owner: string, repo: string, token: string): Promise<ScaffoldResult> {
  const result: ScaffoldResult = { labelsCreated: 0, milestonesCreated: 0, errors: [] };

  // Fetch existing labels to avoid duplicates
  let existingLabels: Set<string>;
  try {
    const labels = await githubApi(owner, repo, token, "/labels?per_page=100");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingLabels = new Set(labels.map((l: any) => l.name.toLowerCase()));
  } catch {
    existingLabels = new Set();
  }

  // Create labels
  for (const label of DEFAULT_LABELS) {
    if (existingLabels.has(label.name.toLowerCase())) continue;
    try {
      await githubApi(owner, repo, token, "/labels", {
        method: "POST",
        body: JSON.stringify({ name: label.name, color: label.color, description: label.description }),
      });
      result.labelsCreated++;
    } catch (e) {
      result.errors.push(`Label "${label.name}": ${(e as Error).message}`);
    }
  }

  // Fetch existing milestones to avoid duplicates
  let existingMilestones: Set<string>;
  try {
    const milestones = await githubApi(owner, repo, token, "/milestones?state=all");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existingMilestones = new Set(milestones.map((m: any) => m.title.toLowerCase()));
  } catch {
    existingMilestones = new Set();
  }

  // Create milestones
  for (const ms of DEFAULT_MILESTONES) {
    if (existingMilestones.has(ms.title.toLowerCase())) continue;
    try {
      await githubApi(owner, repo, token, "/milestones", {
        method: "POST",
        body: JSON.stringify({ title: ms.title, description: ms.description }),
      });
      result.milestonesCreated++;
    } catch (e) {
      result.errors.push(`Milestone "${ms.title}": ${(e as Error).message}`);
    }
  }

  return result;
}

// ── Main scaffold entry point ─────────────────────────────────────

/**
 * Scaffold default project structure in the active provider.
 * Reads credentials from the stored provider config directly.
 */
export async function scaffoldProject(): Promise<ScaffoldResult> {
  const activeName = getActiveProviderName();
  if (!activeName) {
    return { labelsCreated: 0, milestonesCreated: 0, errors: ["No active provider connected"] };
  }

  const configs = listProviderConfigs();
  const config = configs.find((c) => c.name === activeName);
  if (!config) {
    return { labelsCreated: 0, milestonesCreated: 0, errors: ["Provider config not found"] };
  }

  if (config.type === "github") {
    const [owner, repo] = config.scope.split("/");
    if (!owner || !repo || !config.credentials.token) {
      return { labelsCreated: 0, milestonesCreated: 0, errors: ["Invalid GitHub config"] };
    }
    return scaffoldGitHub(owner, repo, config.credentials.token);
  }

  // For Linear and Jira, we note that scaffolding is limited
  return {
    labelsCreated: 0,
    milestonesCreated: 0,
    errors: [
      `Basic scaffolding for ${config.type} — labels and milestones should be configured in the ${config.type === "linear" ? "Linear" : "Jira"} UI directly`,
    ],
  };
}
