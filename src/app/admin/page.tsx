import { getAllRoles } from "@/lib/roles/registry";
import { AdminPageClient } from "./AdminPageClient";

export default function AdminPage() {
  const roles = getAllRoles().map((r) => ({
    slug: r.slug,
    label: r.label,
    description: r.description,
    routePath: r.routePath,
    iconPath: r.iconPath,
  }));

  return <AdminPageClient roles={roles} />;
}
