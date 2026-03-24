"use client";

import type { ViewMode } from "@/app/project/page";

interface Props {
  activeView: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onRefresh: () => void;
}

const NAV_ITEMS: { key: ViewMode; label: string; icon: string }[] = [
  { key: "board", label: "Board", icon: "▦" },
  { key: "list", label: "Issues", icon: "☰" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

export function ProjectSidebar({ activeView, onViewChange, onRefresh }: Props) {
  return (
    <aside className="w-56 border-r border-zinc-800 bg-zinc-900 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← FACE Dashboard
        </a>
        <h1 className="text-lg font-semibold mt-2">Project</h1>
        <p className="text-xs text-zinc-500 mt-0.5">AI-powered project management</p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
              activeView === item.key
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-zinc-800">
        <button
          onClick={onRefresh}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1.5 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
        >
          Refresh
        </button>
      </div>
    </aside>
  );
}
