"use client";

import { useState, useEffect, useCallback } from "react";

interface SchedulerConfig {
  scanIntervalMinutes: number;
  generateIntervalMinutes: number;
  analyzeIntervalMinutes: number;
  keywords: string[];
  enabled: boolean;
}

interface AdapterInfo {
  type: string;
  name: string;
  enabled: boolean;
}

interface SchedulerStatus {
  running: boolean;
  config: SchedulerConfig;
  lastScanAt: string | null;
  lastGenerateAt: string | null;
  lastAnalyzeAt: string | null;
}

export function ListenerConfig() {
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [availableAdapters, setAvailableAdapters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Adapter form
  const [showAdapterForm, setShowAdapterForm] = useState(false);
  const [adapterForm, setAdapterForm] = useState({
    type: "twitter",
    name: "X / Twitter",
    bearerToken: "",
    apiKey: "",
    apiSecret: "",
    accessToken: "",
    accessTokenSecret: "",
  });

  // Scheduler form
  const [keywords, setKeywords] = useState("");
  const [scanInterval, setScanInterval] = useState(120);
  const [generateInterval, setGenerateInterval] = useState(180);
  const [analyzeInterval, setAnalyzeInterval] = useState(360);

  const fetchConfig = useCallback(async () => {
    try {
      const [schedRes, configRes] = await Promise.all([
        fetch("/api/listener/scheduler"),
        fetch("/api/listener/config"),
      ]);
      const schedData = await schedRes.json();
      const configData = await configRes.json();

      setScheduler(schedData);
      setAdapters(configData.adapters ?? []);
      setAvailableAdapters(configData.availableAdapters ?? []);

      // Populate scheduler form
      if (schedData.config) {
        setKeywords(schedData.config.keywords?.join(", ") ?? "");
        setScanInterval(schedData.config.scanIntervalMinutes ?? 120);
        setGenerateInterval(schedData.config.generateIntervalMinutes ?? 180);
        setAnalyzeInterval(schedData.config.analyzeIntervalMinutes ?? 360);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  async function handleAddAdapter() {
    await fetch("/api/listener/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: adapterForm.type,
        name: adapterForm.name,
        credentials: {
          bearerToken: adapterForm.bearerToken,
          apiKey: adapterForm.apiKey,
          apiSecret: adapterForm.apiSecret,
          accessToken: adapterForm.accessToken,
          accessTokenSecret: adapterForm.accessTokenSecret,
        },
        enabled: true,
      }),
    });
    setShowAdapterForm(false);
    setAdapterForm({
      type: "twitter",
      name: "X / Twitter",
      bearerToken: "",
      apiKey: "",
      apiSecret: "",
      accessToken: "",
      accessTokenSecret: "",
    });
    await fetchConfig();
  }

  async function handleRemoveAdapter(type: string) {
    await fetch(`/api/listener/config?type=${type}`, { method: "DELETE" });
    await fetchConfig();
  }

  async function handleSchedulerAction(action: "start" | "stop") {
    await fetch("/api/listener/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchConfig();
  }

  async function handleUpdateScheduler() {
    const kw = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    await fetch("/api/listener/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        config: {
          scanIntervalMinutes: scanInterval,
          generateIntervalMinutes: generateInterval,
          analyzeIntervalMinutes: analyzeInterval,
          keywords: kw,
        },
      }),
    });
    await fetchConfig();
  }

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading configuration...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Platform Adapters */}
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">
          Platform Adapters
        </h4>

        {adapters.length > 0 ? (
          <div className="flex flex-col gap-2 mb-3">
            {adapters.map((adapter) => (
              <div
                key={adapter.type}
                className="flex items-center justify-between rounded-lg border border-zinc-800 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      adapter.enabled ? "bg-green-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-sm text-zinc-200">{adapter.name}</span>
                  <span className="text-[10px] text-zinc-500">
                    ({adapter.type})
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveAdapter(adapter.type)}
                  className="text-[10px] text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 mb-3">
            No adapters configured. Available: {availableAdapters.join(", ") || "none"}
          </p>
        )}

        {showAdapterForm ? (
          <div className="rounded-lg border border-zinc-800 p-3">
            <h5 className="text-xs font-medium text-zinc-300 mb-2">
              Add X/Twitter Adapter
            </h5>
            <div className="flex flex-col gap-2">
              {[
                { label: "Bearer Token", key: "bearerToken" as const },
                { label: "API Key", key: "apiKey" as const },
                { label: "API Secret", key: "apiSecret" as const },
                { label: "Access Token", key: "accessToken" as const },
                { label: "Access Token Secret", key: "accessTokenSecret" as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-[10px] text-zinc-500">{label}</label>
                  <input
                    type="password"
                    value={adapterForm[key]}
                    onChange={(e) =>
                      setAdapterForm({ ...adapterForm, [key]: e.target.value })
                    }
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleAddAdapter}
                  className="rounded bg-blue-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-blue-500"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowAdapterForm(false)}
                  className="rounded px-3 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdapterForm(true)}
            className="rounded-md border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 w-full"
          >
            + Add Platform Adapter
          </button>
        )}
      </section>

      {/* Scheduler */}
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">
          Scheduler
        </h4>

        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  scheduler?.running ? "bg-green-500 animate-pulse" : "bg-zinc-600"
                }`}
              />
              <span className="text-xs text-zinc-200">
                {scheduler?.running ? "Running" : "Stopped"}
              </span>
            </div>
            <button
              onClick={() =>
                handleSchedulerAction(scheduler?.running ? "stop" : "start")
              }
              className={`rounded px-3 py-1 text-[10px] font-medium ${
                scheduler?.running
                  ? "bg-red-800/50 text-red-300 hover:bg-red-700/50"
                  : "bg-green-700 text-white hover:bg-green-600"
              }`}
            >
              {scheduler?.running ? "Stop" : "Start"}
            </button>
          </div>

          {/* Last run timestamps */}
          <div className="flex flex-col gap-1 mb-3 text-[10px] text-zinc-500">
            <span>
              Last scan: {scheduler?.lastScanAt ? new Date(scheduler.lastScanAt).toLocaleString() : "never"}
            </span>
            <span>
              Last generate: {scheduler?.lastGenerateAt ? new Date(scheduler.lastGenerateAt).toLocaleString() : "never"}
            </span>
            <span>
              Last analyze: {scheduler?.lastAnalyzeAt ? new Date(scheduler.lastAnalyzeAt).toLocaleString() : "never"}
            </span>
          </div>

          {/* Intervals */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500">Scan (min)</label>
                <input
                  type="number"
                  min={10}
                  value={scanInterval}
                  onChange={(e) => setScanInterval(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500">Generate (min)</label>
                <input
                  type="number"
                  min={10}
                  value={generateInterval}
                  onChange={(e) => setGenerateInterval(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500">Analyze (min)</label>
                <input
                  type="number"
                  min={10}
                  value={analyzeInterval}
                  onChange={(e) => setAnalyzeInterval(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label className="text-[10px] text-zinc-500">
                Keywords (comma-separated)
              </label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleUpdateScheduler}
              className="rounded bg-zinc-700 px-3 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-600 self-start"
            >
              Update Settings
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
