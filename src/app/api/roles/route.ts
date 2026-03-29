import { NextResponse } from "next/server";
import { getAllRoles } from "@/lib/roles/registry";

export async function GET() {
  const roles = getAllRoles();
  return NextResponse.json({
    roles: roles.map((r) => ({
      slug: r.slug,
      label: r.label,
      description: r.description,
      routePath: r.routePath,
      userRole: r.userRole,
      readOnly: r.permissions.readOnly,
    })),
  });
}
