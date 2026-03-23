"use client";

import { useEffect, useState } from "react";

interface HealthData {
  status: string;
  agents: Record<string, { installed: boolean; configured: boolean; healthy: boolean }>;
  db: boolean;
}

export function HealthBanner() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/health");
        setHealth(await res.json());
      } catch {
        setHealth({ status: "error", agents: {}, db: false });
      }
    }
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!health || health.status === "ok") return null;

  const unconfigured = Object.entries(health.agents)
    .filter(([, a]) => a.installed && !a.configured)
    .map(([k]) => k);

  const notInstalled = Object.entries(health.agents)
    .filter(([, a]) => !a.installed)
    .map(([k]) => k);

  if (health.status === "setup_required") {
    return (
      <div className="px-4 py-2 text-sm font-medium bg-blue-950 text-blue-300 border-b border-blue-900">
        {unconfigured.length > 0 &&
          `Agents need configuration: ${unconfigured.join(", ")}. `}
        {notInstalled.length > 0 &&
          `Agents not found: ${notInstalled.join(", ")}. `}
        {!health.db && "Database unavailable. "}
      </div>
    );
  }

  return (
    <div className="px-4 py-2 text-sm font-medium bg-amber-950 text-amber-300 border-b border-amber-900">
      Some agents need attention.
      {!health.db && " Database unavailable."}
    </div>
  );
}
