"use client";

import { useState, useEffect, useCallback } from "react";

interface ScannedTopic {
  id: string;
  platform: string;
  title: string;
  description: string;
  matchedKeywords: string[];
  relevanceScore: number;
  trendVolume: number;
  url?: string;
  scannedAt: string;
}

export function TopicScanner() {
  const [topics, setTopics] = useState<ScannedTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/listener/topics");
      const data = await res.json();
      setTopics(data.topics ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTopics();
  }, [fetchTopics]);

  async function handleScan() {
    setScanning(true);
    try {
      await fetch("/api/listener/topics", { method: "POST" });
      await fetchTopics();
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading topics...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          {topics.length} topic{topics.length !== 1 ? "s" : ""} discovered
        </p>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {scanning ? "Scanning..." : "Scan Now"}
        </button>
      </div>

      {topics.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-6 text-center">
          <p className="text-sm text-zinc-400">No topics yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Configure a platform adapter and scan for trending topics
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {topics.map((topic) => (
            <div
              key={topic.id}
              className="rounded-lg border border-zinc-800 p-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-zinc-200 truncate">
                      {topic.title}
                    </h4>
                    <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      {topic.platform}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                    {topic.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {topic.matchedKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600">relevance</span>
                    <span className="text-xs font-medium text-zinc-300">
                      {Math.round(topic.relevanceScore * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600">volume</span>
                    <span className="text-xs font-medium text-zinc-400">
                      {topic.trendVolume.toLocaleString()}
                    </span>
                  </div>
                  {topic.url && (
                    <a
                      href={topic.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      View on X
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-2 text-[10px] text-zinc-600">
                Scanned {new Date(topic.scannedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
