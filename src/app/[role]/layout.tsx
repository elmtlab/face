import type { Metadata } from "next";
import { getRoleDefinition } from "@/lib/roles/registry";
import { UserProvider } from "@/components/user/UserContext";
import { ProjectProvider } from "@/lib/projects/ProjectContext";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>;
}): Promise<Metadata> {
  const { role: slug } = await params;
  const role = getRoleDefinition(slug);
  if (!role) return { title: "Role not found - FACE" };
  return {
    title: `${role.label} - FACE`,
    description: role.description,
  };
}

export default function RoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ProjectProvider>
        <UserProvider>{children}</UserProvider>
      </ProjectProvider>
    </div>
  );
}
