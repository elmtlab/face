/**
 * Data-driven role registry types.
 *
 * Each role definition maps a role slug → route path + AI behavior profile +
 * UI widget configuration + permissions. Adding a new role generates its
 * route and view from configuration, not hardcoded pages.
 */

// ── Widget types (composable dashboard building blocks) ───────────

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetConfig {
  /** Unique widget type identifier */
  type: string;
  /** Display title */
  title: string;
  /** Grid size hint for layout */
  size: WidgetSize;
  /** Widget-specific props */
  props?: Record<string, unknown>;
}

// ── Permission model ──────────────────────────────────────────────

export interface RolePermissions {
  /** Can submit tasks to AI agents */
  canSubmitTasks: boolean;
  /** Can create/edit issues in project management */
  canEditIssues: boolean;
  /** Can configure providers and settings */
  canConfigure: boolean;
  /** Can view project board and issues */
  canViewProject: boolean;
  /** Read-only mode (overrides write permissions) */
  readOnly: boolean;
}

// ── AI behavior profile ───────────────────────────────────────────

export interface AIBehaviorProfile {
  /** System-level description of what the AI does for this role */
  description: string;
  /** Suggested prompt templates for this role */
  promptTemplates: string[];
  /** Which notification event types are relevant to this role */
  relevantEvents: string[];
}

// ── Role definition ───────────────────────────────────────────────

export interface RoleDefinition {
  /** Unique slug used as route path (e.g. "test", "hr", "design") */
  slug: string;
  /** Human-readable label */
  label: string;
  /** SVG path data for the role icon */
  iconPath: string;
  /** Brief description shown on the role page */
  description: string;
  /** Route path — derived from slug as /{slug} */
  routePath: string;
  /** Permissions for this role */
  permissions: RolePermissions;
  /** AI behavior configuration */
  aiBehavior: AIBehaviorProfile;
  /** Ordered list of widgets that compose this role's dashboard */
  widgets: WidgetConfig[];
  /** Maps to a UserRole value for backward compat with adaptive system */
  userRole: string;
}
