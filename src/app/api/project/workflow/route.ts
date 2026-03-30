import { NextRequest, NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/lib/project/workflow";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  let workflows = listWorkflows();

  // Filter by project if requested
  if (projectId) {
    workflows = workflows.filter((w) => w.projectId === projectId);
  }

  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  let creatorRole: string | undefined;
  let assignedRoles: string[] | undefined;
  let projectId: string | undefined;

  try {
    const body = await request.json();
    if (typeof body.creatorRole === "string") creatorRole = body.creatorRole;
    if (typeof body.projectId === "string") projectId = body.projectId;
    if (Array.isArray(body.assignedRoles)) {
      assignedRoles = body.assignedRoles.filter((r: unknown) => typeof r === "string");
    }
  } catch {
    // No body or invalid JSON — proceed with defaults
  }

  const workflow = createWorkflow({ creatorRole, assignedRoles, projectId });
  return NextResponse.json({ workflow });
}
