import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";
import { eventBus } from "@/lib/events/bus";

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

  const issues = await provider.listIssues(filter);
  return NextResponse.json({ issues });
}

export async function POST(req: Request) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const body = await req.json();
  const issue = await provider.createIssue(body);
  eventBus.emit("issue_created", { issue });
  return NextResponse.json({ issue });
}
