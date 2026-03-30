import { NextResponse } from "next/server";
import { listWorkflows, saveWorkflow } from "@/lib/project/workflow";
import { listProjects, getActiveProjectId } from "@/lib/projects/store";

/**
 * POST /api/projects/migrate
 *
 * Migrates existing workflows that have no projectId to the active project
 * (or the first project if no active project is set). This is a one-time
 * migration for transitioning from single-project to multi-project.
 */
export async function POST() {
  const projects = listProjects();
  if (projects.length === 0) {
    return NextResponse.json({ migrated: 0, message: "No projects exist yet" });
  }

  const activeId = getActiveProjectId();
  const targetProjectId = activeId ?? projects[0].id;

  const workflows = listWorkflows();
  let migrated = 0;

  for (const w of workflows) {
    if (!w.projectId) {
      w.projectId = targetProjectId;
      w.updatedAt = new Date().toISOString();
      saveWorkflow(w);
      migrated++;
    }
  }

  return NextResponse.json({ migrated, targetProjectId });
}
