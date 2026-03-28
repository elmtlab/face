"use client";

import type { RoleDefinition } from "@/lib/roles/types";
import { WidgetRenderer } from "./WidgetRenderer";
import Link from "next/link";

interface RoleDashboardProps {
  role: RoleDefinition;
}

/**
 * Assembles a role-specific dashboard from the role definition's widget list.
 * All layout is data-driven — the role registry defines which widgets appear
 * and in what order. No per-role component authoring required.
 */
export function RoleDashboard({ role }: RoleDashboardProps) {
  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <Link
          href="/"
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Home"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <svg
          className="h-5 w-5 text-blue-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
        </svg>
        <div>
          <h1 className="text-sm font-semibold text-zinc-100">{role.label}</h1>
          <p className="text-xs text-zinc-500">{role.description}</p>
        </div>
        {role.permissions.readOnly && (
          <span className="ml-auto rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs text-zinc-400">
            Read-only
          </span>
        )}
      </header>

      {/* AI behavior hint */}
      <div className="border-b border-zinc-800/50 bg-zinc-900/30 px-4 py-2">
        <p className="text-xs text-zinc-500">
          <span className="text-zinc-400 font-medium">AI assistant: </span>
          {role.aiBehavior.description}
        </p>
      </div>

      {/* Widget grid */}
      <main className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {role.widgets.map((widget, index) => (
            <WidgetRenderer
              key={`${widget.type}-${index}`}
              config={widget}
              promptTemplates={role.aiBehavior.promptTemplates}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
