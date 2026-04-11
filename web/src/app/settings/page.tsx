"use client";

import { useState, useEffect, useCallback } from "react";
import type { PlatformType } from "@/lib/platforms/types";
import { PLATFORM_CONFIGS } from "@/lib/platforms/types";

interface PlatformStatus {
  type: PlatformType;
  displayName: string;
  configured: boolean;
  credentials: Record<string, string>;
}

interface ConnectionResult {
  platform: PlatformType;
  connected: boolean;
  username?: string;
  error?: string;
}

export default function SettingsPage() {
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [connectionResults, setConnectionResults] = useState<Record<string, ConnectionResult>>({});
  const [editingPlatform, setEditingPlatform] = useState<PlatformType | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<PlatformType | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setPlatforms(data.platforms);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSave(platformType: PlatformType) {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentials: formValues }),
    });
    setSaving(false);
    setEditingPlatform(null);
    setFormValues({});
    await loadSettings();
  }

  async function handleDelete(platformType: PlatformType) {
    await fetch("/api/settings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: platformType }),
    });
    setConnectionResults((prev) => {
      const next = { ...prev };
      delete next[platformType];
      return next;
    });
    await loadSettings();
  }

  async function handleTest(platformType: PlatformType) {
    setTesting(platformType);
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: platformType }),
    });
    const data = await res.json();
    if (data.results?.[0]) {
      setConnectionResults((prev) => ({ ...prev, [platformType]: data.results[0] }));
    }
    setTesting(null);
  }

  async function handleTestAll() {
    setTestingAll(true);
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    const results: Record<string, ConnectionResult> = {};
    for (const r of data.results || []) {
      results[r.platform] = r;
    }
    setConnectionResults(results);
    setTestingAll(false);
  }

  function startEditing(platform: PlatformStatus) {
    setEditingPlatform(platform.type);
    const config = PLATFORM_CONFIGS.find((c) => c.type === platform.type);
    const values: Record<string, string> = {};
    for (const cred of config?.credentials || []) {
      values[cred.key] = "";
    }
    setFormValues(values);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configure API credentials for each platform
          </p>
        </div>
        <button
          onClick={handleTestAll}
          disabled={testingAll}
          className="btn btn-secondary"
        >
          {testingAll ? "Testing..." : "Test All Connections"}
        </button>
      </div>

      <div className="space-y-4">
        {PLATFORM_CONFIGS.map((config) => {
          const platform = platforms.find((p) => p.type === config.type);
          const status = connectionResults[config.type];
          const isEditing = editingPlatform === config.type;

          return (
            <div
              key={config.type}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <PlatformIcon type={config.type} />
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {config.displayName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusDot
                        connected={status?.connected}
                        configured={platform?.configured}
                      />
                      <span className="text-xs text-zinc-400">
                        {status?.connected
                          ? `Connected${status.username ? ` as ${status.username}` : ""}`
                          : status?.error
                            ? status.error
                            : platform?.configured
                              ? "Configured (not tested)"
                              : "Not configured"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {platform?.configured && (
                    <>
                      <button
                        onClick={() => handleTest(config.type)}
                        disabled={testing === config.type}
                        className="btn btn-secondary text-xs"
                      >
                        {testing === config.type ? "Testing..." : "Test"}
                      </button>
                      <button
                        onClick={() => handleDelete(config.type)}
                        className="btn btn-danger text-xs"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  <button
                    onClick={() =>
                      isEditing
                        ? setEditingPlatform(null)
                        : startEditing(
                            platform || { type: config.type, displayName: config.displayName, configured: false, credentials: {} },
                          )
                    }
                    className="btn btn-primary text-xs"
                  >
                    {isEditing ? "Cancel" : platform?.configured ? "Update" : "Configure"}
                  </button>
                </div>
              </div>

              {/* Credential form */}
              {isEditing && (
                <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
                  {config.credentials.map((cred) => (
                    <div key={cred.key}>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        {cred.label}
                      </label>
                      <input
                        type="password"
                        placeholder={cred.placeholder}
                        value={formValues[cred.key] || ""}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [cred.key]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => handleSave(config.type)}
                    disabled={saving}
                    className="btn btn-primary"
                  >
                    {saving ? "Saving..." : "Save Credentials"}
                  </button>
                </div>
              )}

              {/* Show masked credentials when configured and not editing */}
              {platform?.configured && !isEditing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {config.credentials.map((cred) => (
                    <span
                      key={cred.key}
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400"
                    >
                      {cred.label}:{" "}
                      <span className="font-mono">
                        {platform.credentials[cred.key] || "not set"}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({
  connected,
  configured,
}: {
  connected?: boolean;
  configured?: boolean;
}) {
  const color =
    connected === true
      ? "bg-green-500"
      : connected === false
        ? "bg-red-500"
        : configured
          ? "bg-yellow-500"
          : "bg-zinc-600";

  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function PlatformIcon({ type }: { type: PlatformType }) {
  const icons: Record<PlatformType, string> = {
    twitter: "𝕏",
    discord: "D",
    telegram: "T",
  };

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-lg font-bold text-white">
      {icons[type]}
    </span>
  );
}
