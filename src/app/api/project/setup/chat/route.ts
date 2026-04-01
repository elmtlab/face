import { NextResponse } from "next/server";
import {
  createSession,
  loadSession,
  saveSession,
  findActiveSession,
  sanitizeForClient,
  type SetupSessionState,
} from "@/lib/projects/setup";
import { createProject, setActiveProjectId } from "@/lib/projects/store";
import { addProvider, listProviderConfigs } from "@/lib/project/manager";
import { scaffoldProject, type ScaffoldResult } from "@/lib/projects/scaffold";
import { readConfig } from "@/lib/tasks/file-manager";

/**
 * GET /api/project/setup/chat
 *
 * Returns the active (incomplete) setup session, or null if none exists.
 */
export async function GET() {
  const session = findActiveSession();
  return NextResponse.json({
    session: session ? sanitizeForClient(session) : null,
  });
}

/**
 * POST /api/project/setup/chat
 *
 * Body:
 *   { action: "start" }                     — Start a new session (or resume active)
 *   { sessionId: string, message: string }  — Send a chat message (returns SSE stream)
 *   { sessionId: string, action: "scaffold" } — Trigger auto-scaffolding
 *   { sessionId: string, action: "skip_scaffold" } — Skip scaffolding
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Start or resume a session
    if (body.action === "start") {
      const existing = findActiveSession();
      if (existing) {
        return NextResponse.json({ session: sanitizeForClient(existing) });
      }
      const session = createSession();
      const greeting = buildGreeting();
      session.messages.push({
        role: "assistant",
        content: greeting,
        timestamp: new Date().toISOString(),
      });
      saveSession(session);
      return NextResponse.json({ session: sanitizeForClient(session) });
    }

    // All other actions require sessionId
    const { sessionId, message, action } = body;
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = loadSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Handle scaffold action
    if (action === "scaffold") {
      return handleScaffold(session, true);
    }
    if (action === "skip_scaffold") {
      return handleScaffold(session, false);
    }

    // Handle chat message — stream the AI response
    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Add user message
    session.messages.push({
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString(),
    });
    saveSession(session);

    return streamAgentResponse(session, message.trim());
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Internal error" },
      { status: 500 },
    );
  }
}

// ── Greeting ────────────────────────────────────────────────────────

function buildGreeting(): string {
  const existing = listProviderConfigs();
  if (existing.length > 0) {
    return `Welcome! I'll help you set up a new project. I see you already have ${existing.length} provider connection(s) configured.\n\nDo you have an **existing project** in an external PM tool (like GitHub Projects, Linear, or Jira) that you'd like to connect? Or would you like to **create a new project** from scratch?\n\nYou can also just describe your project and I'll figure out the best way to set it up.`;
  }
  return "Welcome! I'll help you set up your project in FACE.\n\nTell me about your project — do you have an existing repository or PM tool you'd like to connect? Or would you like to create a new project from scratch?\n\nFeel free to describe what you're working on and I'll guide you through the setup.";
}

// ── Agent-driven conversation ──────────────────────────────────────

function buildSystemPrompt(session: SetupSessionState): string {
  const existingProviders = listProviderConfigs();

  return `You are a setup assistant for FACE, a project management tool. You're helping a user set up a new project through a conversational flow. Be friendly, concise, and helpful.

## YOUR CAPABILITIES
- You have direct access to the user's filesystem, git repos, and environment
- You can validate whether directories, repos, and files actually exist
- You can inspect git remotes, branches, and project structure
- Use these capabilities proactively to help the user — don't just ask, verify!

## CONTEXT
- Already connected providers: ${existingProviders.length > 0 ? existingProviders.map((p) => `${p.name} (${p.type})`).join(", ") : "none"}
- Current session phase: ${session.phase}
- User chose existing project: ${session.hasExistingProject ?? "not decided yet"}
- Chosen PM tool: ${session.pmTool ?? "not chosen yet"}
- Project name: ${session.projectInfo.name ?? "not set"}
- Project description: ${session.projectInfo.description ?? "not set"}
- Project goals: ${session.projectInfo.goals ?? "not set"}
- Provider scope: ${session.scope ?? "not set"}
- Has credentials: ${session.credentials ? "yes (stored securely)" : "no"}

## WHAT YOU NEED TO COLLECT
To complete project setup, you need to gather this information:
1. **Project type**: Is this connecting an existing external project, or creating a new one?
2. **Project name**: A name for the project
3. **Description** (optional): What the project is about
4. **Goals** (optional): Main objectives
5. **PM tool**: One of: github, linear, jira, or local (FACE-only, no external tool)
6. **Credentials** (if external tool):
   - GitHub: repository (owner/repo) + personal access token (starts with ghp_ or github_pat_)
   - Linear: team ID + API key
   - Jira: base URL (*.atlassian.net) + project key + email + API token

## VALIDATION GUIDELINES
- If the user mentions a directory path, CHECK if it exists on the filesystem
- If the user mentions a git repo, CHECK the git remotes to extract the GitHub owner/repo
- If the user gives a vague project description, look at the directory structure and README to suggest a better one
- If the user gives a repo URL, extract the owner/repo from it
- If something looks like a typo or partial input, ask a clarifying question rather than failing silently

## HOW TO OUTPUT ACTIONS
When you have enough information to perform a setup action, include a fenced code block with the language tag \`setup-action\` in your response. The block must contain valid JSON.

### To create a local project (no external PM tool):
\`\`\`setup-action
{"action":"create_project","name":"Project Name","description":"optional description","goals":"optional goals","repoLink":"optional repo URL","pmTool":"local"}
\`\`\`

### To connect an external provider and create the project:
\`\`\`setup-action
{"action":"connect_provider","name":"Project Name","description":"optional description","goals":"optional goals","repoLink":"https://github.com/owner/repo","pmTool":"github","scope":"owner/repo","credentials":{"token":"the-token-value"}}
\`\`\`

For Linear:
\`\`\`setup-action
{"action":"connect_provider","name":"Project Name","pmTool":"linear","scope":"team-id","credentials":{"token":"lin_api_..."}}
\`\`\`

For Jira:
\`\`\`setup-action
{"action":"connect_provider","name":"Project Name","pmTool":"jira","scope":"PROJECT_KEY","credentials":{"baseUrl":"https://team.atlassian.net","email":"user@example.com","token":"..."}}
\`\`\`

## RULES
- Be conversational, not robotic. Adapt to what the user says.
- If the user's input is vague or incomplete, ask a smart follow-up question. Don't fail silently.
- If you can infer information (e.g., project name from a repo name), suggest it and confirm.
- Ask ONE thing at a time when collecting credentials.
- NEVER echo back tokens or secrets in your visible text.
- When you discover something about the user's codebase (e.g., by reading git config), share what you found and suggest how to proceed.
- Keep responses short — 1-4 sentences plus any necessary options.
- Only output a setup-action block when you have ALL required fields for that action.
- If credentials fail validation, explain what went wrong and what the user should check.
- After outputting a setup-action block, add a brief message like "Let me set that up for you..." so the user knows something is happening.`;
}

function streamAgentResponse(session: SetupSessionState, userMessage: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may be closed
        }
      };

      try {
        let agentReply = await callAgent(session, userMessage, (chunk: string) => {
          send("chunk", { text: chunk });
        });

        // If agent returned empty/whitespace, use fallback
        if (!agentReply.trim()) {
          console.warn("[setup/chat] Agent returned empty response, using fallback.");
          agentReply = fallbackResponse(session);
          send("chunk", { text: agentReply });
        }

        // Parse the reply for setup-action blocks
        const actionResult = await executeActions(session, agentReply);

        // Clean action blocks from the visible reply
        const cleanReply = agentReply.replace(/```setup-action\n[\s\S]*?\n```/g, "").trim();

        // Build final assistant message
        let finalReply = cleanReply;
        if (actionResult) {
          finalReply += "\n\n" + actionResult;
        }

        // Add assistant message to session
        session.messages.push({
          role: "assistant",
          content: finalReply,
          timestamp: new Date().toISOString(),
        });
        saveSession(session);

        send("done", { session: sanitizeForClient(session) });
      } catch (err) {
        send("error", { error: (err as Error).message || "Agent error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Invoke the Claude Code agent with the full conversation context.
 * Streams text chunks via the onChunk callback.
 * Returns the complete response text.
 */
async function callAgent(
  session: SetupSessionState,
  _userMessage: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const { spawn } = await import("child_process");

  const config = readConfig();
  const agentPath = config?.agents?.["claude-code"]?.path;

  if (!agentPath) {
    console.warn(
      "[setup/chat] No Claude Code agent path configured at config.agents.claude-code.path. " +
        "Falling back to heuristic responses. Set the agent path in your config to enable AI-driven setup.",
    );
    return fallbackResponse(session);
  }

  const systemPrompt = buildSystemPrompt(session);

  // Build conversation history for the prompt
  const conversationHistory = session.messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const fullPrompt = `${systemPrompt}\n\n## CONVERSATION SO FAR\n${conversationHistory}\n\nRespond to the user's latest message. Remember: validate against the real environment when possible, be helpful with imprecise input, and output a setup-action block only when you have all required information.`;

  return new Promise((resolve) => {
    const child = spawn(agentPath, ["-p", fullPrompt, "--output-format", "stream-json"], {
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

    let fullText = "";
    let lineBuf = "";

    child.stdout?.on("data", (data: Buffer) => {
      lineBuf += data.toString();

      let newlineIdx: number;
      while ((newlineIdx = lineBuf.indexOf("\n")) !== -1) {
        const line = lineBuf.slice(0, newlineIdx).trim();
        lineBuf = lineBuf.slice(newlineIdx + 1);
        if (!line) continue;

        try {
          const evt = JSON.parse(line) as Record<string, unknown>;

          if (evt.type === "assistant") {
            const msg = evt.message as { content?: Array<Record<string, unknown>> } | undefined;
            if (msg?.content) {
              for (const block of msg.content) {
                if (block.type === "text") {
                  const text = block.text as string;
                  if (text) {
                    // Send incremental chunks
                    const newText = text.slice(fullText.length);
                    if (newText) {
                      fullText = text;
                      onChunk(newText);
                    }
                  }
                }
              }
            }
          } else if (evt.type === "result") {
            const result = evt.result as string;
            if (result && result.length > fullText.length) {
              const remaining = result.slice(fullText.length);
              if (remaining) onChunk(remaining);
              fullText = result;
            }
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    });

    child.on("close", (code) => {
      if (fullText) {
        resolve(fullText);
      } else {
        if (code !== 0) {
          console.error(
            `[setup/chat] Agent process exited with code ${code} and produced no output.`,
          );
        }
        resolve(fallbackResponse(session));
      }
    });

    child.on("error", (err) => {
      console.error("[setup/chat] Agent process failed to start:", err.message);
      resolve(fallbackResponse(session));
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      if (!fullText) resolve(fallbackResponse(session));
    }, 120_000);
  });
}

/**
 * Parse agent response for setup-action blocks and execute them.
 * Returns a status message to append to the reply, or null.
 */
async function executeActions(session: SetupSessionState, agentReply: string): Promise<string | null> {
  const actionMatch = agentReply.match(/```setup-action\n([\s\S]*?)\n```/);
  if (!actionMatch) return null;

  let actionData: Record<string, unknown>;
  try {
    actionData = JSON.parse(actionMatch[1]);
  } catch {
    return "I tried to set up the project but encountered a configuration error. Let me try again — could you confirm the details?";
  }

  const action = actionData.action as string;
  const name = (actionData.name as string) ?? "Untitled Project";
  const description = (actionData.description as string) ?? "";
  const goals = (actionData.goals as string) ?? "";
  const repoLink = (actionData.repoLink as string) ?? "";
  const pmTool = (actionData.pmTool as string) ?? "local";

  // Update session with extracted info
  session.projectInfo.name = name;
  if (description) session.projectInfo.description = description;
  if (goals) session.projectInfo.goals = goals;
  if (repoLink) session.projectInfo.repoLink = repoLink;
  session.pmTool = pmTool as "github" | "linear" | "jira" | "local";

  if (action === "create_project") {
    // Create a local FACE project
    const project = createProject(name, repoLink);
    setActiveProjectId(project.id);
    session.createdProjectId = project.id;
    session.phase = "complete";
    saveSession(session);
    return `Your project **${name}** has been created and set as active! You're all set to start managing requirements and tasks in FACE.`;
  }

  if (action === "connect_provider") {
    const scope = (actionData.scope as string) ?? "";
    const credentials = (actionData.credentials as Record<string, string>) ?? {};

    session.scope = scope;
    session.credentials = credentials;

    // Create the FACE project first
    const project = createProject(name, repoLink);
    setActiveProjectId(project.id);
    session.createdProjectId = project.id;

    // Connect the provider
    const providerConfig = {
      type: pmTool,
      name: scope || name,
      scope,
      credentials: { ...credentials },
    };

    const result = await addProvider(providerConfig);
    if (!result.ok) {
      // Connection failed — let user retry
      session.phase = "collecting";
      session.credentials = null;
      saveSession(session);
      return `Connection failed: ${result.error}\n\nPlease double-check your credentials and try again.`;
    }

    session.connectedProviderName = providerConfig.name;

    // Ask about scaffolding
    session.phase = "scaffolding";
    saveSession(session);

    const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : "Jira";
    return `Connected to ${toolName} successfully!\n\nWould you like me to set up an initial project structure? This includes:\n- Default **labels** (bug, enhancement, priority levels, status labels)\n- Default **milestones** (MVP, v1.0)\n\nSay **"yes"** to auto-create this structure, or **"no"** to skip it.`;
  }

  return null;
}

/**
 * Fallback response when the Claude Code agent is not available.
 * Uses simple heuristics to continue the conversation.
 */
function fallbackResponse(session: SetupSessionState): string {
  const lastUserMsg = [...session.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lc = lastUserMsg.toLowerCase();

  // Greeting phase — determine project type
  if (session.phase === "greeting") {
    const hasExisting =
      lc.includes("existing") ||
      lc.includes("connect") ||
      lc.includes("have") ||
      lc.includes("github") ||
      lc.includes("linear") ||
      lc.includes("jira") ||
      lc.includes("import") ||
      lc.includes("integrate") ||
      lc.includes("link") ||
      lc.includes("repo") ||
      lc.includes("repository");
    const wantsNew =
      lc.includes("new") ||
      lc.includes("scratch") ||
      lc.includes("create") ||
      lc.includes("local") ||
      lc.includes("start") ||
      lc.includes("set up") ||
      lc.includes("setup") ||
      lc.includes("build") ||
      lc.includes("make") ||
      lc.includes("begin") ||
      lc.includes("init");
    const describesProject =
      lc.includes("project") ||
      lc.includes("app") ||
      lc.includes("application") ||
      lc.includes("website") ||
      lc.includes("site") ||
      lc.includes("service") ||
      lc.includes("api") ||
      lc.includes("tool") ||
      lc.includes("platform") ||
      lc.includes("dashboard") ||
      lc.includes("web") ||
      lc.includes("mobile") ||
      lc.includes("frontend") ||
      lc.includes("backend");

    if (hasExisting && !wantsNew) {
      session.hasExistingProject = true;
      session.phase = "collecting";
      saveSession(session);
      return "Which PM tool is your project in?\n\n- **GitHub Projects** — connect a GitHub repository\n- **Linear** — connect a Linear team\n- **Jira** — connect a Jira project\n\nJust tell me which one.";
    }
    if (wantsNew) {
      session.hasExistingProject = false;
      session.phase = "collecting";
      saveSession(session);
      return "Let's create a new project! What would you like to **name** your project?";
    }
    if (describesProject) {
      session.hasExistingProject = false;
      session.phase = "collecting";
      saveSession(session);
      return "Sounds great! Let's get that set up. What would you like to **name** your project?";
    }
    return "I'd like to understand your situation better. Do you:\n\n1. **Have an existing project** in GitHub, Linear, or Jira to connect?\n2. **Want to create a new project** from scratch?\n\nJust describe what you'd like to do.";
  }

  // Collecting phase — gather info
  if (session.phase === "collecting") {
    if (!session.projectInfo.name) {
      session.projectInfo.name = lastUserMsg.trim();
      saveSession(session);
      return `**${session.projectInfo.name}** — got it! Give me a brief description of what this project is about. (Or say "skip" to move on.)`;
    }
    if (!session.projectInfo.description) {
      session.projectInfo.description = lc === "skip" ? "" : lastUserMsg.trim();
      saveSession(session);
      return "Which PM tool would you like to use?\n\n- **GitHub** — connect a GitHub repository\n- **Linear** — modern issue tracking\n- **Jira** — enterprise PM\n- **Local** — manage everything in FACE\n\nPick one, or say \"local\" to skip external integrations.";
    }
    if (!session.pmTool) {
      if (lc.includes("local") || lc.includes("face") || lc.includes("skip") || lc.includes("none")) {
        const name = session.projectInfo.name ?? "Untitled Project";
        return `Sounds good! Let me create your project now.\n\n\`\`\`setup-action\n{"action":"create_project","name":"${name}","description":"${session.projectInfo.description ?? ""}","pmTool":"local"}\n\`\`\`\n\nSetting that up for you...`;
      }
      if (lc.includes("github")) {
        session.pmTool = "github";
        saveSession(session);
        return "GitHub it is! I'll need your **repository** in `owner/repo` format (or paste the full URL) and a **personal access token** with `repo` scope.\n\nWhat's your repository?";
      }
      if (lc.includes("linear")) {
        session.pmTool = "linear";
        saveSession(session);
        return "Linear it is! I'll need your **team ID** and a **Linear API key**.\n\nWhat's your team ID?";
      }
      if (lc.includes("jira")) {
        session.pmTool = "jira";
        saveSession(session);
        return "Jira it is! I'll need your **Jira base URL** (e.g. `team.atlassian.net`), **project key**, **email**, and **API token**.\n\nWhat's your Jira base URL?";
      }
      return "Which tool would you like? **GitHub**, **Linear**, **Jira**, or **Local**?";
    }
    // Collecting phase but all fields filled — provide a contextual nudge
    return "Let's continue setting up your project. Could you provide the information I asked about above?";
  }

  // Scaffolding phase
  if (session.phase === "scaffolding") {
    const yes = lc.includes("yes") || lc.includes("sure") || lc.includes("go ahead");
    const no = lc.includes("no") || lc.includes("skip") || lc.includes("don't");
    if (yes) return "I'll set up the project structure now...";
    if (no) {
      session.phase = "complete";
      saveSession(session);
      return `All done! Your project is connected and ready. Head to the Board or Issues tab to get started.`;
    }
    return "Would you like me to create default labels, milestones, and board structure? Say **yes** or **no**.";
  }

  return "I'm having trouble processing your request right now. Could you try rephrasing, or tell me whether you'd like to **create a new project** or **connect an existing one**?";
}

// ── Scaffolding ────────────────────────────────────────────────────

async function handleScaffold(session: SetupSessionState, doScaffold: boolean) {
  const projectName = session.projectInfo.name ?? "your project";

  if (doScaffold) {
    let scaffoldResult: ScaffoldResult;
    try {
      scaffoldResult = await scaffoldProject();
    } catch (e) {
      scaffoldResult = { labelsCreated: 0, milestonesCreated: 0, errors: [(e as Error).message] };
    }

    session.autoScaffold = true;
    session.phase = "complete";

    let summary = `Project structure created for **${projectName}**!`;
    if (scaffoldResult.labelsCreated > 0) {
      summary += `\n- ${scaffoldResult.labelsCreated} labels created`;
    }
    if (scaffoldResult.milestonesCreated > 0) {
      summary += `\n- ${scaffoldResult.milestonesCreated} milestones created`;
    }
    if (scaffoldResult.errors.length > 0) {
      summary += `\n\nNotes:\n${scaffoldResult.errors.map((e) => `- ${e}`).join("\n")}`;
    }
    summary += "\n\nYou're all set! Head to the Board or Issues tab to start working.";

    session.messages.push({
      role: "assistant",
      content: summary,
      timestamp: new Date().toISOString(),
    });
    saveSession(session);
    return NextResponse.json({ session: sanitizeForClient(session) });
  }

  // Skip scaffolding
  session.autoScaffold = false;
  session.phase = "complete";

  const reply = `All done! **${projectName}** is connected and ready to use. No project structure was created.\n\nHead to the Board or Issues tab to start working.`;
  session.messages.push({
    role: "assistant",
    content: reply,
    timestamp: new Date().toISOString(),
  });
  saveSession(session);
  return NextResponse.json({ session: sanitizeForClient(session) });
}
