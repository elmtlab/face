"use client";

import { useProjectContext } from "@/lib/projects/ProjectContext";

interface ProjectFilterSelectProps {
  /** Override value (if not provided, reads from context) */
  value?: string;
  /** Override onChange (if not provided, writes to context) */
  onChange?: (value: string) => void;
}

/**
 * Shared project filter dropdown. Shows "All Projects" plus each project.
 * By default reads/writes to the global filterProjectId in ProjectContext.
 * Pass value/onChange to override for local state usage.
 */
export function ProjectFilterSelect({ value, onChange }: ProjectFilterSelectProps) {
  const { projects, filterProjectId, setFilterProjectId } = useProjectContext();

  if (projects.length < 2) return null;

  const currentValue = value ?? filterProjectId;
  const handleChange = onChange ?? setFilterProjectId;

  return (
    <select
      value={currentValue}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-600"
    >
      <option value="all">All Projects</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
