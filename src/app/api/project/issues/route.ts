import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";
import { eventBus } from "@/lib/events/bus";
import { syncTask } from "@/lib/pm-sync/worker";
import { getActivePMSyncProviderName } from "@/lib/pm-sync/manager";
import { getSyncReference } from "@/lib/pm-sync/store";

export async function GET(req: Request) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const url = new URL(req.url);
  const filter = {
    status: url.searchParams.get("status")?.split(",") as never[] | undefined,
    assignee: url.searchParams.get("assignee") ?? undefined,
    label: url.searchParams.get("label") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  };

  const allIssues = await provider.listIssues(filter);

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") ?? "0", 10) || 0));

  if (limit > 0) {
    const offset = (page - 1) * limit;
    const issues = allIssues.slice(offset, offset + limit);
    return NextResponse.json({ issues, total: allIssues.length, page, limit });
  }

  return NextResponse.json({ issues: allIssues });
}

export async function POST(req: Request) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const body = await req.json();
  const issue = await provider.createIssue(body);
  eventBus.emit("issue_created", { issue });

  // Auto-sync to configured PM tool (non-blocking)
  if (getActivePMSyncProviderName()) {
    // Look up the synced PM project to link the task
    const projectRef = getSyncReference(body.projectId ?? "");
    syncTask({
      faceId: issue.id,
      externalProjectId: projectRef?.externalId ?? "",
      title: issue.title,
      description: issue.body,
      priority: issue.priority,
      status: issue.status,
      labels: issue.labels?.map((l: { name: string }) => l.name),
    });
  }

  return NextResponse.json({ issue });
}
