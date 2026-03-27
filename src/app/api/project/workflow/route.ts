import { NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/lib/project/workflow";

export async function GET() {
  const workflows = listWorkflows();
  return NextResponse.json({ workflows });
}

export async function POST() {
  const workflow = createWorkflow();
  return NextResponse.json({ workflow });
}
