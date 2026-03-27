import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";

export async function GET(req: Request) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? "__all__";
  const project = await provider.getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Hydrate columns with full issue data
  const issues = await provider.listIssues();
  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const columns = project.columns
    .filter((c) => c.issueIds.length > 0 || ["todo", "in_progress", "done"].includes(c.status))
    .map((c) => ({
      ...c,
      issues: c.issueIds.map((id) => issueMap.get(id)).filter(Boolean),
    }));

  return NextResponse.json({ project: { ...project, columns } });
}
