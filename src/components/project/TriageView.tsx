"use client";

import { useState } from "react";
import type { IssuePriority } from "@/lib/project/types";
import { Pagination } from "@/components/shared/Pagination";
import { usePagination } from "@/components/shared/usePagination";

interface TriageSuggestion {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  suggestedLabels: string[];
  suggestedPriority: IssuePriority;
  suggestedAssignee: string | null;
  reason: string;
}

export function TriageView() {
  const [suggestions, setSuggestions] = useState<TriageSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ applied: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/project/triage");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSuggestions(data.suggestions);
        setSelected(new Set(data.suggestions.map((s: TriageSuggestion) => s.issueId)));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map((s) => s.issueId)));
    }
  };

  const updatePriority = (issueId: string, priority: IssuePriority) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.issueId === issueId ? { ...s, suggestedPriority: priority } : s))
    );
  };

  const applySelected = async () => {
    const toApply = suggestions.filter((s) => selected.has(s.issueId));
    if (toApply.length === 0) return;

    setApplying(true);
    setResult(null);
    try {
      const res = await fetch("/api/project/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions: toApply }),
      });
      const data = await res.json();
      setResult(data);
      // Remove applied suggestions
      if (data.applied > 0) {
        const appliedIds = new Set(toApply.map((s) => s.issueId));
        setSuggestions((prev) => prev.filter((s) => !appliedIds.has(s.issueId)));
        setSelected((prev) => {
          const next = new Set(prev);
          appliedIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const { page, pageItems: pagedSuggestions, totalItems, setPage } = usePagination(suggestions);

  const PRIORITY_OPTIONS: IssuePriority[] = ["urgent", "high", "medium", "low", "none"];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Auto-Triage</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Analyze untriaged issues and suggest labels, priority, and assignees
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={analyzing}
          className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {analyzing ? "Analyzing..." : "Auto-Triage"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-600/10 border border-red-600/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 p-3 rounded-md bg-emerald-600/10 border border-emerald-600/20 text-emerald-400 text-sm">
          Applied triage to {result.applied} issue{result.applied !== 1 ? "s" : ""}.
          {result.errors.length > 0 && (
            <span className="text-red-400 ml-2">
              {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}: {result.errors.join("; ")}
            </span>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-400">
              {suggestions.length} untriaged issue{suggestions.length !== 1 ? "s" : ""} found
            </span>
            <button
              onClick={applySelected}
              disabled={applying || selected.size === 0}
              className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {applying ? "Applying..." : `Apply Selected (${selected.size})`}
            </button>
          </div>

          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === suggestions.length}
                      onChange={toggleAll}
                      className="rounded border-zinc-600"
                    />
                  </th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-medium w-16">#</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-medium">Issue</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-medium w-36">Labels</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-medium w-28">Priority</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {pagedSuggestions.map((s) => (
                  <tr key={s.issueId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(s.issueId)}
                        onChange={() => toggleSelect(s.issueId)}
                        className="rounded border-zinc-600"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{s.issueNumber}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{s.issueTitle}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {s.suggestedLabels.map((l) => (
                          <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                            {l}
                          </span>
                        ))}
                        {s.suggestedLabels.length === 0 && (
                          <span className="text-[10px] text-zinc-600">none</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={s.suggestedPriority}
                        onChange={(e) => updatePriority(s.issueId, e.target.value as IssuePriority)}
                        className="text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-zinc-200"
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        </>
      )}

      {!analyzing && suggestions.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm mb-2">
            Click &quot;Auto-Triage&quot; to analyze issues that have no labels or priority
          </p>
          <p className="text-zinc-600 text-xs">
            Suggestions are based on keyword analysis of issue titles and descriptions
          </p>
        </div>
      )}
    </div>
  );
}
