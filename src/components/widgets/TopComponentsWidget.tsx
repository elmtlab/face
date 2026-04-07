"use client";

import { useState, useEffect } from "react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface TopComponent {
  featureId: string;
  interactionCount: number;
  percentage: number;
}

/**
 * Displays the top 3–5 most frequently used components,
 * determined by a relative drop cutoff algorithm.
 */
export function TopComponentsWidget() {
  const [components, setComponents] = useState<TopComponent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/components/top")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.components) setComponents(data.components);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingSpinner label="Loading top components..." />;
  }

  if (components.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-zinc-500">No component usage data yet.</p>
      </div>
    );
  }

  const maxCount = components[0].interactionCount;

  return (
    <div className="space-y-2">
      {components.map((c) => (
        <div
          key={c.featureId}
          className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-zinc-200 truncate">
              {formatFeatureId(c.featureId)}
            </span>
            <span className="flex-shrink-0 text-xs text-zinc-400">
              {c.percentage}% ({c.interactionCount})
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{
                width: `${maxCount > 0 ? (c.interactionCount / maxCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Convert kebab-case feature IDs to readable labels. */
function formatFeatureId(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
