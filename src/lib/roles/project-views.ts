import type { RoleDefinition } from "./types";

/**
 * Two complementary role configurations for the /project page.
 *
 * Product Manager — requirements, prioritization, roadmap.
 * Project Manager — execution tracking, milestones, triage.
 *
 * These are NOT registered in the main role registry (they don't need
 * their own /[role] routes). They're consumed exclusively by the
 * ProjectDashboard component on the /project page.
 */

export type ProjectViewKey = "product" | "project";

export const PROJECT_VIEWS: Record<ProjectViewKey, RoleDefinition> = {
  product: {
    slug: "product-manager",
    label: "Product Manager",
    iconPath:
      "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7",
    description:
      "Requirements, prioritization, and roadmap — shape what gets built.",
    routePath: "/project",
    userRole: "product_manager",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: true,
      canConfigure: true,
      canViewProject: true,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Helps with requirement writing, backlog prioritization, roadmap planning, and stakeholder updates.",
      promptTemplates: [
        "Draft a requirements document for {feature}",
        "Prioritize the backlog based on impact and effort",
        "Summarize roadmap progress for stakeholders",
      ],
      relevantEvents: [
        "milestone_at_risk",
        "issue_created",
        "issue_updated",
        "unblocked_task",
      ],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "requirements-list", title: "Requirements", size: "large" },
      { type: "milestone-summary", title: "Milestones", size: "medium" },
      { type: "issue-board", title: "Board", size: "medium" },
    ],
    sidebarLinks: [
      {
        key: "requirements",
        label: "Requirements",
        icon: "◉",
        widgets: [
          { type: "requirements-list", title: "Requirements", size: "full" },
        ],
      },
      {
        key: "roadmap",
        label: "Roadmap",
        icon: "▸",
        widgets: [{ type: "task-list", title: "Roadmap", size: "full" }],
      },
      {
        key: "milestones",
        label: "Milestones",
        icon: "◎",
        widgets: [
          { type: "milestone-summary", title: "Milestones", size: "full" },
        ],
      },
      {
        key: "board",
        label: "Board",
        icon: "▦",
        widgets: [{ type: "issue-board", title: "Board", size: "full" }],
      },
      {
        key: "projects",
        label: "Projects",
        icon: "▣",
        widgets: [{ type: "project-manager", title: "Projects", size: "full" }],
      },
    ],
  },

  project: {
    slug: "project-manager",
    label: "Project Manager",
    iconPath:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    description:
      "Execution tracking, milestones, and triage — keep the team on track.",
    routePath: "/project",
    userRole: "project_manager",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: true,
      canConfigure: true,
      canViewProject: true,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Assists with sprint tracking, milestone progress, issue triage, and team coordination.",
      promptTemplates: [
        "What are the blockers for the current sprint?",
        "Summarize milestone progress and at-risk items",
        "Triage the unassigned issues by priority",
      ],
      relevantEvents: [
        "milestone_at_risk",
        "task_completed",
        "task_failed",
        "issue_created",
        "issue_updated",
      ],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "milestone-summary", title: "Milestones", size: "medium" },
      { type: "triage-summary", title: "Triage", size: "medium" },
      { type: "issue-board", title: "Board", size: "large" },
      { type: "task-list", title: "Recent Tasks", size: "medium" },
    ],
    sidebarLinks: [
      {
        key: "board",
        label: "Board",
        icon: "▦",
        widgets: [{ type: "issue-board", title: "Board", size: "full" }],
      },
      {
        key: "issues",
        label: "Issues",
        icon: "☰",
        widgets: [{ type: "issue-list", title: "Issues", size: "full" }],
      },
      {
        key: "milestones",
        label: "Milestones",
        icon: "◎",
        widgets: [
          { type: "milestone-summary", title: "Milestones", size: "full" },
        ],
      },
      {
        key: "triage",
        label: "Triage",
        icon: "◆",
        widgets: [
          { type: "triage-summary", title: "Triage", size: "full" },
        ],
      },
      {
        key: "tasks",
        label: "Tasks",
        icon: "▤",
        widgets: [{ type: "task-list", title: "Tasks", size: "full" }],
      },
      {
        key: "projects",
        label: "Projects",
        icon: "▣",
        widgets: [{ type: "project-manager", title: "Projects", size: "full" }],
      },
    ],
  },
};

export const PROJECT_VIEW_KEYS = Object.keys(PROJECT_VIEWS) as ProjectViewKey[];

export function isProjectViewKey(value: string): value is ProjectViewKey {
  return value === "product" || value === "project";
}
