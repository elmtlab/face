import { PMSyncFailureBanner } from "@/components/project/PMSyncFailureBanner";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <PMSyncFailureBanner />
      {children}
    </div>
  );
}
