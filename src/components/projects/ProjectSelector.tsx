"use client";

import { useEffect, useState, useCallback } from "react";

interface Project {
  id: string;
  name: string;
  repoLink: string;
}

interface ProjectSelectorProps {
  /** Current selected project ID */
  value: string | null;
  /** Called when user selects a project */
  onChange: (projectId: string | null) => void;
  /** Show "All Projects" option */
  showAll?: boolean;
  /** Compact variant for inline use */
  compact?: boolean;
}

/**
 * Dropdown selector for switching between projects.
 * Fetches the project list and active project from the API.
 */
export function ProjectSelector({ value, onChange, showAll, compact }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || projects.length === 0) return null;

  // Single project — no need to show selector unless showAll is true
  if (projects.length === 1 && !showAll) return null;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
        compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      {showAll && <option value="">All Projects</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Hook to manage the active project state.
 * Fetches the active project on mount and provides a setter.
 */
export function useActiveProject() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/projects/active").then((r) => r.json()),
    ])
      .then(([projData, activeData]) => {
        setProjects(projData.projects ?? []);
        setActiveProjectId(activeData.project?.id ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const setActive = useCallback(async (id: string | null) => {
    setActiveProjectId(id);
    if (id) {
      await fetch("/api/projects/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
    }
  }, []);

  return { activeProjectId, projects, loaded, setActive };
}
