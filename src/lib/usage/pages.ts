import { getAllRoles } from "@/lib/roles/registry";

/**
 * Describes a navigable page/feature in the application.
 * Used by the /my dashboard to display feature cards.
 */
export interface PageInfo {
  /** Route path (e.g. "/dev", "/dev?view=issues") */
  path: string;
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** SVG icon path data */
  iconPath: string;
}

/**
 * Build a list of all navigable pages from the role registry.
 * Includes each role's overview page and its sidebar views.
 */
export function getAllPages(): PageInfo[] {
  const pages: PageInfo[] = [];

  // Root page
  pages.push({
    path: "/",
    label: "Home",
    description: "Setup detection and adaptive shell",
    iconPath: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  });

  for (const role of getAllRoles()) {
    // Role overview
    pages.push({
      path: role.routePath,
      label: role.label,
      description: role.description,
      iconPath: role.iconPath,
    });

    // Sidebar views
    for (const link of role.sidebarLinks) {
      pages.push({
        path: `${role.routePath}?view=${link.key}`,
        label: `${role.label} — ${link.label}`,
        description: `${link.label} view in ${role.label} dashboard`,
        iconPath: role.iconPath,
      });
    }
  }

  return pages;
}
