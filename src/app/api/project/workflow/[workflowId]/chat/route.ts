import { NextResponse } from "next/server";
import {
  loadWorkflow,
  saveWorkflow,
  buildGatheringSystemPrompt,
  buildPlanningPrompt,
  buildImplementationPrompt,
  buildReimplementationPrompt,
  type ChatMessage,
  type GeneratedStory,
  type RequirementRevision,
} from "@/lib/project/workflow";
import { getActiveProvider } from "@/lib/project/manager";
import { submitTask } from "@/lib/tasks/runner";
import { listProjects, getProject } from "@/lib/projects/store";

/**
 * POST /api/project/workflow/:id/chat
 *
 * Body: { message: string }               — user sends a message
 *   or: { action: "ready_to_plan" }       — manually advance from gathering to planning
 *   or: { action: "generate_story" }      — ask AI to produce the story
 *   or: { action: "confirm" }              — approve the story and advance to approved
 *   or: { action: "request_changes" }      — send story back to planning for revision
 *   or: { action: "create_issue" }        — push story to GitHub
 *   or: { action: "implement" }           — trigger implementation
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const workflow = loadWorkflow(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const body = await req.json();

  // ── Chat message (gathering / planning phase) ────────────────
  if (body.message) {
    if (workflow.phase !== "gathering" && workflow.phase !== "planning") {
      return NextResponse.json(
        { error: "Chat is only available during gathering or planning phases" },
        { status: 400 }
      );
    }
    const userMsg: ChatMessage = {
      role: "user",
      content: body.message,
      timestamp: new Date().toISOString(),
    };
    workflow.messages.push(userMsg);

    // Build project context for AI
    const allProjects = listProjects();
    let projectContext: { projectName?: string; repoLink?: string; allProjects?: { id: string; name: string; repoLink: string }[] } | undefined;

    if (workflow.projectId) {
      const proj = getProject(workflow.projectId);
      if (proj) {
        projectContext = { projectName: proj.name, repoLink: proj.repoLink };
      }
    } else if (allProjects.length > 1) {
      // No project assigned yet — give AI the list so it can detect
      projectContext = {
        allProjects: allProjects.map((p) => ({ id: p.id, name: p.name, repoLink: p.repoLink })),
      };
    } else if (allProjects.length === 1) {
      // Single project — auto-assign
      workflow.projectId = allProjects[0].id;
      projectContext = { projectName: allProjects[0].name, repoLink: allProjects[0].repoLink };
    }

    // Call AI for response
    const aiReply = await callAI(
      buildGatheringSystemPrompt(projectContext),
      workflow.messages
    );

    // Check if AI detected a project
    const projectMatch = aiReply.match(/\[PROJECT_ID:([^\]]+)\]/);
    if (projectMatch && !workflow.projectId) {
      const detectedId = projectMatch[1].trim();
      if (allProjects.find((p) => p.id === detectedId)) {
        workflow.projectId = detectedId;
      }
    }

    // Strip project detection tag from the message shown to user
    const cleanReply = aiReply.replace(/\[PROJECT_ID:[^\]]+\]/g, "").trim();

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: cleanReply,
      timestamp: new Date().toISOString(),
    };
    workflow.messages.push(assistantMsg);

    // Check if AI signaled it has enough info
    if (cleanReply.includes("[READY_TO_PLAN]")) {
      workflow.phase = "planning";
    }

    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow, newMessage: assistantMsg });
  }

  // ── Manually advance to planning ─────────────────────────────
  if (body.action === "ready_to_plan") {
    if (workflow.phase !== "gathering") {
      return NextResponse.json(
        { error: "Already past gathering phase" },
        { status: 400 }
      );
    }
    workflow.phase = "planning";
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow });
  }

  // ── Generate story ────────────────────────────────────────────
  if (body.action === "generate_story") {
    if (workflow.phase !== "planning") {
      return NextResponse.json(
        { error: "Story generation is only available in the planning phase" },
        { status: 400 }
      );
    }
    const planPrompt = buildPlanningPrompt(workflow.messages);
    const raw = await callAI(
      "You are a technical writer that outputs only valid JSON.",
      [{ role: "user", content: planPrompt, timestamp: new Date().toISOString() }]
    );

    try {
      // Strip markdown fences if present
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const story: GeneratedStory = JSON.parse(cleaned);
      workflow.generatedStory = story;
      workflow.phase = "review";
      workflow.updatedAt = new Date().toISOString();
      saveWorkflow(workflow);
      return NextResponse.json({ workflow, story });
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI-generated story", raw },
        { status: 500 }
      );
    }
  }

  // ── Create issue in project provider ──────────────────────────
  if (body.action === "create_issue") {
    if (workflow.phase !== "review" && workflow.phase !== "approved") {
      return NextResponse.json(
        { error: "Issues can only be created during review or approved phases" },
        { status: 400 }
      );
    }
    if (!workflow.generatedStory) {
      return NextResponse.json({ error: "No story generated yet" }, { status: 400 });
    }
    const provider = await getActiveProvider();
    if (!provider) {
      return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
    }

    const story = workflow.generatedStory;

    // Build labels: story labels + role tags
    const labels = [...story.labels];
    if (workflow.creatorRole) {
      labels.push(`role:${workflow.creatorRole}`);
    }
    for (const role of workflow.assignedRoles) {
      const tag = `role:${role}`;
      if (!labels.includes(tag)) labels.push(tag);
    }

    const issue = await provider.createIssue({
      title: story.title,
      body: story.body + `\n\n---\n_Priority: ${story.priority} | Effort: ${story.estimatedEffort} | Workflow: ${workflow.id}_`,
      labels,
    });

    workflow.issueId = issue.id;
    workflow.issueUrl = issue.url;
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow, issue });
  }

  // ── Confirm / Request Changes ──────────────────────────────────
  if (body.action === "confirm" || body.action === "request_changes") {
    if (workflow.phase !== "review") {
      return NextResponse.json(
        { error: "Confirm/request changes is only available during the review phase" },
        { status: 400 }
      );
    }

    if (body.action === "confirm") {
      workflow.phase = "approved";
    } else {
      // Go back to planning so the user can refine and re-generate
      const prevStory = workflow.generatedStory;
      workflow.phase = "planning";
      workflow.generatedStory = null;

      let recap = "Changes requested. Here's what was in the previous story for reference:\n\n";
      if (prevStory) {
        recap += `**${prevStory.title}**\n\n${prevStory.body}\n\n`;
        recap += `**Priority:** ${prevStory.priority} · **Effort:** ${prevStory.estimatedEffort}`;
        if (prevStory.labels?.length) {
          recap += ` · **Labels:** ${prevStory.labels.join(", ")}`;
        }
        recap += "\n\n";
      }
      recap += "Please let me know what needs to be changed, and I'll generate a revised story.";

      workflow.messages.push({
        role: "assistant",
        content: recap,
        timestamp: new Date().toISOString(),
      });
    }

    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);

    // Add comment to the issue
    if (workflow.issueId) {
      const provider = await getActiveProvider();
      if (provider) {
        const comment = body.action === "confirm"
          ? "Story confirmed. Ready for implementation."
          : "Changes requested on this story.";
        await provider.addComment(workflow.issueId, comment);
      }
    }

    return NextResponse.json({ workflow });
  }

  // ── Trigger implementation ────────────────────────────────────
  if (body.action === "implement") {
    if (workflow.phase !== "approved") {
      return NextResponse.json(
        { error: "Workflow must be fully approved before implementation" },
        { status: 400 }
      );
    }
    if (!workflow.generatedStory) {
      return NextResponse.json({ error: "Missing story" }, { status: 400 });
    }

    const prompt = buildImplementationPrompt(workflow.generatedStory, workflow.issueUrl ?? undefined);

    const result = await submitTask("claude-code", prompt, {
      title: `Implement: ${workflow.generatedStory.title}`,
      creatorRole: workflow.creatorRole ?? undefined,
      assignedRoles: workflow.assignedRoles.length > 0 ? workflow.assignedRoles : undefined,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    workflow.taskId = result.taskId;
    workflow.phase = "implementing";
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);

    // Comment on the issue that implementation started
    if (workflow.issueId) {
      const provider = await getActiveProvider();
      if (provider) {
        await provider.addComment(
          workflow.issueId,
          `Implementation started automatically.\nFACE Task ID: \`${result.taskId}\``
        );
        // Move issue to in_progress
        await provider.updateIssue(workflow.issueId, { status: "in_progress" });
      }
    }

    return NextResponse.json({ workflow, taskId: result.taskId });
  }

  // ── Update task ID (used for restart) ────────────────────────
  if (body.action === "update_task") {
    if (workflow.phase !== "implementing") {
      return NextResponse.json(
        { error: "Task can only be updated during implementing phase" },
        { status: 400 }
      );
    }
    if (!body.taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }
    workflow.taskId = body.taskId;
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow });
  }

  // ── Reopen workflow (failed task → back to implementing) ──────
  if (body.action === "reopen") {
    if (workflow.phase !== "done") {
      return NextResponse.json(
        { error: "Only done workflows can be reopened" },
        { status: 400 }
      );
    }
    workflow.phase = "implementing";
    workflow.taskId = body.taskId ?? workflow.taskId;
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow });
  }

  // ── Mark workflow complete ─────────────────────────────────────
  if (body.action === "complete") {
    // Already done (e.g. auto-completed by PR merge poller) — return current state
    if (workflow.phase === "done") {
      return NextResponse.json({
        workflow,
        completionStatus: "already_done",
        reason: "Workflow was already in done phase",
      });
    }
    if (workflow.phase !== "implementing") {
      return NextResponse.json(
        { error: "Only implementing workflows can be marked complete" },
        { status: 400 }
      );
    }

    // If this workflow has a linked issue AND a PR, defer to the PR merge poller.
    // The poller will transition to "done" when the PR is merged.
    if (workflow.issueId && workflow.pr) {
      return NextResponse.json({
        workflow,
        completionStatus: "deferred_to_poller",
        reason: "PR exists — waiting for merge detection by poller",
      });
    }

    // Issue exists but no PR — the poller has nothing to poll, so complete directly.
    // This covers: PR creation failed, agent worked on default branch, or PR
    // was merged before metadata was saved.
    workflow.phase = "done";
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);

    const reason = workflow.issueId
      ? "Issue linked but no PR attached — completed directly to avoid stuck state"
      : "No linked issue — completed directly";

    return NextResponse.json({
      workflow,
      completionStatus: "completed",
      reason,
    });
  }

  // ── Update assigned roles ──────────────────────────────────────
  if (body.action === "update_roles") {
    if (Array.isArray(body.assignedRoles)) {
      workflow.assignedRoles = body.assignedRoles.filter(
        (r: unknown) => typeof r === "string"
      );
    }
    if (typeof body.creatorRole === "string") {
      workflow.creatorRole = body.creatorRole;
    }
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow });
  }

  // ── Revise requirement & re-implement ──────────────────────────
  if (body.action === "revise_requirement") {
    if (workflow.phase !== "done" && workflow.phase !== "implementing") {
      return NextResponse.json(
        { error: "Requirement can only be revised after implementation (done or implementing phase)" },
        { status: 400 }
      );
    }
    if (!body.requirement || typeof body.requirement !== "string") {
      return NextResponse.json(
        { error: "requirement text is required" },
        { status: 400 }
      );
    }
    if (!workflow.generatedStory) {
      return NextResponse.json(
        { error: "No previous story to revise from" },
        { status: 400 }
      );
    }

    // 1. Snapshot current state as a revision
    const version = (workflow.revisions?.length ?? 0) + 1;
    const revision: RequirementRevision = {
      version,
      requirement: workflow.generatedStory.body,
      story: { ...workflow.generatedStory },
      taskId: workflow.taskId,
      pr: workflow.pr ? { ...workflow.pr } : null,
      timestamp: new Date().toISOString(),
    };
    if (!workflow.revisions) workflow.revisions = [];
    workflow.revisions.push(revision);

    // 2. Build re-implementation prompt
    const prompt = buildReimplementationPrompt(
      body.requirement,
      workflow.generatedStory,
      workflow.pr,
      workflow.issueUrl ?? undefined,
    );

    // 3. Update the story body with the revised requirement
    workflow.generatedStory = {
      ...workflow.generatedStory,
      body: body.requirement,
    };

    // 4. Spawn a new implementation task
    const result = await submitTask("claude-code", prompt, {
      title: `Revise: ${workflow.generatedStory.title} (v${version + 1})`,
      creatorRole: workflow.creatorRole ?? undefined,
      assignedRoles: workflow.assignedRoles.length > 0 ? workflow.assignedRoles : undefined,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    workflow.taskId = result.taskId;
    workflow.phase = "implementing";
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);

    // Comment on the issue about the revision
    if (workflow.issueId) {
      const provider = await getActiveProvider();
      if (provider) {
        await provider.addComment(
          workflow.issueId,
          `Requirement revised (v${version + 1}). Re-implementation started.\nFACE Task ID: \`${result.taskId}\``
        );
      }
    }

    return NextResponse.json({ workflow, taskId: result.taskId });
  }

  // ── Update project assignment ──────────────────────────────────
  if (body.action === "update_project") {
    if (typeof body.projectId === "string" || body.projectId === null) {
      workflow.projectId = body.projectId;
      workflow.updatedAt = new Date().toISOString();
      saveWorkflow(workflow);
      return NextResponse.json({ workflow });
    }
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── AI helper ──────────────────────────────────────────────────────

async function callAI(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  // Use Claude via the local claude-code binary in print mode
  // This keeps it simple — no API keys needed beyond what's already configured
  const { spawn } = await import("child_process");
  const { readConfig } = await import("@/lib/tasks/file-manager");

  const config = readConfig();
  const agentPath = config?.agents?.["claude-code"]?.path;

  if (!agentPath) {
    throw new Error("Claude Code not configured");
  }

  const fullPrompt = `${systemPrompt}\n\n${messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n")}\n\nAssistant:`;

  return new Promise((resolve, reject) => {
    const child = spawn(agentPath, ["-p", fullPrompt, "--output-format", "json"], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        SHELL: process.env.SHELL,
        LANG: process.env.LANG,
        TERM: process.env.TERM,
        NODE_ENV: process.env.NODE_ENV,
      } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed.result ?? stdout);
      } catch {
        resolve(stdout.trim() || "I encountered an error processing your request.");
      }
    });
    child.on("error", reject);
  });
}
