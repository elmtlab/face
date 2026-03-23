"use client";

type Status = string;

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  online: { bg: "bg-emerald-950", text: "text-emerald-400", dot: "bg-emerald-400" },
  offline: { bg: "bg-zinc-800", text: "text-zinc-400", dot: "bg-zinc-500" },
  degraded: { bg: "bg-amber-950", text: "text-amber-400", dot: "bg-amber-400" },
  unknown: { bg: "bg-zinc-800", text: "text-zinc-500", dot: "bg-zinc-500" },
  pending: { bg: "bg-zinc-800", text: "text-zinc-400", dot: "bg-zinc-400" },
  queued: { bg: "bg-zinc-800", text: "text-zinc-400", dot: "bg-zinc-400" },
  running: { bg: "bg-blue-950", text: "text-blue-400", dot: "bg-blue-400" },
  paused: { bg: "bg-amber-950", text: "text-amber-400", dot: "bg-amber-400" },
  completed: { bg: "bg-emerald-950", text: "text-emerald-400", dot: "bg-emerald-400" },
  failed: { bg: "bg-red-950", text: "text-red-400", dot: "bg-red-400" },
  cancelled: { bg: "bg-zinc-800", text: "text-zinc-500", dot: "bg-zinc-500" },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}
