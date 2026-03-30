import { getRoleDefinition } from "./registry";
import type { RoleDefinition } from "./types";

/**
 * Re-exports the product-manager and project-manager role definitions
 * from the role registry for backward compatibility.
 *
 * These roles now live in the registry and are served at their own
 * dedicated routes (/product-manager and /project-manager) via the
 * dynamic [role] route.
 */

export type ProjectViewKey = "product" | "project";

export const PROJECT_VIEWS: Record<ProjectViewKey, RoleDefinition> = {
  get product() {
    return getRoleDefinition("product-manager")!;
  },
  get project() {
    return getRoleDefinition("project-manager")!;
  },
};

export const PROJECT_VIEW_KEYS: ProjectViewKey[] = ["product", "project"];

export function isProjectViewKey(value: string): value is ProjectViewKey {
  return value === "product" || value === "project";
}
