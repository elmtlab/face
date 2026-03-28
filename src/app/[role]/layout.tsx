import { UserProvider } from "@/components/user/UserContext";

export default function RoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <UserProvider>{children}</UserProvider>
    </div>
  );
}
