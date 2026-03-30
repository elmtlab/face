import type { Metadata } from "next";
import { UserProvider } from "@/components/user/UserContext";
import { ProjectProvider } from "@/lib/projects/ProjectContext";

export const metadata: Metadata = {
  title: "My Dashboard - FACE",
  description: "Your personalized dashboard sorted by usage frequency.",
};

export default function MyLayout({
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
