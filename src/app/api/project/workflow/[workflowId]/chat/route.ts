import { NextResponse } from "next/server";
import {
  loadWorkflow,
  saveWorkflow,
  buildGatheringSystemPrompt,
  buildPlanningPrompt,
  type ChatMessage,
  type GeneratedStory,
} from "@/lib/project/workflow";
import { getActiveProvider } from "@/lib/project/manager";
import { submitTask } from "@/lib/tasks/runner";
import { buildImplementationPrompt } from "@/lib/project/workflow";

/**
 * POST /api/project/workflow/:id/chat
 *
 * Body: { message: string }               — user sends a message
 *   or: { action: "ready_to_plan" }       — manually advance from gathering to planning
 *   or: { action: "generate_story" }      — ask AI to produce the story
 *   or: { action: "approve", role: "pm"|"eng" }
 *   or: { action: "reject", role: "pm"|"eng" }
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

    // Call AI for response
    const aiReply = await callAI(
      buildGatheringSystemPrompt(),
      workflow.messages
    );

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: aiReply,
      timestamp: new Date().toISOString(),
    };
    workflow.messages.push(assistantMsg);

    // Check if AI signaled it has enough info
    if (aiReply.includes("[READY_TO_PLAN]")) {
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
    const issue = await provider.createIssue({
      title: story.title,
      body: story.body + `\n\n---\n_Priority: ${story.priority} | Effort: ${story.estimatedEffort} | Workflow: ${workflow.id}_`,
      labels: story.labels,
    });

    workflow.issueId = issue.id;
    workflow.issueUrl = issue.url;
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);
    return NextResponse.json({ workflow, issue });
  }

  // ── Approval ──────────────────────────────────────────────────
  if (body.action === "approve" || body.action === "reject") {
    if (workflow.phase !== "review") {
      return NextResponse.json(
        { error: "Approvals are only available during the review phase" },
        { status: 400 }
      );
    }
    const role = body.role as "pm" | "eng";
    const status = body.action === "approve" ? "approved" : "rejected";

    if (role === "pm") workflow.pmApproval = status;
    if (role === "eng") workflow.engApproval = status;

    // If both approved, advance to approved phase
    if (workflow.pmApproval === "approved" && workflow.engApproval === "approved") {
      workflow.phase = "approved";
    }

    // If either rejected, go back to planning so the user can refine and re-generate
    if (status === "rejected") {
      // Capture the previous story before clearing it
      const prevStory = workflow.generatedStory;
      workflow.phase = "planning";
      workflow.generatedStory = null;
      workflow.pmApproval = "pending";
      workflow.engApproval = "pending";

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

    // Add approval comment to the issue
    if (workflow.issueId) {
      const provider = await getActiveProvider();
      if (provider) {
        const action = status === "approved" ? "approved" : "requested changes on";
        await provider.addComment(
          workflow.issueId,
          `**${role.toUpperCase()}** ${action} this story.${
            workflow.pmApproval === "approved" && workflow.engApproval === "approved"
              ? "\n\n Both PM and Engineering have approved. Ready for implementation."
              : ""
          }`
        );
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
    if (workflow.phase !== "implementing") {
      return NextResponse.json(
        { error: "Only implementing workflows can be marked complete" },
        { status: 400 }
      );
    }
    workflow.phase = "done";
    workflow.updatedAt = new Date().toISOString();
    saveWorkflow(workflow);

    // Close the linked GitHub issue
    if (workflow.issueId) {
      const provider = await getActiveProvider();
      if (provider) {
        try {
          await provider.updateIssue(workflow.issueId, { status: "done" });
          await provider.addComment(workflow.issueId, "Implementation completed. Closing issue.");
        } catch {
          // best-effort
        }
      }
    }

    return NextResponse.json({ workflow });
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
