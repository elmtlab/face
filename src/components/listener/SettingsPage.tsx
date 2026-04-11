"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type PlatformName = "twitter" | "discord" | "telegram";

interface PlatformConfig {
  name: PlatformName;
  label: string;
  description: string;
  keys: { env: string; label: string; placeholder: string }[];
}

const PLATFORMS: PlatformConfig[] = [
  {
    name: "twitter",
    label: "Twitter / X",
    description: "Connect via X API v2 credentials",
    keys: [
      { env: "X_API_KEY", label: "API Key", placeholder: "Consumer key" },
      { env: "X_API_SECRET", label: "API Secret", placeholder: "Consumer secret" },
      { env: "X_ACCESS_TOKEN", label: "Access Token", placeholder: "User access token" },
      { env: "X_ACCESS_TOKEN_SECRET", label: "Access Token Secret", placeholder: "User access token secret" },
      { env: "X_BEARER_TOKEN", label: "Bearer Token", placeholder: "App-only bearer token" },
    ],
  },
  {
    name: "discord",
    label: "Discord",
    description: "Connect via Discord bot token",
    keys: [
      { env: "DISCORD_BOT_TOKEN", label: "Bot Token", placeholder: "Bot token from Developer Portal" },
    ],
  },
  {
    name: "telegram",
    label: "Telegram",
    description: "Connect via Telegram bot token",
    keys: [
      { env: "TELEGRAM_BOT_TOKEN", label: "Bot Token", placeholder: "Bot token from @BotFather" },
    ],
  },
];

type ConnectionStatus = Record<PlatformName, { configured: boolean }>;
type TestState = { loading: boolean; result?: { ok: boolean; username?: string; error?: string } };

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [testStates, setTestStates] = useState<Record<PlatformName, TestState>>({
    twitter: { loading: false },
    discord: { loading: false },
    telegram: { loading: false },
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/listener/settings").then((r) => r.json()),
      fetch("/api/listener/status").then((r) => r.json()),
    ]).then(([settingsData, statusData]) => {
      setSettings(settingsData.settings || {});
      setStatus(statusData);
    });
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await fetch("/api/listener/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });
      // Refresh settings and status
      const [settingsData, statusData] = await Promise.all([
        fetch("/api/listener/settings").then((r) => r.json()),
        fetch("/api/listener/status").then((r) => r.json()),
      ]);
      setSettings(settingsData.settings || {});
      setStatus(statusData);
      setFormValues({});
      setSaveMessage("Settings saved successfully");
    } catch {
      setSaveMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [formValues]);

  const handleTest = useCallback(async (platform: PlatformName) => {
    setTestStates((prev) => ({
      ...prev,
      [platform]: { loading: true },
    }));
    try {
      const res = await fetch("/api/listener/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const result = await res.json();
      setTestStates((prev) => ({
        ...prev,
        [platform]: { loading: false, result },
      }));
      // Refresh status after test
      const statusData = await fetch("/api/listener/status").then((r) => r.json());
      setStatus(statusData);
    } catch {
      setTestStates((prev) => ({
        ...prev,
        [platform]: { loading: false, result: { ok: false, error: "Network error" } },
      }));
    }
  }, []);

  const hasChanges = Object.values(formValues).some((v) => v !== "");

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Listener Settings</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Configure platform API keys for social media monitoring
            </p>
          </div>
          <Link
            href="/listener/trending"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View Trending &rarr;
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {saveMessage && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              saveMessage.includes("success")
                ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50"
                : "bg-red-900/30 text-red-400 border border-red-800/50"
            }`}
          >
            {saveMessage}
          </div>
        )}

        {PLATFORMS.map((platform) => {
          const isConfigured = status?.[platform.name]?.configured ?? false;
          const test = testStates[platform.name];

          return (
            <section
              key={platform.name}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <PlatformIcon name={platform.name} />
                  <div>
                    <h2 className="text-sm font-medium text-zinc-100">
                      {platform.label}
                    </h2>
                    <p className="text-xs text-zinc-500">{platform.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusDot configured={isConfigured} />
                  <button
                    className="btn btn-secondary text-xs"
                    disabled={!isConfigured || test.loading}
                    onClick={() => handleTest(platform.name)}
                  >
                    {test.loading ? "Testing..." : "Test Connection"}
                  </button>
                </div>
              </div>

              {test.result && (
                <div
                  className={`mx-5 mt-3 rounded px-3 py-2 text-xs ${
                    test.result.ok
                      ? "bg-emerald-900/30 text-emerald-400"
                      : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {test.result.ok
                    ? `Connected as @${test.result.username}`
                    : `Error: ${test.result.error}`}
                </div>
              )}

              <div className="px-5 py-4 space-y-3">
                {platform.keys.map((key) => (
                  <div key={key.env}>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      {key.label}
                      <span className="ml-1 text-zinc-600 font-normal">
                        ({key.env})
                      </span>
                    </label>
                    <input
                      type="password"
                      placeholder={
                        settings[key.env]
                          ? settings[key.env]
                          : key.placeholder
                      }
                      value={formValues[key.env] ?? ""}
                      onChange={(e) => handleChange(key.env, e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="flex justify-end pt-2">
          <button
            className="btn btn-primary"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </main>
    </div>
  );
}

function StatusDot({ configured }: { configured: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          configured ? "bg-emerald-400" : "bg-zinc-600"
        }`}
      />
      <span className={configured ? "text-emerald-400" : "text-zinc-500"}>
        {configured ? "Configured" : "Not configured"}
      </span>
    </span>
  );
}

function PlatformIcon({ name }: { name: PlatformName }) {
  const icons: Record<PlatformName, string> = {
    twitter: "𝕏",
    discord: "🎮",
    telegram: "✈",
  };
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800 text-sm">
      {icons[name]}
    </span>
  );
}
