import type { Metadata } from "next";
import { PMSyncFailureBanner } from "@/components/project/PMSyncFailureBanner";

export const metadata: Metadata = {
  title: "Admin - FACE",
  description: "Administration dashboard with role navigation and security audit",
};

export default function AdminLayout({
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
