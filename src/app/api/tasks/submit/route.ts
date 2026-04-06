import { NextRequest, NextResponse } from "next/server";
import { submitTask } from "@/lib/tasks/runner";
import { getKnownAgentIds } from "@/lib/agents/detect";
import { resolveWorkingDirectory } from "@/lib/project/repo-manager";
import path from "path";

const KNOWN_AGENTS = new Set(getKnownAgentIds());
const MAX_PROMPT_LENGTH = 10_000;
const MAX_TITLE_LENGTH = 200;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentId, prompt, title, workingDirectory, linkedIssue, creatorRole, assignedRoles, projectId } = body;

  if (typeof agentId !== "string" || !KNOWN_AGENTS.has(agentId)) {
    return NextResponse.json(
      { error: `Invalid agent. Must be one of: ${[...KNOWN_AGENTS].join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `prompt must be under ${MAX_PROMPT_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Validate workingDirectory if provided
  let cwd: string | undefined;
  if (workingDirectory != null) {
    if (typeof workingDirectory !== "string") {
      return NextResponse.json(
        { error: "workingDirectory must be a string" },
        { status: 400 }
      );
    }
    // Must be absolute path, no path traversal
    const resolved = path.resolve(workingDirectory);
    if (!path.isAbsolute(resolved) || resolved.includes("..")) {
      return NextResponse.json(
        { error: "workingDirectory must be an absolute path" },
        { status: 400 }
      );
    }
    cwd = resolved;
  }

  const safeTitle =
    typeof title === "string" ? title.slice(0, MAX_TITLE_LENGTH) : undefined;

  // Validate linkedIssue if provided
  let issueNumber: number | undefined;
  if (linkedIssue != null) {
    const parsed = Number(linkedIssue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: "linkedIssue must be a positive integer" },
        { status: 400 }
      );
    }
    issueNumber = parsed;
  }

  const safeCreatorRole = typeof creatorRole === "string" ? creatorRole : undefined;
  const safeAssignedRoles = Array.isArray(assignedRoles)
    ? assignedRoles.filter((r: unknown) => typeof r === "string")
    : undefined;
  const safeProjectId = typeof projectId === "string" ? projectId : undefined;

  // If a projectId is provided and no explicit workingDirectory, resolve
  // the project's repo to a local worktree for isolated implementation.
  let resolvedCwd = cwd;
  if (safeProjectId && !resolvedCwd) {
    try {
      const storyId = `task-${Date.now().toString(36)}`;
      const storyTitle = typeof title === "string" ? title : undefined;
      const worktree = resolveWorkingDirectory(safeProjectId, storyId, storyTitle ?? "implementation");
      if (worktree.clonePath) {
        resolvedCwd = worktree.workingDirectory;
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to prepare project repository: ${(err as Error).message}` },
        { status: 500 },
      );
    }
  }

  const result = await submitTask(agentId, prompt.trim(), {
    title: safeTitle,
    workingDirectory: resolvedCwd,
    linkedIssue: issueNumber,
    creatorRole: safeCreatorRole,
    assignedRoles: safeAssignedRoles,
    projectId: safeProjectId,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ taskId: result.taskId });
}
