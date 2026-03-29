"use client";

import { useState, useEffect, useCallback } from "react";
import type { SecurityReport, SecurityFinding } from "@/lib/security/scanner";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_COLORS: Record<Severity, { badge: string; dot: string }> = {
  critical: { badge: "bg-red-500/20 text-red-400 border-red-500/30", dot: "bg-red-400" },
  high: { badge: "bg-orange-500/20 text-orange-400 border-orange-500/30", dot: "bg-orange-400" },
  medium: { badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-400" },
  low: { badge: "bg-blue-500/20 text-blue-400 border-blue-500/30", dot: "bg-blue-400" },
  info: { badge: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", dot: "bg-zinc-400" },
};

interface FlatFinding extends SecurityFinding {
  taskId: string;
  taskTitle: string;
}

const POLL_INTERVAL_MS = 5000;

export function SecurityAuditDashboard() {
  const [reports, setReports] = useState<SecurityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(
    () => new Set(SEVERITY_ORDER),
  );

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/security/scan");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReports(data.reports);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchReports();
    const id = setInterval(fetchReports, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchReports]);

  // Flatten findings across all reports
  const allFindings: FlatFinding[] = reports.flatMap((r) =>
    r.findings.map((f) => ({ ...f, taskId: r.taskId, taskTitle: r.taskTitle })),
  );

  const filteredFindings = allFindings.filter((f) => activeSeverities.has(f.severity));

  // Summary counts
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of allFindings) counts[f.severity]++;

  const toggleSeverity = (sev: Severity) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Security Audit
          </h3>
          {!loading && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-600">
          {allFindings.length} finding{allFindings.length !== 1 ? "s" : ""} across{" "}
          {reports.length} task{reports.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Severity filter pills */}
      <div className="flex flex-wrap gap-2">
        {SEVERITY_ORDER.map((sev) => {
          const active = activeSeverities.has(sev);
          const colors = SEVERITY_COLORS[sev];
          return (
            <button
              key={sev}
              onClick={() => toggleSeverity(sev)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? colors.badge
                  : "border-zinc-800 bg-zinc-900 text-zinc-600"
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? colors.dot : "bg-zinc-700"}`} />
              {sev}
              <span className="ml-0.5 tabular-nums">{counts[sev]}</span>
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load security data: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          Scanning tasks...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && allFindings.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/30 py-12">
          <svg className="h-8 w-8 text-green-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="text-sm text-zinc-400">No security findings</p>
          <p className="text-xs text-zinc-600 mt-1">All scanned tasks are clean</p>
        </div>
      )}

      {/* Empty filtered state */}
      {!loading && !error && allFindings.length > 0 && filteredFindings.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 py-8 text-center">
          <p className="text-sm text-zinc-500">No findings match the selected severity filters</p>
        </div>
      )}

      {/* Findings list */}
      {filteredFindings.length > 0 && (
        <div className="space-y-2">
          {filteredFindings.map((f, i) => (
            <FindingRow key={`${f.taskId}-${f.ruleId}-${f.stepId}-${i}`} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: FlatFinding }) {
  const colors = SEVERITY_COLORS[finding.severity];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${colors.dot}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-200">{finding.ruleName}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase ${colors.badge}`}>
              {finding.severity}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{finding.ruleDescription}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
            <span>
              Task: <span className="text-zinc-400">{finding.taskTitle}</span>
            </span>
            <span>
              Tool: <span className="text-zinc-400">{finding.stepTool}</span>
            </span>
            <span className="truncate max-w-xs" title={finding.stepDescription}>
              Op: <span className="text-zinc-400">{finding.stepDescription}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
