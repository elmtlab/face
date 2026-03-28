"use client";

import { TaskList } from "@/components/tasks/TaskList";
import { TaskSubmit } from "@/components/tasks/TaskSubmit";
import { AdaptiveFeature } from "@/components/shared/AdaptiveFeature";
import { useUser } from "@/components/user/UserContext";
import { ROLE_LABELS } from "@/lib/user/types";

export function AdaptiveShell() {
  const { role } = useUser();

  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 flex flex-col p-3 md:p-4 lg:p-6 overflow-hidden">
        {/* Role indicator */}
        {role && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-zinc-600">
              Viewing as <span className="text-zinc-400 font-medium">{ROLE_LABELS[role]}</span>
            </span>
          </div>
        )}
        {/* Task submission area */}
        <AdaptiveFeature featureId="task-submit" alwaysShow>
          <div className="mb-6">
            <TaskSubmit />
          </div>
        </AdaptiveFeature>
        {/* Task list */}
        <AdaptiveFeature featureId="task-list" alwaysShow className="flex-1 min-h-0 overflow-hidden">
          <TaskList />
        </AdaptiveFeature>
      </main>
    </div>
  );
}
