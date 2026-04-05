"use client";

import { useEffect, useState } from "react";

interface PMSyncProviderConfig {
  type: string;
  name: string;
  credentials: Record<string, string>;
  scope: string;
  enabled: boolean;
}

interface ConfigState {
  providers: PMSyncProviderConfig[];
  active: string | null;
  available: string[];
}

const PROVIDER_LABELS: Record<string, string> = {
  linear: "Linear",
  jira: "Jira",
  asana: "Asana",
};

const PROVIDER_FIELDS: Record<string, { label: string; key: string; placeholder: string; secret?: boolean }[]> = {
  linear: [
    { label: "API Key", key: "token", placeholder: "lin_api_...", secret: true },
  ],
  jira: [
    { label: "API Token", key: "token", placeholder: "Your Jira API token", secret: true },
    { label: "Base URL", key: "baseUrl", placeholder: "https://your-domain.atlassian.net" },
    { label: "Email", key: "email", placeholder: "you@example.com" },
  ],
  asana: [
    { label: "Personal Access Token", key: "token", placeholder: "Your Asana PAT", secret: true },
  ],
};

const SCOPE_LABELS: Record<string, { label: string; placeholder: string }> = {
  linear: { label: "Team ID", placeholder: "Your Linear team ID" },
  jira: { label: "Project Key", placeholder: "e.g. PROJ" },
  asana: { label: "Workspace GID", placeholder: "Your Asana workspace GID" },
};

export function PMSyncSettings() {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state for adding a new provider
  const [formType, setFormType] = useState("linear");
  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState("");
  const [formCreds, setFormCreds] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/pm-sync/config");
      if (res.ok) {
        setConfig(await res.json());
      }
    } catch {
      setError("Failed to load PM sync configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleAdd = async () => {
    if (!formName.trim() || !formScope.trim()) {
      setError("Name and scope are required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/pm-sync/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          name: formName.trim(),
          credentials: formCreds,
          scope: formScope.trim(),
          enabled: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add provider");
      } else {
        setSuccess(`${PROVIDER_LABELS[formType] ?? formType} provider added successfully`);
        setShowForm(false);
        setFormName("");
        setFormScope("");
        setFormCreds({});
        fetchConfig();
      }
    } catch {
      setError("Failed to save provider configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/pm-sync/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled }),
      });
      if (res.ok) fetchConfig();
    } catch {
      // ignore
    }
  };

  const handleRemove = async (name: string) => {
    try {
      const res = await fetch(`/api/pm-sync/config?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) fetchConfig();
    } catch {
      // ignore
    }
  };

  const handleSetActive = async (name: string) => {
    try {
      const res = await fetch("/api/pm-sync/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: name }),
      });
      if (res.ok) fetchConfig();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="animate-pulse text-sm text-zinc-500">Loading PM sync settings...</div>
      </div>
    );
  }

  const scopeInfo = SCOPE_LABELS[formType] ?? { label: "Scope", placeholder: "Provider scope" };
  const fields = PROVIDER_FIELDS[formType] ?? [];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">PM Tool Sync</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Automatically sync projects and tasks to your PM tool
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-[11px] px-2.5 py-1 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors"
          >
            Add Provider
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-zinc-800">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="px-4 py-2 bg-emerald-950/30 border-b border-zinc-800">
          <p className="text-xs text-emerald-400">{success}</p>
        </div>
      )}

      {/* Configured providers */}
      {config && config.providers.length > 0 && (
        <div className="divide-y divide-zinc-800/50">
          {config.providers.map((p) => (
            <div key={p.name} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${p.enabled ? "bg-emerald-500" : "bg-zinc-600"}`}
                />
                <div>
                  <span className="text-sm text-zinc-200">{p.name}</span>
                  <span className="text-[10px] text-zinc-500 ml-2">
                    {PROVIDER_LABELS[p.type] ?? p.type}
                  </span>
                  {config.active === p.name && (
                    <span className="text-[10px] text-indigo-400 ml-2">active</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {config.active !== p.name && p.enabled && (
                  <button
                    onClick={() => handleSetActive(p.name)}
                    className="text-[10px] px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Set active
                  </button>
                )}
                <button
                  onClick={() => handleToggle(p.name, !p.enabled)}
                  className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                    p.enabled
                      ? "text-amber-400 hover:text-amber-300"
                      : "text-emerald-400 hover:text-emerald-300"
                  }`}
                >
                  {p.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleRemove(p.name)}
                  className="text-[10px] px-2 py-0.5 rounded text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {config && config.providers.length === 0 && !showForm && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-zinc-500">No PM tool configured</p>
          <p className="text-[11px] text-zinc-600 mt-1">
            Add a provider to auto-sync projects and tasks
          </p>
        </div>
      )}

      {/* Add provider form */}
      {showForm && (
        <div className="px-4 py-3 border-t border-zinc-800 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Provider</label>
              <select
                value={formType}
                onChange={(e) => {
                  setFormType(e.target.value);
                  setFormCreds({});
                }}
                className="mt-1 w-full rounded bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                {(config?.available ?? ["linear"]).map((t) => (
                  <option key={t} value={t}>
                    {PROVIDER_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. My Linear"
                className="mt-1 w-full rounded bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Credential fields */}
          {fields.map((field) => (
            <div key={field.key}>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">{field.label}</label>
              <input
                type={field.secret ? "password" : "text"}
                value={formCreds[field.key] ?? ""}
                onChange={(e) => setFormCreds({ ...formCreds, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="mt-1 w-full rounded bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}

          {/* Scope */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">{scopeInfo.label}</label>
            <input
              type="text"
              value={formScope}
              onChange={(e) => setFormScope(e.target.value)}
              placeholder={scopeInfo.placeholder}
              className="mt-1 w-full rounded bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-sm px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium disabled:opacity-50"
            >
              {saving ? "Connecting..." : "Connect"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="text-sm px-3 py-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
