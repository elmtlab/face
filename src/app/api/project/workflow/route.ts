import { NextRequest, NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/lib/project/workflow";

export async function GET() {
  const workflows = listWorkflows();
  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  let creatorRole: string | undefined;
  let assignedRoles: string[] | undefined;

  try {
    const body = await request.json();
    if (typeof body.creatorRole === "string") creatorRole = body.creatorRole;
    if (Array.isArray(body.assignedRoles)) {
      assignedRoles = body.assignedRoles.filter((r: unknown) => typeof r === "string");
    }
  } catch {
    // No body or invalid JSON — proceed with defaults
  }

  const workflow = createWorkflow({ creatorRole, assignedRoles });
  return NextResponse.json({ workflow });
}
