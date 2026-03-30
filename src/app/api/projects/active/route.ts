import { NextRequest, NextResponse } from "next/server";
import { getActiveProject, setActiveProjectId } from "@/lib/projects/store";

/** GET /api/projects/active — get the currently active project */
export async function GET() {
  const project = getActiveProject();
  return NextResponse.json({ project });
}

/** PUT /api/projects/active — set the active project */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = typeof body.projectId === "string" ? body.projectId : null;

    const ok = setActiveProjectId(projectId);
    if (!ok) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, activeProjectId: projectId });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
