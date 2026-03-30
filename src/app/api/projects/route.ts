import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/projects/store";

/** GET /api/projects — list all projects */
export async function GET() {
  const projects = listProjects();
  return NextResponse.json({ projects });
}

/** POST /api/projects — create a new project */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const repoLink = typeof body.repoLink === "string" ? body.repoLink.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const project = createProject(name, repoLink);
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
