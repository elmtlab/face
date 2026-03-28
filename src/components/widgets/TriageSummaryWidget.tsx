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
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <svg className="h-3.5 w-3.5 animate-spin text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6" strokeOpacity="0.3" /><path d="M8 2a6 6 0 014.24 1.76" />
        </svg>
        <p className="text-xs text-zinc-500">Loading triage...</p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return <div className="py-4 text-center"><p className="text-xs text-zinc-500">No triage suggestions.</p></div>;
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
