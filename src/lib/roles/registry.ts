import type { RoleDefinition } from "./types";

/**
 * Data-driven role registry.
 *
 * All role definitions live here. Adding a new role to this registry
 * automatically generates its route and dashboard view — no new
 * hardcoded pages required.
 */

const roles = new Map<string, RoleDefinition>();

// ── Built-in role definitions ─────────────────────────────────────

const BUILT_IN_ROLES: RoleDefinition[] = [
  {
    slug: "dev",
    label: "Developer",
    iconPath: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
    description: "Code, review PRs, manage technical tasks with AI assistance.",
    routePath: "/dev",
    userRole: "engineer",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: true,
      canConfigure: true,
      canViewProject: true,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Assists with code generation, PR reviews, debugging, and technical task management.",
      promptTemplates: [
        "Review the open PRs and summarize what needs attention",
        "Triage the backlog and suggest priorities",
        "Explain the architecture of {component}",
      ],
      relevantEvents: [
        "stale_pr",
        "task_completed",
        "task_failed",
        "review_requested",
      ],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "task-list", title: "Recent Tasks", size: "large" },
      { type: "issue-board", title: "Board", size: "large" },
      { type: "agent-status", title: "Agent Status", size: "small" },
    ],
    sidebarLinks: [
      { key: "requirements", label: "Requirements", icon: "◉", widgets: [{ type: "requirements-list", title: "Requirements", size: "full" }] },
      { key: "new-requirement", label: "New Requirement", icon: "✦", widgets: [{ type: "requirement-workflow", title: "New Requirement", size: "full" }] },
      { key: "issues", label: "Issues", icon: "☰", widgets: [{ type: "issue-list", title: "Issues", size: "full" }] },
      { key: "tasks", label: "Tasks", icon: "▤", widgets: [{ type: "task-list", title: "Tasks", size: "full" }] },
      { key: "board", label: "Board", icon: "▦", widgets: [{ type: "issue-board", title: "Board", size: "full" }] },
      { key: "milestones", label: "Milestones", icon: "◎", widgets: [{ type: "milestone-summary", title: "Milestones", size: "full" }] },
    ],
  },
  {
    slug: "pm",
    label: "Product Manager",
    iconPath:
      "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7",
    description:
      "Track milestones, manage requirements, and get AI-driven project insights.",
    routePath: "/pm",
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
        "Helps with requirement writing, milestone tracking, backlog prioritization, and stakeholder updates.",
      promptTemplates: [
        "Draft a requirements document for {feature}",
        "Summarize milestone progress for stakeholders",
        "What are the blockers for the current sprint?",
      ],
      relevantEvents: [
        "milestone_at_risk",
        "unblocked_task",
        "issue_created",
        "issue_updated",
      ],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "milestone-summary", title: "Milestones", size: "medium" },
      { type: "requirements-list", title: "Requirements", size: "medium" },
      { type: "task-list", title: "Recent Tasks", size: "large" },
    ],
    sidebarLinks: [
      { key: "requirements", label: "Requirements", icon: "◉", widgets: [{ type: "requirements-list", title: "Requirements", size: "full" }] },
      { key: "new-requirement", label: "New Requirement", icon: "✦", widgets: [{ type: "requirement-workflow", title: "New Requirement", size: "full" }] },
      { key: "milestones", label: "Milestones", icon: "◎", widgets: [{ type: "milestone-summary", title: "Milestones", size: "full" }] },
      { key: "roadmap", label: "Roadmap", icon: "▸", widgets: [{ type: "task-list", title: "Roadmap", size: "full" }] },
      { key: "board", label: "Board", icon: "▦", widgets: [{ type: "issue-board", title: "Board", size: "full" }] },
    ],
  },
  {
    slug: "test",
    label: "QA / Tester",
    iconPath:
      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    description:
      "Track test coverage, manage bug reports, and coordinate QA workflows.",
    routePath: "/test",
    userRole: "project_manager",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: true,
      canConfigure: false,
      canViewProject: true,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Assists with test planning, bug triage, regression analysis, and test coverage reporting.",
      promptTemplates: [
        "List all open bugs sorted by severity",
        "Generate a test plan for {feature}",
        "What changed since last release that needs regression testing?",
      ],
      relevantEvents: [
        "issue_created",
        "issue_updated",
        "task_completed",
      ],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "issue-list", title: "Bug Tracker", size: "large", props: { filterLabel: "bug" } },
      { type: "task-list", title: "Test Tasks", size: "medium" },
      { type: "triage-summary", title: "Triage", size: "medium" },
    ],
    sidebarLinks: [
      { key: "issues", label: "Issues", icon: "☰", widgets: [{ type: "issue-list", title: "Issues", size: "full" }] },
      { key: "bugs", label: "Bug Tracker", icon: "⚑", widgets: [{ type: "issue-list", title: "Bug Tracker", size: "full", props: { filterLabel: "bug" } }] },
      { key: "triage", label: "Triage", icon: "◆", widgets: [{ type: "triage-summary", title: "Triage", size: "full" }] },
      { key: "tasks", label: "Test Tasks", icon: "▤", widgets: [{ type: "task-list", title: "Test Tasks", size: "full" }] },
      { key: "board", label: "Board", icon: "▦", widgets: [{ type: "issue-board", title: "Board", size: "full" }] },
    ],
  },
  {
    slug: "design",
    label: "Designer",
    iconPath:
      "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    description:
      "Manage design tasks, review handoffs, and collaborate on UI feedback.",
    routePath: "/design",
    userRole: "designer",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: true,
      canConfigure: false,
      canViewProject: true,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Helps with design task tracking, feedback collection, handoff documentation, and component inventory.",
      promptTemplates: [
        "Summarize pending design review requests",
        "List components that need design updates",
        "Draft a design handoff document for {feature}",
      ],
      relevantEvents: ["issue_created", "issue_updated", "review_requested"],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "task-list", title: "Design Tasks", size: "large" },
      { type: "issue-list", title: "Design Issues", size: "medium", props: { filterLabel: "design" } },
    ],
    sidebarLinks: [
      { key: "issues", label: "Design Issues", icon: "☰", widgets: [{ type: "issue-list", title: "Design Issues", size: "full", props: { filterLabel: "design" } }] },
      { key: "tasks", label: "Design Tasks", icon: "▤", widgets: [{ type: "task-list", title: "Design Tasks", size: "full" }] },
      { key: "board", label: "Board", icon: "▦", widgets: [{ type: "issue-board", title: "Board", size: "full" }] },
    ],
  },
  {
    slug: "hr",
    label: "Human Resources",
    iconPath:
      "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    description:
      "Manage people-related tasks and get AI help with HR workflows.",
    routePath: "/hr",
    userRole: "hr",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: false,
      canConfigure: false,
      canViewProject: false,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Assists with HR task management, onboarding checklists, policy drafting, and team coordination.",
      promptTemplates: [
        "Draft an onboarding checklist for a new {role}",
        "Summarize team capacity for next sprint",
        "Help me write a job description for {position}",
      ],
      relevantEvents: ["task_completed", "task_failed"],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "task-list", title: "HR Tasks", size: "large" },
    ],
    sidebarLinks: [
      { key: "tasks", label: "HR Tasks", icon: "▤", widgets: [{ type: "task-list", title: "HR Tasks", size: "full" }] },
    ],
  },
  {
    slug: "finance",
    label: "Finance / Accountant",
    iconPath:
      "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
    description:
      "Track financial tasks and use AI for reporting and analysis.",
    routePath: "/finance",
    userRole: "accountant",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: false,
      canConfigure: false,
      canViewProject: false,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Assists with financial report generation, budget tracking tasks, and data analysis.",
      promptTemplates: [
        "Generate a summary of this month's project expenses",
        "Help me draft a budget proposal for {project}",
        "Analyze cost trends from the last quarter",
      ],
      relevantEvents: ["task_completed", "task_failed"],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "task-list", title: "Finance Tasks", size: "large" },
    ],
    sidebarLinks: [
      { key: "tasks", label: "Finance Tasks", icon: "▤", widgets: [{ type: "task-list", title: "Finance Tasks", size: "full" }] },
    ],
  },
  {
    slug: "sales",
    label: "Sales",
    iconPath:
      "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    description:
      "Manage sales pipeline tasks and get AI-driven insights.",
    routePath: "/sales",
    userRole: "sales",
    permissions: {
      canSubmitTasks: true,
      canEditIssues: false,
      canConfigure: false,
      canViewProject: false,
      readOnly: false,
    },
    aiBehavior: {
      description:
        "Assists with sales task management, pipeline analysis, and customer outreach drafting.",
      promptTemplates: [
        "Summarize this week's pipeline activity",
        "Draft a follow-up email for {client}",
        "What deals are at risk of slipping?",
      ],
      relevantEvents: ["task_completed", "task_failed"],
    },
    widgets: [
      { type: "task-submit", title: "Ask AI", size: "full" },
      { type: "task-list", title: "Sales Tasks", size: "large" },
    ],
    sidebarLinks: [
      { key: "tasks", label: "Sales Tasks", icon: "▤", widgets: [{ type: "task-list", title: "Sales Tasks", size: "full" }] },
    ],
  },
  {
    slug: "stakeholder",
    label: "Stakeholder",
    iconPath:
      "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
    description:
      "View project progress, milestones, and status — read-only access.",
    routePath: "/stakeholder",
    userRole: "other",
    permissions: {
      canSubmitTasks: false,
      canEditIssues: false,
      canConfigure: false,
      canViewProject: true,
      readOnly: true,
    },
    aiBehavior: {
      description:
        "Provides read-only project status summaries, milestone progress, and high-level reporting.",
      promptTemplates: [],
      relevantEvents: ["milestone_at_risk"],
    },
    widgets: [
      { type: "milestone-summary", title: "Milestone Progress", size: "full" },
      { type: "issue-board", title: "Project Board", size: "large", props: { readOnly: true } },
      { type: "task-list", title: "Recent Activity", size: "medium", props: { readOnly: true } },
    ],
    sidebarLinks: [
      { key: "milestones", label: "Milestone Progress", icon: "◎", widgets: [{ type: "milestone-summary", title: "Milestone Progress", size: "full" }] },
      { key: "board", label: "Project Board", icon: "▦", widgets: [{ type: "issue-board", title: "Project Board", size: "full", props: { readOnly: true } }] },
      { key: "activity", label: "Recent Activity", icon: "▤", widgets: [{ type: "task-list", title: "Recent Activity", size: "full", props: { readOnly: true } }] },
    ],
  },
];

// ── Registry API ──────────────────────────────────────────────────

function initRegistry() {
  if (roles.size === 0) {
    for (const role of BUILT_IN_ROLES) {
      roles.set(role.slug, role);
    }
  }
}

export function getRoleDefinition(slug: string): RoleDefinition | undefined {
  initRegistry();
  return roles.get(slug);
}

export function getAllRoles(): RoleDefinition[] {
  initRegistry();
  return [...roles.values()];
}

export function getRoleSlugs(): string[] {
  initRegistry();
  return [...roles.keys()];
}

/**
 * Register a custom role at runtime. This is the extension point
 * for adding roles from configuration without code changes.
 */
export function registerRole(definition: RoleDefinition): void {
  roles.set(definition.slug, definition);
}
