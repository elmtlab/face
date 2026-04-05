"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

interface Project {
  id: string;
  name: string;
  repoLink: string;
}

interface ProjectContextValue {
  activeProjectId: string | null;
  /** Project filter for views — "all" means show data from every project. */
  filterProjectId: string;
  projects: Project[];
  loaded: boolean;
  setActive: (id: string | null) => Promise<void>;
  setFilterProjectId: (id: string) => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProjectId: null,
  filterProjectId: "all",
  projects: [],
  loaded: false,
  setActive: async () => {},
  setFilterProjectId: () => {},
  refreshProjects: async () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
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

  const refreshProjects = useCallback(async () => {
    try {
      const [projData, activeData] = await Promise.all([
        fetch("/api/projects").then((r) => r.json()),
        fetch("/api/projects/active").then((r) => r.json()),
      ]);
      setProjects(projData.projects ?? []);
      setActiveProjectId(activeData.project?.id ?? null);
    } catch {
      // best-effort
    }
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

  return (
    <ProjectContext.Provider value={{ activeProjectId, filterProjectId, projects, loaded, setActive, setFilterProjectId, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

/**
 * Hook to access the global project context.
 * Must be used within a ProjectProvider.
 */
export function useProjectContext() {
  return useContext(ProjectContext);
}
