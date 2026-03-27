import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";
import { eventBus } from "@/lib/events/bus";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const { issueId } = await params;
  const issue = await provider.getIssue(issueId);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }
  return NextResponse.json({ issue });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const { issueId } = await params;
  const body = await req.json();
  const issue = await provider.updateIssue(issueId, body);
  eventBus.emit("issue_updated", { issue });
  return NextResponse.json({ issue });
}
