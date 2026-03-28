import { notFound } from "next/navigation";
import { getRoleDefinition, getRoleSlugs } from "@/lib/roles/registry";
import { RoleDashboard } from "@/components/widgets/RoleDashboard";

/**
 * Pre-build pages for all built-in roles at compile time.
 * Runtime-registered roles are still supported via dynamicParams.
 */
export function generateStaticParams() {
  return getRoleSlugs().map((slug) => ({ role: slug }));
}

/** Allow runtime-registered roles to resolve without a rebuild. */
export const dynamicParams = true;

interface RolePageProps {
  params: Promise<{ role: string }>;
}

export default async function RolePage({ params }: RolePageProps) {
  const { role: slug } = await params;
  const roleDef = getRoleDefinition(slug);

  if (!roleDef) {
    notFound();
  }

  return <RoleDashboard role={roleDef} />;
}
