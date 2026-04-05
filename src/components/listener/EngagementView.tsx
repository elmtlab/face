"use client";

import { useState, useEffect, useCallback } from "react";

interface EngagementMetrics {
  likes: number;
  reposts: number;
  replies: number;
  impressions: number;
  bookmarks: number;
}

interface PostEngagement {
  contentId: string;
  platformPostId: string;
  platform: string;
  metrics: EngagementMetrics;
  fetchedAt: string;
}

interface PublishedContent {
  id: string;
  body: string;
  editedBody?: string;
  platformPostUrl?: string;
  publishedAt?: string;
}

export function EngagementView() {
  const [engagement, setEngagement] = useState<PostEngagement[]>([]);
  const [content, setContent] = useState<PublishedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [engRes, contentRes] = await Promise.all([
        fetch("/api/listener/engagement"),
        fetch("/api/listener/content?status=published"),
      ]);
      const engData = await engRes.json();
      const contentData = await contentRes.json();
      setEngagement(engData.engagement ?? []);
      setContent(contentData.content ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await fetch("/api/listener/engagement", { method: "POST" });
      await fetchData();
    } finally {
      setAnalyzing(false);
    }
  }

  function getEngagementFor(contentId: string): PostEngagement | undefined {
    return engagement.find((e) => e.contentId === contentId);
  }

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading engagement data...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          {content.length} published post{content.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Analyze Now"}
        </button>
      </div>

      {content.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-6 text-center">
          <p className="text-sm text-zinc-400">No published posts yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Approve content to see engagement metrics
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {content.map((item) => {
            const eng = getEngagementFor(item.id);
            return (
              <div
                key={item.id}
                className="rounded-lg border border-zinc-800 p-3"
              >
                <p className="text-sm text-zinc-300 line-clamp-2">
                  {item.editedBody ?? item.body}
                </p>

                {eng ? (
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    <MetricCard label="Likes" value={eng.metrics.likes} />
                    <MetricCard label="Reposts" value={eng.metrics.reposts} />
                    <MetricCard label="Replies" value={eng.metrics.replies} />
                    <MetricCard label="Views" value={eng.metrics.impressions} />
                    <MetricCard label="Saves" value={eng.metrics.bookmarks} />
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-zinc-600">
                    No engagement data yet — run analysis
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-600">
                    Published {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "—"}
                  </span>
                  {item.platformPostUrl && (
                    <a
                      href={item.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      View on X
                    </a>
                  )}
                </div>

                {eng && (
                  <div className="mt-1 text-[10px] text-zinc-600">
                    Last updated {new Date(eng.fetchedAt).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-800/50 p-2 text-center">
      <div className="text-sm font-medium text-zinc-200">
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}
