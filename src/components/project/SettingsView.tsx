"use client";

import { useEffect, useState } from "react";
import type { ProjectProviderConfig } from "@/lib/project/types";

interface ProviderState {
  providers: ProjectProviderConfig[];
  active: string | null;
  available: string[];
}

export function SettingsView() {
  const [state, setState] = useState<ProviderState>({
    providers: [],
    active: null,
    available: [],
  });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchProviders = () => {
    fetch("/api/project/providers")
      .then((r) => r.json())
      .then(setState)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleSetActive = async (name: string) => {
    await fetch("/api/project/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setActive", name }),
    });
    fetchProviders();
  };

  const handleRemove = async (name: string) => {
    await fetch("/api/project/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", name }),
    });
    fetchProviders();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-1">Settings</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Connect project management tools. Currently supported: GitHub. Coming soon: Jira, Linear.
      </p>

      {/* Existing providers */}
      {state.providers.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-zinc-400">Connected Providers</h3>
          {state.providers.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{p.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {p.type}
                  </span>
                  {state.active === p.name && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{p.scope}</p>
              </div>
              <div className="flex gap-2">
                {state.active !== p.name && (
                  <button
                    onClick={() => handleSetActive(p.name)}
                    className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  >
                    Set Active
                  </button>
                )}
                <button
                  onClick={() => handleRemove(p.name)}
                  className="text-xs px-2 py-1 rounded bg-red-600/10 text-red-400 hover:bg-red-600/20"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add provider */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          + Add Provider
        </button>
      ) : (
        <AddProviderForm
          available={state.available}
          onAdded={() => {
            setShowAdd(false);
            fetchProviders();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function AddProviderForm({
  available,
  onAdded,
  onCancel,
}: {
  available: string[];
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState(available[0] ?? "github");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scopePlaceholder: Record<string, string> = {
    github: "owner/repo",
    jira: "project-key",
    linear: "team-slug",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/project/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          config: {
            type,
            name: name || `${type}-${scope}`,
            scope,
            credentials: { token },
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onAdded();
      } else {
        setError(data.error ?? "Connection failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3"
    >
      <h3 className="text-sm font-medium text-zinc-300">Add Provider</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200"
          >
            {available.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Display Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
            className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Scope</label>
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder={scopePlaceholder[type] ?? "project-identifier"}
          className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600"
          required
        />
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Access Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_... or personal access token"
          className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600"
          required
        />
        <p className="text-[10px] text-zinc-600 mt-1">
          {type === "github" && "Needs repo scope. Create at GitHub → Settings → Developer settings → Tokens"}
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-600/10 px-3 py-2 rounded">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !scope || !token}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </form>
  );
}
