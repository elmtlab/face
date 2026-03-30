"use client";

import { TaskList } from "@/components/tasks/TaskList";
import { TaskSubmit } from "@/components/tasks/TaskSubmit";
import { AdaptiveFeature } from "@/components/shared/AdaptiveFeature";
import { useUser } from "@/components/user/UserContext";
import { ROLE_LABELS } from "@/lib/user/types";
import Link from "next/link";

export function AdaptiveShell() {
  const { role } = useUser();

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-zinc-100">FACE</h1>
          {role && (
            <span className="text-xs text-zinc-600">
              Viewing as <span className="text-zinc-400 font-medium">{ROLE_LABELS[role]}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/my"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            My Dashboard
          </Link>
          <Link
            href={role === "engineer" ? "/dev" : role === "product_manager" ? "/product-manager" : role === "project_manager" ? "/project-manager" : "/dev"}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Role Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-3 md:p-4 lg:p-6 overflow-hidden">
        {/* Task submission area */}
        <AdaptiveFeature featureId="task-submit" alwaysShow>
          <div className="mb-4 md:mb-6">
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
