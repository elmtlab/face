"use client";

const ROLE_COLORS: Record<string, string> = {
  dev: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  pm: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  test: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  design: "bg-pink-600/20 text-pink-400 border-pink-600/30",
  hr: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  finance: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30",
  sales: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  stakeholder: "bg-zinc-600/20 text-zinc-400 border-zinc-600/30",
};

const DEFAULT_COLOR = "bg-zinc-600/20 text-zinc-400 border-zinc-600/30";

export function RoleTagBadge({
  role,
  variant = "default",
}: {
  role: string;
  /** "creator" shows a small marker to distinguish creator vs assigned */
  variant?: "default" | "creator";
}) {
  const color = ROLE_COLORS[role] ?? DEFAULT_COLOR;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${color}`}
      title={variant === "creator" ? `Created by ${role}` : `Assigned to ${role}`}
    >
      {variant === "creator" && (
        <span className="text-[8px] opacity-60">by</span>
      )}
      {role}
    </span>
  );
}
