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

  // ── Chat message (gathering phase) ────────────────────────────
  if (body.message) {
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

  // ── Generate story ────────────────────────────────────────────
  if (body.action === "generate_story") {
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
    const role = body.role as "pm" | "eng";
    const status = body.action === "approve" ? "approved" : "rejected";

    if (role === "pm") workflow.pmApproval = status;
    if (role === "eng") workflow.engApproval = status;

    // If both approved, advance to approved phase
    if (workflow.pmApproval === "approved" && workflow.engApproval === "approved") {
      workflow.phase = "approved";
    }

    // If either rejected, go back to review
    if (status === "rejected") {
      workflow.phase = "review";
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
    if (!workflow.generatedStory || !workflow.issueUrl) {
      return NextResponse.json({ error: "Missing story or issue" }, { status: 400 });
    }

    const prompt = buildImplementationPrompt(workflow.generatedStory, workflow.issueUrl);

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
