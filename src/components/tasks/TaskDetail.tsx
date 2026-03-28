"use client";

import { useState, useCallback } from "react";
import type { FaceTask } from "@/lib/tasks/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";

const CATEGORY_META: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  read: { label: "Context", color: "text-sky-400", bgColor: "bg-sky-950/30 border-sky-900/20" },
  write: { label: "Changed", color: "text-amber-400", bgColor: "bg-amber-950/30 border-amber-900/20" },
  execute: { label: "Verified", color: "text-emerald-400", bgColor: "bg-emerald-950/30 border-emerald-900/20" },
  search: { label: "Explored", color: "text-violet-400", bgColor: "bg-violet-950/30 border-violet-900/20" },
  plan: { label: "Planned", color: "text-blue-400", bgColor: "bg-blue-950/30 border-blue-900/20" },
  other: { label: "Other", color: "text-zinc-400", bgColor: "bg-zinc-800/30 border-zinc-700/20" },
};

export function TaskDetail({ task, onRestart }: { task: FaceTask; onRestart?: (taskId: string) => void }) {
  const [showRawSteps, setShowRawSteps] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const activities = task.activities ?? [];
  const isRestartable = task.status === "failed" || task.status === "cancelled";

  const handleRestart = useCallback(async () => {
    if (!onRestart || restarting) return;
    setRestarting(true);
    try {
      onRestart(task.id);
    } finally {
      setRestarting(false);
    }
  }, [onRestart, restarting, task.id]);

  const changes = activities.filter((a) => a.category === "write");
  const verifications = activities.filter((a) => a.category === "execute");
  const context = activities.filter(
    (a) => a.category === "read" || a.category === "search"
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 md:p-5 space-y-4 md:space-y-5">
      {/* Header: status + timing */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs text-zinc-500">
          <span className="font-mono">{task.agent}</span>
          <span><RelativeTime date={task.createdAt} /></span>
          {task.steps.length > 0 && (
            <span>{task.steps.length} operations</span>
          )}
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* Title card — shows the AI-summarized goal */}
      <div className="rounded-xl bg-gradient-to-br from-blue-950/50 to-indigo-950/40 p-4 md:p-5 border border-blue-900/30">
        <p className="text-sm md:text-base text-zinc-100 leading-relaxed font-medium">
          {task.title === "New task" ? (
            <span className="text-zinc-400 animate-pulse">Summarizing...</span>
          ) : (
            task.title
          )}
        </p>
      </div>

      {/* FAILED — restart option */}
      {isRestartable && onRestart && (
        <div className="rounded-xl bg-gradient-to-br from-red-950/40 to-rose-950/30 p-4 md:p-5 border border-red-900/30">
          <p className="text-xs text-red-400 mb-2 font-semibold uppercase tracking-wider">
            Task {task.status}
          </p>
          {task.result && (
            <p className="text-sm text-zinc-400 mb-3 line-clamp-3">{task.result}</p>
          )}
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors font-medium"
          >
            {restarting ? "Restarting..." : "Restart Task"}
          </button>
        </div>
      )}

      {/* OUTCOME — concise bullet summary */}
      {task.status === "completed" && (
        <div className="rounded-xl bg-gradient-to-br from-emerald-950/40 to-green-950/30 p-4 md:p-5 border border-emerald-900/30">
          <p className="text-xs text-emerald-400 mb-2 font-semibold uppercase tracking-wider">
            What was done
          </p>
          <ul className="space-y-1.5">
            {summarizeToBullets(task.result, changes, verifications).map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-200">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">&#x2022;</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* IN PROGRESS — what's happening now */}
      {task.status === "running" && (
        <>
          {/* Current progress */}
          {(changes.length > 0 || verifications.length > 0) && (
            <div>
              <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-wider">
                Progress so far
              </p>
              <div className="space-y-2">
                {changes.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
                {verifications.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
              </div>
            </div>
          )}

          {/* What's being looked at */}
          {context.length > 0 && (
            <CollapsibleSection title="Context being reviewed" defaultOpen={changes.length === 0}>
              {context.map((a) => (
                <ActivityRow key={a.id} activity={a} compact />
              ))}
            </CollapsibleSection>
          )}
        </>
      )}

      {/* COMPLETED — show how the work was done (collapsed) */}
      {task.status === "completed" && activities.length > 0 && (
        <CollapsibleSection title="How it was done" defaultOpen={false}>
          {activities.map((a) => (
            <ActivityRow key={a.id} activity={a} compact />
          ))}
        </CollapsibleSection>
      )}

      {/* Raw steps — debug only */}
      {task.steps.length > 0 && (
        <div className="pt-2 border-t border-zinc-800">
          <button
            onClick={() => setShowRawSteps(!showRawSteps)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showRawSteps ? "Hide" : "Show"} raw operations ({task.steps.length})
          </button>
          {showRawSteps && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
              {task.steps.map((step, i) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-600 font-mono"
                >
                  <span className="text-zinc-700 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-zinc-500 flex-shrink-0 w-12 truncate">{step.tool}</span>
                  <StepDescription step={step} workingDirectory={task.workingDirectory} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  activity,
  compact,
}: {
  activity: { label: string; category: string; filesInvolved: string[]; stepCount: number };
  compact?: boolean;
}) {
  const meta = CATEGORY_META[activity.category] ?? CATEGORY_META.other;

  return (
    <div className={`rounded-lg border px-3 py-2 ${meta.bgColor}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm ${compact ? "text-zinc-400" : "text-zinc-200"}`}>
          {activity.label}
        </span>
        <span className={`text-xs font-medium flex-shrink-0 ${meta.color}`}>
          {meta.label}
        </span>
      </div>
      {!compact && activity.filesInvolved.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {activity.filesInvolved.map((f) => (
            <span key={f} className="rounded bg-black/30 px-1.5 py-0.5 text-xs font-mono text-zinc-500">
              {shortenPath(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 mb-2 group"
      >
        <svg
          className={`h-3 w-3 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 3l5 5-5 5V3z" />
        </svg>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-400 transition-colors">
          {title}
        </h4>
      </button>
      {open && <div className="space-y-2 ml-5">{children}</div>}
    </div>
  );
}

/**
 * Extracts concise bullet points from the agent result text and activities.
 * Prefers existing bullets from the text; falls back to activity labels.
 * Caps at 6 bullets to keep it scannable.
 */
function summarizeToBullets(
  result: string | null,
  changes: { label: string; filesInvolved: string[] }[],
  verifications: { label: string }[]
): string[] {
  const bullets: string[] = [];

  // Extract existing bullets or short sentences from result text
  if (result) {
    const lines = result.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Already a bullet
      if (/^[-*•]\s+/.test(line)) {
        bullets.push(line.replace(/^[-*•]\s+/, ""));
      }
      // Numbered item
      else if (/^\d+[.)]\s+/.test(line)) {
        bullets.push(line.replace(/^\d+[.)]\s+/, ""));
      }
    }

    // If no bullets found, take first sentence of each paragraph
    if (bullets.length === 0) {
      const paragraphs = result.split(/\n\n+/).filter(Boolean);
      for (const para of paragraphs) {
        const firstSentence = para.trim().split(/[.!?]\s/)[0];
        if (firstSentence && firstSentence.length < 150) {
          bullets.push(firstSentence.replace(/[.!?]$/, ""));
        }
      }
    }
  }

  // If still empty, fall back to activity labels
  if (bullets.length === 0) {
    for (const c of changes) {
      const files = c.filesInvolved.length > 0
        ? ` (${c.filesInvolved.map(shortenPath).join(", ")})`
        : "";
      bullets.push(c.label + files);
    }
    for (const v of verifications) {
      bullets.push(v.label);
    }
  }

  // Fallback
  if (bullets.length === 0) {
    return ["Task completed successfully"];
  }

  // Cap at 6 bullets
  return bullets.slice(0, 6);
}

function shortenPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 2) return filePath;
  return parts.slice(-2).join("/");
}

/** Tools that create or modify files */
const FILE_MUTATION_TOOLS = new Set(["Write", "Edit", "Create", "NotebookEdit"]);

/** Tools that involve files (read or write) */
const FILE_TOOLS = new Set([...FILE_MUTATION_TOOLS, "Read"]);

/**
 * Extract a file path from a step description.
 * Returns both the original text matched and the resolved absolute path.
 */
function extractFilePath(
  description: string,
  tool: string,
  workingDirectory: string
): { original: string; absolute: string } | null {
  if (!FILE_TOOLS.has(tool)) return null;

  // Match absolute paths in the description
  const absMatch = description.match(/(\/[\w./-]+\.\w+)/);
  if (absMatch) return { original: absMatch[1], absolute: absMatch[1] };

  // Match relative paths after tool-like prefixes: "Read src/foo.ts", "Create app/bar.tsx"
  const relMatch = description.match(/(?:Read|Write|Edit|Create)\s+([\w./-]+\.\w+)/);
  if (relMatch && workingDirectory) {
    return { original: relMatch[1], absolute: `${workingDirectory}/${relMatch[1]}` };
  }

  return null;
}

function StepDescription({
  step,
  workingDirectory,
}: {
  step: { tool: string; description: string };
  workingDirectory: string;
}) {
  const match = extractFilePath(step.description, step.tool, workingDirectory);
  const isMutation = FILE_MUTATION_TOOLS.has(step.tool);

  if (!match) {
    return <span className="truncate">{step.description}</span>;
  }

  const parts = step.description.split(match.original);

  return (
    <span className="truncate">
      {parts[0]}
      <a
        href={`vscode://file${match.absolute}`}
        className={`underline decoration-dotted underline-offset-2 ${
          isMutation
            ? "text-amber-500 hover:text-amber-400"
            : "text-zinc-500 hover:text-zinc-400"
        } transition-colors`}
        title={match.absolute}
      >
        {match.absolute}
      </a>
      {parts.slice(1).join(match.original)}
    </span>
  );
}
