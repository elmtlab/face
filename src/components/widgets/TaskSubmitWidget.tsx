"use client";

import { useState } from "react";
import { TaskSubmit } from "@/components/tasks/TaskSubmit";

interface TaskSubmitWidgetProps {
  promptTemplates?: string[];
}

export function TaskSubmitWidget({ promptTemplates }: TaskSubmitWidgetProps) {
  const [initialPrompt, setInitialPrompt] = useState("");
  const [submitKey, setSubmitKey] = useState(0);

  function handleTemplateClick(template: string) {
    setInitialPrompt(template);
    setSubmitKey((k) => k + 1);
  }

  return (
    <div>
      <TaskSubmit key={submitKey} initialPrompt={initialPrompt} />
      {promptTemplates && promptTemplates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {promptTemplates.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleTemplateClick(t)}
              className="rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-200"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
