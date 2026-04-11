"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface TrendingTopic {
  term: string;
  score: number;
  count: number;
  platforms: string[];
}

interface TrendingData {
  topics: TrendingTopic[];
  messageCount: number;
  connectedPlatforms: string[];
  unconfiguredPlatforms: string[];
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-sky-500/20 text-sky-400",
  discord: "bg-indigo-500/20 text-indigo-400",
  telegram: "bg-blue-500/20 text-blue-400",
};

export function TrendingPage() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/listener/trending");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  const maxScore = data?.topics[0]?.score ?? 1;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Trending Topics</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Hot topics extracted from connected social platforms
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-secondary text-xs"
              onClick={fetchTrending}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              href="/listener/settings"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Platform status bar */}
        {data && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {data.connectedPlatforms.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/30 px-3 py-1 text-xs text-emerald-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {p}
              </span>
            ))}
            {data.unconfiguredPlatforms.map((p) => (
              <Link
                key={p}
                href="/listener/settings"
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                {p} — configure
              </Link>
            ))}
            {data.messageCount > 0 && (
              <span className="text-xs text-zinc-600 ml-auto">
                {data.messageCount} messages analyzed
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" />
          </div>
        )}

        {data && data.topics.length === 0 && !loading && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
            <p className="text-sm text-zinc-400">No trending topics found</p>
            <p className="text-xs text-zinc-600 mt-1">
              {data.connectedPlatforms.length === 0
                ? "Configure at least one platform in Settings to get started"
                : "No messages were fetched from connected platforms. Check your source configuration."}
            </p>
            {data.connectedPlatforms.length === 0 && (
              <Link
                href="/listener/settings"
                className="btn btn-primary mt-4 inline-flex"
              >
                Go to Settings
              </Link>
            )}
          </div>
        )}

        {data && data.topics.length > 0 && (
          <div className="space-y-2">
            {data.topics.map((topic, i) => {
              const barWidth = Math.max(
                (topic.score / maxScore) * 100,
                4,
              );
              return (
                <div
                  key={topic.term}
                  className="group flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 hover:border-zinc-700 transition-colors"
                >
                  <span className="w-6 text-right text-xs font-mono text-zinc-600">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-medium text-zinc-100 truncate">
                        {topic.term}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {topic.count}x
                      </span>
                      {topic.platforms.map((p) => (
                        <span
                          key={p}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            PLATFORM_COLORS[p] ?? "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-blue-500/70 transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-zinc-500 w-12 text-right">
                    {topic.score}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
