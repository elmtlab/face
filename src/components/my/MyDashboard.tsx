"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useUsageData } from "@/components/usage/UsageTracker";
import { getAllPages, type PageInfo } from "@/lib/usage/pages";
import { TopComponentsWidget } from "@/components/widgets/TopComponentsWidget";
import { WidgetShell } from "@/components/widgets/WidgetShell";

/**
 * Personalized dashboard that reorders feature cards by usage frequency.
 * Pages the user visits most appear first. Unvisited pages appear in
 * default registry order at the bottom.
 */
export function MyDashboard() {
  const usageEntries = useUsageData();
  const allPages = useMemo(() => getAllPages(), []);

  // Build a frequency map from usage data
  const frequencyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of usageEntries) {
      map.set(entry.path, entry.count);
    }
    return map;
  }, [usageEntries]);

  // Sort pages: visited pages by frequency desc, then unvisited in default order
  const sortedPages = useMemo(() => {
    const visited: (PageInfo & { count: number })[] = [];
    const unvisited: PageInfo[] = [];

    for (const page of allPages) {
      // Skip the /my page itself
      if (page.path === "/my") continue;
      const count = frequencyMap.get(page.path);
      if (count && count > 0) {
        visited.push({ ...page, count });
      } else {
        unvisited.push(page);
      }
    }

    visited.sort((a, b) => b.count - a.count);
    return { visited, unvisited };
  }, [allPages, frequencyMap]);

  const hasUsageData = sortedPages.visited.length > 0;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors"
          >
            FACE
          </Link>
          <span className="text-xs text-zinc-600">My Dashboard</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-6">
        <section className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <WidgetShell title="Top Components" size="medium">
              <TopComponentsWidget />
            </WidgetShell>
          </div>
        </section>

        {hasUsageData && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Most Used
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedPages.visited.map((page) => (
                <PageCard key={page.path} page={page} count={page.count} />
              ))}
            </div>
          </section>
        )}

        {sortedPages.unvisited.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              {hasUsageData ? "Explore" : "All Features"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedPages.unvisited.map((page) => (
                <PageCard key={page.path} page={page} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function PageCard({ page, count }: { page: PageInfo; count?: number }) {
  return (
    <Link
      href={page.path}
      className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400 opacity-70 group-hover:opacity-100 transition-opacity"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={page.iconPath}
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-200 truncate group-hover:text-zinc-100">
              {page.label}
            </h3>
            {count != null && (
              <span className="flex-shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {count} {count === 1 ? "visit" : "visits"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 truncate">
            {page.description}
          </p>
        </div>
      </div>
    </Link>
  );
}
