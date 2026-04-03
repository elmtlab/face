import { NextResponse } from "next/server";
import {
  createSession,
  loadSession,
  saveSession,
  findActiveSession,
  sanitizeForClient,
  type SetupSessionState,
} from "@/lib/projects/setup";
import { createProject, setActiveProjectId, listProjects } from "@/lib/projects/store";
import { addProvider, getActiveProvider, listProviderConfigs } from "@/lib/project/manager";
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
    const providerList = existing.map((p) => `**${p.name}** (${p.type})`).join(", ");
    return `Welcome! I'll help you set up a new project. I see you already have these PM tools connected: ${providerList}.\n\nTell me about your project — I'll check if it already exists in your connected tools and link it automatically, or create a new one if needed.\n\nJust describe what you're working on!`;
  }
  return "Welcome! I'll help you set up your project in FACE.\n\nTell me about your project — what's it called, what's it about? If you have a repository or PM tool (GitHub, Linear, Jira), I can connect it too.\n\nI'll gather the details, show you a summary, and set everything up once you confirm.";
}

// ── Agent-driven conversation ──────────────────────────────────────

function buildSystemPrompt(session: SetupSessionState): string {
  const existingProviders = listProviderConfigs();

  // Build list of existing FACE projects for context
  const faceProjects = listProjects();
  const faceProjectsList = faceProjects.length > 0
    ? faceProjects.map((p) => `"${p.name}" (id: ${p.id})`).join(", ")
    : "none";

  return `You are a setup assistant for FACE, a project management tool. You're helping a user set up a new project through a conversational flow. Be friendly, concise, and helpful.

## YOUR CAPABILITIES
- You have direct access to the user's filesystem, git repos, and environment
- You can validate whether directories, repos, and files actually exist
- You can inspect git remotes, branches, and project structure
- You can check the connected PM tool for existing projects
- Use these capabilities proactively to help the user — don't just ask, verify!

## CONTEXT
- Already connected providers: ${existingProviders.length > 0 ? existingProviders.map((p) => `${p.name} (${p.type})`).join(", ") : "none"}
- Existing FACE projects: ${faceProjectsList}
- Current session phase: ${session.phase}
- User chose existing project: ${session.hasExistingProject ?? "not decided yet"}
- Chosen PM tool: ${session.pmTool ?? "not chosen yet"}
- Project name: ${session.projectInfo.name ?? "not set"}
- Project description: ${session.projectInfo.description ?? "not set"}
- Project goals: ${session.projectInfo.goals ?? "not set"}
- Provider scope: ${session.scope ?? "not set"}
- Has credentials: ${session.credentials ? "yes (stored securely)" : "no"}

## WHAT YOU NEED TO COLLECT
Gather project configuration through natural conversation:
1. **Project name**: A name for the project
2. **Description** (optional): What the project is about
3. **Goals** (optional): Main objectives
4. **PM tool**: One of: github, linear, jira, or local (FACE-only, no external tool)
5. **Credentials** (if external tool):
   - GitHub: repository (owner/repo) + personal access token (starts with ghp_ or github_pat_)
   - Linear: team ID + API key
   - Jira: base URL (*.atlassian.net) + project key + email + API token

## CONVERSATIONAL FLOW
Follow this flow naturally:
1. **Ask questions** to understand what the user wants — project name, what it's about, which PM tool
2. **Check for duplicates**: Before creating, ALWAYS check if the project already exists:
   - If there's already a connected PM provider, use \`check_pm_tool\` to look for matching projects
   - Check existing FACE projects listed above to avoid duplicates
3. **If the project exists in the PM tool**: Offer to link it to FACE using \`link_project\` instead of creating a duplicate
4. **Present a summary**: Before saving, show the user a summary of all gathered info and ask for explicit confirmation
5. **Save only after confirmation**: Only output a create/connect/link action AFTER the user confirms the summary

## VALIDATION GUIDELINES
- If the user mentions a directory path, CHECK if it exists on the filesystem
- If the user mentions a git repo, CHECK the git remotes to extract the GitHub owner/repo
- If the user gives a vague project description, look at the directory structure and README to suggest a better one
- If the user gives a repo URL, extract the owner/repo from it
- If something looks like a typo or partial input, ask a clarifying question rather than failing silently
- Suggest sensible defaults where possible (e.g., infer project name from repo name)

## HOW TO OUTPUT ACTIONS
When you need to perform an action, include a fenced code block with the language tag \`setup-action\` in your response. The block must contain valid JSON.

### To check PM tool for existing projects (use this BEFORE creating):
\`\`\`setup-action
{"action":"check_pm_tool","searchName":"optional search term"}
\`\`\`
The system will return a list of projects found in the connected PM tool. Use this to determine if the user's project already exists.

### To link an existing PM tool project to FACE (when project already exists in PM tool):
\`\`\`setup-action
{"action":"link_project","name":"Project Name","description":"optional description","goals":"optional goals","repoLink":"optional repo URL","pmTool":"github","scope":"owner/repo","existingProviderName":"name of existing provider connection"}
\`\`\`

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
- The user can correct or adjust any information at any point — just update your understanding and re-confirm.
- **ALWAYS present a summary and ask for confirmation before saving.** Example: "Here's what I have: [summary]. Shall I go ahead and set this up?"
- If the user's input is vague or incomplete, ask a smart follow-up question. Don't fail silently.
- If you can infer information (e.g., project name from a repo name), suggest it and confirm.
- Ask ONE thing at a time when collecting credentials.
- NEVER echo back tokens or secrets in your visible text.
- When you discover something about the user's codebase (e.g., by reading git config), share what you found and suggest how to proceed.
- Keep responses short — 1-4 sentences plus any necessary options.
- Only output a create/connect/link action block AFTER the user explicitly confirms the summary.
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

  // ── Check PM tool for existing projects ───────────────────────
  if (action === "check_pm_tool") {
    return await handleCheckPmTool(session, actionData);
  }

  // ── Link existing PM tool project to FACE ─────────────────────
  if (action === "link_project") {
    return await handleLinkProject(session, actionData);
  }

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

    // Check if a provider with this scope is already connected
    const existingProviders = listProviderConfigs();
    const existingMatch = existingProviders.find(
      (p) => p.type === pmTool && p.scope === scope,
    );

    if (existingMatch) {
      // Provider already connected — link instead of creating duplicate
      const project = createProject(name, repoLink);
      setActiveProjectId(project.id);
      session.createdProjectId = project.id;
      session.connectedProviderName = existingMatch.name;
      session.phase = "scaffolding";
      saveSession(session);

      const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : "Jira";
      return `I found an existing ${toolName} connection for **${scope}** — I've linked your project to it instead of creating a duplicate.\n\nWould you like me to set up an initial project structure? This includes:\n- Default **labels** (bug, enhancement, priority levels, status labels)\n- Default **milestones** (MVP, v1.0)\n\nSay **"yes"** to auto-create this structure, or **"no"** to skip it.`;
    }

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
 * Check the connected PM tool for existing projects matching a search term.
 * Returns a message describing what was found.
 */
async function handleCheckPmTool(
  _session: SetupSessionState,
  actionData: Record<string, unknown>,
): Promise<string> {
  const searchName = ((actionData.searchName as string) ?? "").toLowerCase();
  const providers = listProviderConfigs();

  if (providers.length === 0) {
    return "No PM tool is currently connected. You can connect one (GitHub, Linear, or Jira) or create a local project.";
  }

  const results: string[] = [];

  for (const provConfig of providers) {
    try {
      const provider = await getActiveProvider();
      if (!provider) continue;

      const projects = await provider.listProjects();
      const matches = searchName
        ? projects.filter((p) =>
            p.name.toLowerCase().includes(searchName) ||
            p.description.toLowerCase().includes(searchName),
          )
        : projects;

      if (matches.length > 0) {
        const toolName = provConfig.type === "github" ? "GitHub" : provConfig.type === "linear" ? "Linear" : "Jira";
        results.push(
          `**${toolName}** (${provConfig.scope}):\n` +
            matches.map((p) => `  - "${p.name}" — ${p.description || "no description"} ([view](${p.url}))`).join("\n"),
        );
      }
    } catch {
      // Provider connection failed, skip
    }
  }

  // Also check existing FACE projects
  const faceProjects = listProjects();
  const faceMatches = searchName
    ? faceProjects.filter((p) => p.name.toLowerCase().includes(searchName))
    : faceProjects;

  if (faceMatches.length > 0) {
    results.push(
      `**FACE** (local):\n` +
        faceMatches.map((p) => `  - "${p.name}" (created ${new Date(p.createdAt).toLocaleDateString()})`).join("\n"),
    );
  }

  if (results.length === 0) {
    return searchName
      ? `No existing projects found matching "${searchName}" in connected PM tools or FACE.`
      : "No existing projects found in connected PM tools or FACE.";
  }

  return `Found existing projects:\n\n${results.join("\n\n")}`;
}

/**
 * Link an existing PM tool project to FACE without creating a duplicate provider.
 */
async function handleLinkProject(
  session: SetupSessionState,
  actionData: Record<string, unknown>,
): Promise<string> {
  const name = (actionData.name as string) ?? "Untitled Project";
  const description = (actionData.description as string) ?? "";
  const goals = (actionData.goals as string) ?? "";
  const repoLink = (actionData.repoLink as string) ?? "";
  const pmTool = (actionData.pmTool as string) ?? "local";
  const existingProviderName = (actionData.existingProviderName as string) ?? "";

  // Update session info
  session.projectInfo.name = name;
  if (description) session.projectInfo.description = description;
  if (goals) session.projectInfo.goals = goals;
  if (repoLink) session.projectInfo.repoLink = repoLink;
  session.pmTool = pmTool as "github" | "linear" | "jira" | "local";

  // Verify the provider exists
  const providers = listProviderConfigs();
  const matchedProvider = existingProviderName
    ? providers.find((p) => p.name === existingProviderName)
    : providers.find((p) => p.type === pmTool);

  if (!matchedProvider) {
    return `Could not find the existing provider connection "${existingProviderName}". Please provide credentials to connect.`;
  }

  // Create the FACE project linked to the existing provider
  const project = createProject(name, repoLink);
  setActiveProjectId(project.id);
  session.createdProjectId = project.id;
  session.connectedProviderName = matchedProvider.name;
  session.scope = matchedProvider.scope;

  // Ask about scaffolding
  session.phase = "scaffolding";
  saveSession(session);

  const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : pmTool === "jira" ? "Jira" : "PM tool";
  return `Your project **${name}** has been created and linked to the existing ${toolName} connection (${matchedProvider.scope}).\n\nWould you like me to set up an initial project structure? This includes:\n- Default **labels** (bug, enhancement, priority levels, status labels)\n- Default **milestones** (MVP, v1.0)\n\nSay **"yes"** to auto-create this structure, or **"no"** to skip it.`;
}

// ── Credential extraction helpers ─────────────────────────────────

/** Extract recognizable credential fragments from user input. */
function extractCredentials(input: string): {
  repo?: string;
  token?: string;
  email?: string;
  baseUrl?: string;
  teamId?: string;
  projectKey?: string;
} {
  const result: Record<string, string> = {};

  // GitHub repo: owner/repo or full URL
  const repoMatch = input.match(
    /(?:github\.com\/)?([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/,
  );
  if (repoMatch) {
    result.repo = repoMatch[1].replace(/\.git$/, "");
  }

  // GitHub token
  const ghTokenMatch = input.match(/(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{20,})/);
  if (ghTokenMatch) result.token = ghTokenMatch[1];

  // Linear API key
  const linTokenMatch = input.match(/(lin_api_[a-zA-Z0-9]{20,})/);
  if (linTokenMatch) result.token = linTokenMatch[1];

  // Generic long token (fallback for Jira/Linear tokens without prefix)
  if (!result.token) {
    const genericToken = input.match(/\b([a-zA-Z0-9]{20,})\b/);
    // Only treat as token if it doesn't look like a repo, URL, or email
    if (genericToken && !genericToken[1].includes("/") && !genericToken[1].includes(".") && !genericToken[1].includes("@")) {
      result.token = genericToken[1];
    }
  }

  // Email
  const emailMatch = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) result.email = emailMatch[1];

  // Jira base URL (*.atlassian.net or custom URL)
  const urlMatch = input.match(/(https?:\/\/[a-zA-Z0-9.-]+\.atlassian\.net)/i);
  if (urlMatch) {
    result.baseUrl = urlMatch[1];
  } else {
    // Accept plain domain like "team.atlassian.net"
    const domainMatch = input.match(/([a-zA-Z0-9.-]+\.atlassian\.net)/i);
    if (domainMatch) result.baseUrl = `https://${domainMatch[1]}`;
  }

  // Jira project key (2-10 uppercase letters, standalone)
  const keyMatch = input.match(/\b([A-Z]{2,10})\b/);
  if (keyMatch) result.projectKey = keyMatch[1];

  return result;
}

/**
 * Collect credentials for the selected PM tool.
 * Parses user input for recognizable patterns, stores what it finds,
 * asks for the next missing field, and transitions to confirming
 * when all required fields are collected.
 */
function collectCredentials(session: SetupSessionState, userInput: string): string {
  if (!session.credentials) session.credentials = {};
  const extracted = extractCredentials(userInput);
  const creds = session.credentials;

  if (session.pmTool === "github") {
    // Check for existing provider reuse
    const providers = listProviderConfigs();
    const githubProvider = providers.find((p) => p.type === "github");
    if (githubProvider && (userInput.toLowerCase().includes("yes") || userInput.toLowerCase().includes("link") || userInput.toLowerCase().includes("same") || userInput.toLowerCase().includes("reuse"))) {
      session.scope = githubProvider.scope;
      session.phase = "confirming";
      saveSession(session);
      return buildConfirmationSummary(session);
    }

    if (extracted.repo) session.scope = extracted.repo;
    if (extracted.token) creds.token = extracted.token;
    saveSession(session);

    if (!session.scope) {
      return "What's your GitHub repository? Provide it in `owner/repo` format or paste the full URL.";
    }
    if (!creds.token) {
      return `Got it — **${session.scope}**. Now I need your GitHub **personal access token** with \`repo\` scope.\n\nYou can create one at GitHub → Settings → Developer settings → Personal access tokens. Paste it here.`;
    }

    // All GitHub credentials collected
    session.phase = "confirming";
    saveSession(session);
    return buildConfirmationSummary(session);
  }

  if (session.pmTool === "linear") {
    // Team ID: accept as free text if no scope yet
    if (!session.scope && !extracted.token) {
      session.scope = userInput.trim();
      saveSession(session);
      return `Team ID set to **${session.scope}**. Now I need your **Linear API key** (starts with \`lin_api_\`).`;
    }
    if (extracted.token) creds.token = extracted.token;
    if (!session.scope) {
      // Token came first — still need team ID
      saveSession(session);
      return "Thanks for the API key. What's your **Linear team ID**?";
    }
    if (!creds.token) {
      saveSession(session);
      return "What's your **Linear API key**? It starts with `lin_api_`.";
    }

    session.phase = "confirming";
    saveSession(session);
    return buildConfirmationSummary(session);
  }

  if (session.pmTool === "jira") {
    if (extracted.baseUrl) creds.baseUrl = extracted.baseUrl;
    if (extracted.email) creds.email = extracted.email;
    if (extracted.projectKey) session.scope = extracted.projectKey;
    // For Jira, only store token if we already have the other fields
    // to avoid misidentifying a project key or other input as a token
    if (extracted.token && creds.baseUrl && (creds.email || session.scope)) {
      creds.token = extracted.token;
    }
    saveSession(session);

    if (!creds.baseUrl) {
      return "What's your **Jira base URL**? (e.g. `https://team.atlassian.net`)";
    }
    if (!session.scope) {
      return `Base URL set to **${creds.baseUrl}**. What's your **Jira project key**? (e.g. \`PROJ\`)`;
    }
    if (!creds.email) {
      return `Project key set to **${session.scope}**. What's the **email** associated with your Jira account?`;
    }
    if (!creds.token) {
      return `Almost there! Now I need your **Jira API token**.\n\nYou can create one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens). Paste it here.`;
    }

    session.phase = "confirming";
    saveSession(session);
    return buildConfirmationSummary(session);
  }

  // Shouldn't reach here, but handle gracefully
  return "Which PM tool would you like? **GitHub**, **Linear**, **Jira**, or **Local**?";
}

/** Build a confirmation summary for the confirming phase. */
function buildConfirmationSummary(session: SetupSessionState): string {
  const name = session.projectInfo.name ?? "Untitled Project";
  const desc = session.projectInfo.description
    ? `\n- **Description**: ${session.projectInfo.description}`
    : "";

  let toolInfo = "";
  if (session.pmTool === "local") {
    toolInfo = "\n- **PM tool**: Local (FACE only)";
  } else if (session.pmTool === "github") {
    toolInfo = `\n- **PM tool**: GitHub\n- **Repository**: ${session.scope ?? "not set"}`;
  } else if (session.pmTool === "linear") {
    toolInfo = `\n- **PM tool**: Linear\n- **Team ID**: ${session.scope ?? "not set"}`;
  } else if (session.pmTool === "jira") {
    const baseUrl = session.credentials?.baseUrl ?? "not set";
    toolInfo = `\n- **PM tool**: Jira\n- **Base URL**: ${baseUrl}\n- **Project key**: ${session.scope ?? "not set"}\n- **Email**: ${session.credentials?.email ?? "not set"}`;
  }

  return `Here's what I have:\n\n- **Project name**: ${name}${desc}${toolInfo}\n- **Credentials**: stored securely\n\nShall I go ahead and set this up?`;
}

/**
 * Fallback response when the Claude Code agent is not available.
 * Uses simple heuristics to continue the conversation with the
 * confirmation-first flow.
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

      // Check if we already have PM tool connections
      const providers = listProviderConfigs();
      if (providers.length > 0) {
        const providerList = providers.map((p) => `**${p.name}** (${p.type})`).join(", ");
        return `I see you already have connected PM tools: ${providerList}.\n\nLet me check for existing projects there.\n\n\`\`\`setup-action\n{"action":"check_pm_tool"}\n\`\`\``;
      }

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
        // Present confirmation summary before creating
        session.pmTool = "local";
        session.phase = "confirming";
        saveSession(session);
        const name = session.projectInfo.name ?? "Untitled Project";
        const desc = session.projectInfo.description ? `\n- **Description**: ${session.projectInfo.description}` : "";
        return `Here's what I have:\n\n- **Project name**: ${name}${desc}\n- **PM tool**: Local (FACE only)\n\nShall I go ahead and create this project?`;
      }
      if (lc.includes("github")) {
        session.pmTool = "github";
        saveSession(session);

        // Check if a GitHub provider is already connected
        const providers = listProviderConfigs();
        const githubProvider = providers.find((p) => p.type === "github");
        if (githubProvider) {
          return `I see you already have a GitHub connection for **${githubProvider.scope}**. Would you like to link this project to that repository, or connect a different one?\n\nIf different, what's the repository in \`owner/repo\` format?`;
        }

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

    // PM tool is selected — collect tool-specific credentials
    return collectCredentials(session, lastUserMsg);
  }

  // Confirming phase — present summary and wait for confirmation
  if (session.phase === "confirming") {
    const yes = lc.includes("yes") || lc.includes("sure") || lc.includes("go ahead") || lc.includes("confirm") || lc.includes("looks good") || lc.includes("correct");
    const no = lc.includes("no") || lc.includes("change") || lc.includes("wrong") || lc.includes("update") || lc.includes("fix") || lc.includes("edit");

    if (yes) {
      const name = session.projectInfo.name ?? "Untitled Project";
      const desc = session.projectInfo.description ?? "";
      const pmTool = session.pmTool ?? "local";

      if (pmTool === "local") {
        return `Great, let me set that up!\n\n\`\`\`setup-action\n{"action":"create_project","name":"${name}","description":"${desc}","pmTool":"local"}\n\`\`\`\n\nSetting that up for you...`;
      }

      // For external tools — check if we collected fresh credentials
      if (session.credentials && session.scope) {
        const credsJson = JSON.stringify(session.credentials);
        const repoLink = pmTool === "github" ? `https://github.com/${session.scope}` : "";
        return `Great, let me set that up!\n\n\`\`\`setup-action\n{"action":"connect_provider","name":"${name}","description":"${desc}","pmTool":"${pmTool}","scope":"${session.scope}","repoLink":"${repoLink}","credentials":${credsJson}}\n\`\`\`\n\nConnecting your project now...`;
      }

      // Check for already-connected provider to link
      const providers = listProviderConfigs();
      const matchedProvider = providers.find((p) => p.type === pmTool);
      if (matchedProvider) {
        return `Great, let me set that up!\n\n\`\`\`setup-action\n{"action":"link_project","name":"${name}","description":"${desc}","pmTool":"${pmTool}","scope":"${matchedProvider.scope}","existingProviderName":"${matchedProvider.name}"}\n\`\`\`\n\nLinking your project now...`;
      }

      // Fallback: create local
      return `Great, let me set that up!\n\n\`\`\`setup-action\n{"action":"create_project","name":"${name}","description":"${desc}","pmTool":"local"}\n\`\`\`\n\nSetting that up for you...`;
    }

    if (no) {
      session.phase = "collecting";
      saveSession(session);
      return "No problem! What would you like to change? You can update the **name**, **description**, or **PM tool**.";
    }

    return "Would you like me to go ahead and create this project? Say **yes** to confirm, or tell me what you'd like to change.";
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

  return "I'm having trouble processing your request right now. Could you try rephrasing, or tell me what you'd like to do?";
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
