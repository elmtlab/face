import { NextResponse } from "next/server";
import { getAllProviders } from "@/lib/project/manager";
import type { Column } from "@/lib/project/types";

export async function GET(req: Request) {
  const providers = await getAllProviders();

  // No providers configured — return empty board so the UI renders gracefully
  if (providers.length === 0) {
    return NextResponse.json({
      project: {
        id: "__empty__",
        name: "Board",
        description: "",
        columns: [
          { id: "todo", name: "To Do", status: "todo", issueIds: [], issues: [] },
          { id: "in_progress", name: "In Progress", status: "in_progress", issueIds: [], issues: [] },
          { id: "done", name: "Done", status: "done", issueIds: [], issues: [] },
        ],
        url: "",
      },
    });
  }

  const url = new URL(req.url);
  const providerFilter = url.searchParams.get("provider");

  // Aggregate columns and issues across all (or a filtered) provider
  const allColumns: (Column & { issues?: unknown[] })[] = [];
  for (const provider of providers) {
    if (providerFilter && provider.displayName !== providerFilter) continue;
    try {
      const projectId = url.searchParams.get("projectId") ?? "__all__";
      const project = await provider.getProject(projectId);
      if (!project) continue;

      const issues = await provider.listIssues();
      const issueMap = new Map(issues.map((i) => [i.id, i]));
      const columns = project.columns
        .filter((c) => c.issueIds.length > 0 || ["todo", "in_progress", "done"].includes(c.status))
        .map((c) => ({
          ...c,
          issues: c.issueIds.map((id) => issueMap.get(id)).filter(Boolean),
        }));
      allColumns.push(...columns);
    } catch {
      // Skip providers that fail
    }
  }

  // Merge columns with the same status into single columns
  const mergedMap = new Map<string, Column & { issues: unknown[] }>();
  for (const col of allColumns) {
    const existing = mergedMap.get(col.status);
    if (existing) {
      existing.issueIds.push(...col.issueIds);
      existing.issues.push(...((col as Column & { issues?: unknown[] }).issues ?? []));
    } else {
      mergedMap.set(col.status, {
        ...col,
        issues: ((col as Column & { issues?: unknown[] }).issues as unknown[]) ?? [],
      });
    }
  }
  const columns = [...mergedMap.values()];

  return NextResponse.json({ project: { columns }, columns });
}
