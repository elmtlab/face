"use client";

import { useState, useEffect } from "react";

interface TriageSuggestion {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  suggestedLabels: string[];
  suggestedPriority: string;
  reason: string;
}

export function TriageSummaryWidget() {
  const [suggestions, setSuggestions] = useState<TriageSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/project/triage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.suggestions) setSuggestions(data.suggestions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading triage...</p>;
  }

  if (suggestions.length === 0) {
    return <p className="text-xs text-zinc-500">No triage suggestions.</p>;
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {suggestions.slice(0, 10).map((s) => (
        <div
          key={s.issueId}
          className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-xs"
        >
          <div className="flex items-center gap-1 mb-1">
            <span className="text-zinc-500">#{s.issueNumber}</span>
            <span className="truncate text-zinc-300">{s.issueTitle}</span>
          </div>
          <p className="text-zinc-500 truncate">{s.reason}</p>
        </div>
      ))}
    </div>
  );
}
