"use client";

import { useState, useCallback } from "react";
import type { PlatformType } from "@/lib/platforms/types";

interface TrendingTopic {
  keyword: string;
  score: number;
  count: number;
  platforms: PlatformType[];
  sampleMessages: string[];
}

interface PlatformStat {
  platform: PlatformType;
  configured: boolean;
  messageCount: number;
  error?: string;
}

interface TrendingData {
  topics: TrendingTopic[];
  totalMessages: number;
  platforms: PlatformStat[];
  analyzedAt: string;
}

export default function TrendingPage() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trending");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const unconfiguredPlatforms = data?.platforms.filter((p) => !p.configured) || [];
  const configuredPlatforms = data?.platforms.filter((p) => p.configured) || [];
  const maxScore = data?.topics[0]?.score || 1;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trending Topics</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Hot topics extracted from your connected platforms
          </p>
        </div>
        <button
          onClick={fetchTrending}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? "Analyzing..." : data ? "Refresh" : "Fetch & Analyze"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Platform status bar */}
          <div className="flex flex-wrap gap-3">
            {configuredPlatforms.map((p) => (
              <span
                key={p.platform}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-zinc-300 capitalize">{p.platform}</span>
                <span className="text-zinc-500">
                  {p.messageCount} messages
                </span>
                {p.error && (
                  <span className="text-red-400">({p.error})</span>
                )}
              </span>
            ))}
            {unconfiguredPlatforms.map((p) => (
              <a
                key={p.platform}
                href="/settings"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs hover:border-zinc-700 transition-colors"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
                <span className="text-zinc-500 capitalize">{p.platform}</span>
                <span className="text-zinc-600">Not configured</span>
              </a>
            ))}
          </div>

          {/* Summary */}
          <div className="text-sm text-zinc-400">
            Analyzed {data.totalMessages} messages across{" "}
            {configuredPlatforms.length} platform
            {configuredPlatforms.length !== 1 ? "s" : ""} &middot; Found{" "}
            {data.topics.length} trending topics &middot;{" "}
            {new Date(data.analyzedAt).toLocaleString()}
          </div>

          {/* Topics list */}
          {data.topics.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
              <p className="text-zinc-400">
                {data.totalMessages === 0
                  ? "No messages found. Make sure at least one platform is configured and has recent activity."
                  : "No trending topics found in the fetched messages."}
              </p>
              {unconfiguredPlatforms.length > 0 && (
                <a
                  href="/settings"
                  className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300"
                >
                  Configure more platforms to get better results
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {data.topics.map((topic, index) => (
                <div
                  key={topic.keyword}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-zinc-300">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-white truncate">
                          {topic.keyword}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {topic.platforms.map((p) => (
                            <span
                              key={p}
                              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400"
                            >
                              {p}
                            </span>
                          ))}
                          <span className="text-xs text-zinc-500">
                            {topic.count} mentions
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono text-zinc-300">
                        {topic.score.toFixed(3)}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        score
                      </div>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{
                        width: `${(topic.score / maxScore) * 100}%`,
                      }}
                    />
                  </div>

                  {/* Sample messages */}
                  {topic.sampleMessages.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {topic.sampleMessages.map((msg, i) => (
                        <p
                          key={i}
                          className="text-xs text-zinc-500 truncate"
                        >
                          &ldquo;{msg}&rdquo;
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Initial state - no data fetched yet */}
      {!data && !loading && !error && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-lg text-zinc-400">
            Click &ldquo;Fetch &amp; Analyze&rdquo; to scan connected platforms
            for trending topics.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Make sure you have at least one platform configured in{" "}
            <a href="/settings" className="text-blue-400 hover:text-blue-300">
              Settings
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
