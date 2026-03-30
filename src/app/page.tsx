"use client";

import { useState, useEffect } from "react";
import { SetupFlow } from "@/components/setup/SetupFlow";
import { AdaptiveShell } from "@/components/layout/AdaptiveShell";
import { UserProvider } from "@/components/user/UserContext";
import { ProjectProvider } from "@/lib/projects/ProjectContext";

type AppState = "loading" | "setup" | "ready";

export default function Home() {
  const [state, setState] = useState<AppState>("loading");

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        setState(data.needsSetup || !data.hasAnyAgent ? "setup" : "ready");
      })
      .catch(() => setState("setup"));
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
            <path d="M8 2a6 6 0 014.24 1.76" />
          </svg>
          <p className="text-sm text-zinc-500">Detecting AI agents...</p>
        </div>
      </div>
    );
  }

  if (state === "setup") {
    return <SetupFlow onComplete={() => setState("ready")} />;
  }

  return (
    <ProjectProvider>
      <UserProvider>
        <AdaptiveShell />
      </UserProvider>
    </ProjectProvider>
  );
}
