"use client";

import { useState } from "react";
import { USER_ROLES, ROLE_LABELS, type UserRole } from "@/lib/user/types";

interface RoleSelectorProps {
  onComplete: (role: UserRole) => void;
}

const ROLE_ICONS: Record<UserRole, string> = {
  engineer: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  product_manager: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7",
  project_manager: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  hr: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  accountant: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  banker: "M3 6l9-4 9 4M3 6v14l9 4 9-4V6M3 6l9 4m0 0l9-4m-9 4v14",
  sales: "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  designer: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  other: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

export function RoleSelector({ onComplete }: RoleSelectorProps) {
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selected }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.profile) {
        onComplete(selected);
      } else {
        setError("Unexpected response from server");
      }
    } catch (err) {
      setError(`Failed to save profile: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    setSaving(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">
            Welcome to FACE
          </h1>
          <p className="text-sm text-zinc-400">
            Select your role so we can tailor the interface to your needs.
            <br />
            <span className="text-zinc-500">
              The UI will adapt over time based on how you use it.
            </span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          {USER_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => setSelected(role)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                selected === role
                  ? "border-blue-500 bg-blue-950/40 ring-1 ring-blue-500/50"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900"
              }`}
            >
              <svg
                className={`h-6 w-6 ${
                  selected === role ? "text-blue-400" : "text-zinc-500"
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={ROLE_ICONS[role]}
                />
              </svg>
              <span
                className={`text-xs font-medium ${
                  selected === role ? "text-blue-300" : "text-zinc-400"
                }`}
              >
                {ROLE_LABELS[role]}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-950/50 px-4 py-2.5 text-sm text-red-300 text-center">
            {error}
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="rounded-lg bg-blue-600 px-8 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-30"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
