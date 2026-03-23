export const USER_ROLES = [
  "engineer",
  "product_manager",
  "project_manager",
  "hr",
  "accountant",
  "banker",
  "sales",
  "designer",
  "other",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  id: string;
  role: UserRole;
  displayName: string | null;
  onboardedAt: number;
  updatedAt: number;
  preferences: Record<string, unknown>;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  engineer: "Software Engineer",
  product_manager: "Product Manager",
  project_manager: "Project Manager",
  hr: "Human Resources",
  accountant: "Accountant",
  banker: "Banker",
  sales: "Sales",
  designer: "Designer",
  other: "Other",
};

// Features that each role typically uses heavily.
// Scores 0-1: 1 = always show, 0 = hide by default.
export const ROLE_FEATURE_DEFAULTS: Record<UserRole, Record<string, number>> = {
  engineer: {
    "task-submit": 1.0,
    "task-list": 1.0,
    "task-detail": 1.0,
    "agent-list": 0.9,
    "task-filter": 0.8,
    "health-banner": 0.7,
    "agent-setup": 0.6,
  },
  product_manager: {
    "task-list": 1.0,
    "task-detail": 1.0,
    "task-submit": 0.8,
    "task-filter": 0.9,
    "agent-list": 0.5,
    "health-banner": 0.4,
    "agent-setup": 0.3,
  },
  project_manager: {
    "task-list": 1.0,
    "task-filter": 1.0,
    "task-detail": 0.9,
    "task-submit": 0.7,
    "agent-list": 0.5,
    "health-banner": 0.4,
    "agent-setup": 0.3,
  },
  hr: {
    "task-submit": 0.9,
    "task-list": 0.8,
    "task-detail": 0.7,
    "task-filter": 0.5,
    "agent-list": 0.3,
    "health-banner": 0.2,
    "agent-setup": 0.2,
  },
  accountant: {
    "task-submit": 0.9,
    "task-list": 0.8,
    "task-detail": 0.7,
    "task-filter": 0.6,
    "agent-list": 0.3,
    "health-banner": 0.2,
    "agent-setup": 0.2,
  },
  banker: {
    "task-submit": 0.9,
    "task-list": 0.8,
    "task-detail": 0.7,
    "task-filter": 0.6,
    "agent-list": 0.3,
    "health-banner": 0.2,
    "agent-setup": 0.2,
  },
  sales: {
    "task-submit": 1.0,
    "task-list": 0.9,
    "task-detail": 0.7,
    "task-filter": 0.5,
    "agent-list": 0.3,
    "health-banner": 0.2,
    "agent-setup": 0.2,
  },
  designer: {
    "task-submit": 1.0,
    "task-list": 0.9,
    "task-detail": 0.8,
    "task-filter": 0.6,
    "agent-list": 0.5,
    "health-banner": 0.4,
    "agent-setup": 0.4,
  },
  other: {
    "task-submit": 0.8,
    "task-list": 0.8,
    "task-detail": 0.7,
    "task-filter": 0.6,
    "agent-list": 0.5,
    "health-banner": 0.5,
    "agent-setup": 0.5,
  },
};

export interface FeatureVisibility {
  featureId: string;
  score: number; // 0-1
  visible: boolean; // score >= threshold
  pinned: boolean; // score >= pin threshold (always prominent)
}

export interface AdaptiveLayout {
  features: Record<string, FeatureVisibility>;
  role: UserRole;
}
