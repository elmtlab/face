import { getActiveProvider } from "./manager";
import type { Issue, Label, User, IssuePriority } from "./types";

export interface TriageSuggestion {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  suggestedLabels: string[];
  suggestedPriority: IssuePriority;
  suggestedAssignee: string | null;
  reason: string;
}

/**
 * Analyze untriaged issues and suggest labels, priority, and assignees.
 *
 * Untriaged = no labels and priority is "none".
 */
export async function analyzeUntriagedIssues(): Promise<{
  suggestions: TriageSuggestion[];
  availableLabels: Label[];
  availableMembers: User[];
}> {
  const provider = await getActiveProvider();
  if (!provider) throw new Error("No project provider configured");

  const [issues, labels, members] = await Promise.all([
    provider.listIssues(),
    provider.listLabels(),
    provider.listMembers(),
  ]);

  // Filter to untriaged issues (no labels, no priority)
  const untriaged = issues.filter(
    (i) => i.labels.length === 0 && i.priority === "none" && i.status !== "done" && i.status !== "cancelled"
  );

  const suggestions = untriaged.map((issue) => analyzeIssue(issue, labels, members));

  return { suggestions, availableLabels: labels, availableMembers: members };
}

function analyzeIssue(issue: Issue, labels: Label[], _members: User[]): TriageSuggestion {
  const text = `${issue.title} ${issue.body}`.toLowerCase();
  const suggestedLabels: string[] = [];
  let suggestedPriority: IssuePriority = "medium";
  let reason = "";

  // Simple keyword-based label suggestions
  const labelKeywords: Record<string, string[]> = {
    bug: ["bug", "fix", "error", "crash", "broken", "fail", "issue", "problem"],
    enhancement: ["feature", "add", "improve", "enhance", "new", "implement", "support"],
    documentation: ["doc", "readme", "guide", "tutorial", "wiki", "documentation"],
    "good first issue": ["simple", "easy", "beginner", "starter", "trivial"],
  };

  for (const [labelName, keywords] of Object.entries(labelKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      // Only suggest labels that exist in the repo
      if (labels.find((l) => l.name.toLowerCase() === labelName)) {
        suggestedLabels.push(labelName);
      }
    }
  }

  // Priority heuristics
  if (text.includes("urgent") || text.includes("critical") || text.includes("security") || text.includes("crash")) {
    suggestedPriority = "urgent";
    reason = "Contains urgency keywords";
  } else if (text.includes("important") || text.includes("block") || text.includes("break")) {
    suggestedPriority = "high";
    reason = "Contains high-priority keywords";
  } else if (text.includes("minor") || text.includes("cosmetic") || text.includes("typo") || text.includes("nice to have")) {
    suggestedPriority = "low";
    reason = "Contains low-priority keywords";
  } else {
    reason = "Default priority";
  }

  if (suggestedLabels.length > 0) {
    reason += `; matched labels: ${suggestedLabels.join(", ")}`;
  }

  return {
    issueId: issue.id,
    issueNumber: issue.number,
    issueTitle: issue.title,
    suggestedLabels,
    suggestedPriority,
    suggestedAssignee: null,
    reason,
  };
}

/**
 * Apply approved triage suggestions to issues.
 */
export async function applyTriageSuggestions(
  suggestions: TriageSuggestion[]
): Promise<{ applied: number; errors: string[] }> {
  const provider = await getActiveProvider();
  if (!provider) throw new Error("No project provider configured");

  let applied = 0;
  const errors: string[] = [];

  for (const s of suggestions) {
    try {
      await provider.updateIssue(s.issueId, {
        labels: s.suggestedLabels.length > 0 ? s.suggestedLabels : undefined,
        priority: s.suggestedPriority,
        assignees: s.suggestedAssignee ? [s.suggestedAssignee] : undefined,
      });
      applied++;
    } catch (err) {
      errors.push(`#${s.issueNumber}: ${(err as Error).message}`);
    }
  }

  return { applied, errors };
}
