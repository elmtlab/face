"use client";

import { TaskSubmit } from "@/components/tasks/TaskSubmit";

interface TaskSubmitWidgetProps {
  promptTemplates?: string[];
}

export function TaskSubmitWidget({ promptTemplates }: TaskSubmitWidgetProps) {
  return (
    <div>
      <TaskSubmit />
      {promptTemplates && promptTemplates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {promptTemplates.map((t, i) => (
            <span
              key={i}
              className="rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
