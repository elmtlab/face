"use client";

import { useEffect, useState, useCallback } from "react";
import { useProjectContext } from "@/lib/projects/ProjectContext";

interface Project {
  id: string;
  name: string;
  repoLink: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Full project management UI: list, add, edit, remove projects.
 * Used as a widget or standalone view in role dashboards.
 */
export function ProjectManager() {
  const { activeProjectId, setActive: setGlobalActive } = useProjectContext();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState("");
  const [formRepoLink, setFormRepoLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const projRes = await fetch("/api/projects");
      const projData = await projRes.json();
      setProjects(projData.projects ?? []);
    } catch {
      setError("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const openAddForm = () => {
    setEditingProject(null);
    setFormName("");
    setFormRepoLink("");
    setShowForm(true);
    setError(null);
  };

  const openEditForm = (project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    setFormRepoLink(project.repoLink);
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError("Project name is required");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      if (editingProject) {
        const res = await fetch(`/api/projects/${editingProject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), repoLink: formRepoLink.trim() }),
        });
        if (!res.ok) throw new Error("Failed to update project");
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), repoLink: formRepoLink.trim() }),
        });
        if (!res.ok) throw new Error("Failed to create project");
      }
      setShowForm(false);
      setEditingProject(null);
      await fetchProjects();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      setConfirmDelete(null);
      await fetchProjects();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await setGlobalActive(id);
    } catch {
      setError("Failed to set active project");
    }
  };

  const handleMigrate = async () => {
    try {
      const res = await fetch("/api/projects/migrate", { method: "POST" });
      const data = await res.json();
      if (data.migrated > 0) {
        setError(null);
      }
    } catch {
      setError("Migration failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500 animate-pulse text-sm">
        Loading projects...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Projects</h3>
        <button
          onClick={openAddForm}
          className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
        >
          + Add Project
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-600/10 px-3 py-1.5 rounded">{error}</p>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-medium text-zinc-300">
            {editingProject ? "Edit Project" : "New Project"}
          </h4>
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">Project Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="My Project"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-200 placeholder-zinc-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">Repository Link</label>
            <input
              type="text"
              value={formRepoLink}
              onChange={(e) => setFormRepoLink(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-200 placeholder-zinc-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : editingProject ? "Update" : "Create"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingProject(null); }}
              className="px-4 py-2 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      {projects.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-zinc-500 text-sm mb-3">No projects yet</p>
          <button
            onClick={openAddForm}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            return (
              <div
                key={project.id}
                className={`bg-zinc-900 border rounded-lg p-3 ${
                  isActive ? "border-indigo-600/50" : "border-zinc-800"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {project.name}
                      </span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 border border-indigo-600/30">
                          Active
                        </span>
                      )}
                    </div>
                    {project.repoLink && (
                      <a
                        href={project.repoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-zinc-500 hover:text-indigo-400 truncate block"
                      >
                        {project.repoLink}
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => handleSetActive(project.id)}
                        className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => openEditForm(project)}
                      className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                      Edit
                    </button>
                    {confirmDelete === project.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="text-[10px] px-2 py-1 rounded bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(project.id)}
                        className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-red-400 hover:bg-red-600/10 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Migration button — show when there are projects */}
          <button
            onClick={handleMigrate}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Migrate unassigned requirements to active project
          </button>
        </div>
      )}
    </div>
  );
}
