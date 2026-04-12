import { NextResponse } from "next/server";
import {
  createSession,
  loadSession,
  saveSession,
  findActiveSession,
  sanitizeForClient,
  type SetupSessionState,
} from "@/lib/projects/setup";
import { createProject, updateProject, setActiveProjectId, listProjects, getProject, DuplicateProjectError, type Project } from "@/lib/projects/store";
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

    return streamAgentResponse(session);
  } catch (e) {
    if (e instanceof DuplicateProjectError) {
      return NextResponse.json(
        { error: e.message },
        { status: 409 },
      );
    }
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

// ── Project configuration schema ────────────────────────────────────

/**
 * Build the configuration schema status — shows the AI what's been
 * collected and what's still needed.
 */
function buildConfigStatus(session: SetupSessionState): string {
  const fields: { label: string; value: string | null; required: boolean; options?: string }[] = [
    { label: "Project name", value: session.projectInfo.name, required: true },
    { label: "Description", value: session.projectInfo.description, required: false },
    { label: "Goals", value: session.projectInfo.goals, required: false },
    { label: "PM tool", value: session.pmTool, required: true, options: "github, linear, jira, local" },
  ];

  // Tool-specific fields
  if (session.pmTool === "github") {
    fields.push({ label: "Repository (owner/repo)", value: session.scope, required: true });
    fields.push({ label: "GitHub personal access token", value: session.credentials?.token ? "(provided)" : null, required: true });
  } else if (session.pmTool === "linear") {
    fields.push({ label: "Team ID", value: session.scope, required: true });
    fields.push({ label: "Linear API key", value: session.credentials?.token ? "(provided)" : null, required: true });
  } else if (session.pmTool === "jira") {
    fields.push({ label: "Jira base URL", value: session.credentials?.baseUrl ?? null, required: true });
    fields.push({ label: "Project key", value: session.scope, required: true });
    fields.push({ label: "Email", value: session.credentials?.email ?? null, required: true });
    fields.push({ label: "Jira API token", value: session.credentials?.token ? "(provided)" : null, required: true });
  }

  const lines = fields.map((f) => {
    const status = f.value ? `✓ ${f.value}` : (f.required ? "✗ (needed)" : "- (optional)");
    const opts = f.options ? ` [options: ${f.options}]` : "";
    return `  ${f.label}: ${status}${opts}`;
  });

  const allRequired = fields.filter((f) => f.required).every((f) => f.value);

  return `CONFIGURATION STATUS:\n${lines.join("\n")}\n\nAll required fields filled: ${allRequired ? "YES — ready to confirm with user" : "NO — keep collecting"}`;
}

// ── System prompt ──────────────────────────────────────────────────

function buildSystemPrompt(session: SetupSessionState): string {
  const existingProviders = listProviderConfigs();
  const faceProjects = listProjects();
  const configStatus = buildConfigStatus(session);

  return `You are a setup assistant for FACE, a project management tool. Help the user configure a new project through natural conversation.

## CONFIGURATION TO COLLECT

${configStatus}

## ENVIRONMENT
- Connected providers: ${existingProviders.length > 0 ? existingProviders.map((p) => `${p.name} (${p.type}, scope: ${p.scope})`).join(", ") : "none"}
- Existing FACE projects: ${faceProjects.length > 0 ? faceProjects.map((p) => `"${p.name}" (id: ${p.id})`).join(", ") : "none"}

## YOUR JOB
1. Through natural conversation, collect the required configuration fields listed above
2. Ask ONE question at a time — don't overwhelm the user
3. When all required fields are filled, present a summary and ask for confirmation
4. Only output a setup-action block AFTER the user explicitly confirms
5. If the user wants to change something, just update your understanding and re-confirm
6. If you can infer information (e.g., project name from a repo URL), suggest it and confirm
7. NEVER echo back tokens or secrets in your visible text
8. Keep responses short — 1-4 sentences

## ACTIONS
When you need to perform an action, include a fenced code block with language tag \`setup-action\` containing valid JSON.

### Check PM tool for existing projects (use BEFORE creating):
\`\`\`setup-action
{"action":"check_pm_tool","searchName":"optional search term"}
\`\`\`

### Link existing PM tool project to FACE:
\`\`\`setup-action
{"action":"link_project","name":"Name","description":"desc","goals":"goals","repoLink":"url","pmTool":"github","scope":"owner/repo","existingProviderName":"provider name"}
\`\`\`

### Create a local project (no external PM tool):
\`\`\`setup-action
{"action":"create_project","name":"Name","description":"desc","goals":"goals","repoLink":"url","pmTool":"local"}
\`\`\`

### Connect an external provider and create the project:
\`\`\`setup-action
{"action":"connect_provider","name":"Name","description":"desc","goals":"goals","repoLink":"url","pmTool":"github","scope":"owner/repo","credentials":{"token":"..."}}
\`\`\`
For Linear: credentials = {"token":"lin_api_..."}
For Jira: credentials = {"baseUrl":"https://team.atlassian.net","email":"...","token":"..."}

## RULES
- Be conversational, not robotic
- If the user already has a connected provider matching their needs, suggest linking instead of creating a duplicate connection
- After outputting a setup-action block, add a brief message like "Setting that up now..." so the user knows something is happening`;
}

// ── Agent-driven conversation ──────────────────────────────────────

function streamAgentResponse(session: SetupSessionState): Response {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

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
        const agentReply = await callAgent(session, abortController.signal, (chunk: string, toolName?: string) => {
          if (toolName) {
            send("thinking", { tool: toolName });
          } else if (chunk) {
            send("chunk", { text: chunk });
          } else {
            // Empty chunk = heartbeat keepalive
            send("heartbeat", {});
          }
        });

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
        if (!abortController.signal.aborted) {
          send("error", { error: (err as Error).message || "Agent error" });
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — abort the agent process
      abortController.abort();
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
  signal: AbortSignal,
  onChunk: (text: string, toolName?: string) => void,
): Promise<string> {
  const { spawn } = await import("child_process");

  const config = readConfig();
  const agentPath = config?.agents?.["claude-code"]?.path;

  if (!agentPath) {
    throw new Error(
      "Claude Code agent is not configured. Set the agent path in config to enable AI-driven setup.",
    );
  }

  const systemPrompt = buildSystemPrompt(session);

  // Build conversation history for the prompt
  const conversationHistory = session.messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const fullPrompt = `${systemPrompt}\n\n## CONVERSATION SO FAR\n${conversationHistory}\n\nRespond to the user's latest message.`;

  return new Promise((resolve, reject) => {
    const child = spawn(agentPath, ["-p", fullPrompt, "--output-format", "stream-json", "--verbose"], {
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
    let settled = false;

    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };

    /**
     * Gracefully kill the child process: SIGTERM first,
     * then SIGKILL after 3s if it hasn't exited.
     */
    const killChild = () => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }, 3_000);
    };

    // Kill child process when client disconnects
    const onAbort = () => {
      killChild();
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Client disconnected"));
      }
    };
    signal.addEventListener("abort", onAbort);

    // Send periodic heartbeats to keep the SSE connection alive
    const heartbeat = setInterval(() => {
      onChunk("");
    }, 15_000);

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
                } else if (block.type === "tool_use") {
                  // Agent is using a tool — notify the client
                  const toolName = (block.name as string) ?? "tool";
                  onChunk("", toolName);
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
      if (settled) return;
      settled = true;
      cleanup();
      if (fullText) {
        resolve(fullText);
      } else {
        reject(new Error(
          code !== 0
            ? `Agent process exited with code ${code} and produced no output.`
            : "Agent returned an empty response. Please try again.",
        ));
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Agent process failed to start: ${err.message}`));
    });

    // Timeout after 3 minutes
    const timeout = setTimeout(() => {
      killChild();
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Agent timed out. Please try again."));
      }
    }, 180_000);
  });
}

// ── Idempotent project creation ─────────────────────────────────────

/**
 * If the session already created a project, return it instead of
 * creating a duplicate. This guards against retries and double-submits.
 *
 * Edge case: if the session's project was deleted externally and another
 * project now has the same name, adopt the existing project rather than
 * throwing DuplicateProjectError.
 */
function getOrCreateProject(
  session: SetupSessionState,
  name: string,
  repoLink: string,
): Project {
  if (session.createdProjectId) {
    const existing = getProject(session.createdProjectId);
    if (existing) {
      // Update repoLink if a new value is provided and differs from the stored one
      if (repoLink && existing.repoLink !== repoLink) {
        return updateProject(existing.id, { repoLink }) ?? existing;
      }
      return existing;
    }
    // Referenced project was deleted — clear the stale reference and try to
    // adopt an existing project with the same name rather than throwing
    session.createdProjectId = null;
    try {
      return createProject(name, repoLink);
    } catch (e) {
      if (e instanceof DuplicateProjectError) {
        const match = listProjects().find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        if (match) {
          // Update repoLink on adopted project if needed
          if (repoLink && match.repoLink !== repoLink) {
            return updateProject(match.id, { repoLink }) ?? match;
          }
          return match;
        }
      }
      throw e;
    }
  }
  return createProject(name, repoLink);
}

// ── Action execution ─────────────────────────────────────────────────

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
    return await handleCheckPmTool(actionData);
  }

  // ── Link existing PM tool project to FACE ─────────────────────
  if (action === "link_project") {
    return await handleLinkProject(session, actionData);
  }

  const name = (actionData.name as string) ?? "Untitled Project";
  const description = (actionData.description as string) ?? "";
  const goals = (actionData.goals as string) ?? "";
  let repoLink = (actionData.repoLink as string) ?? "";
  const pmTool = (actionData.pmTool as string) ?? "local";

  // Update session with extracted info
  session.projectInfo.name = name;
  if (description) session.projectInfo.description = description;
  if (goals) session.projectInfo.goals = goals;
  if (repoLink) session.projectInfo.repoLink = repoLink;
  session.pmTool = pmTool as "github" | "linear" | "jira" | "local";

  if (action === "create_project") {
    const project = getOrCreateProject(session, name, repoLink);
    setActiveProjectId(project.id);
    session.createdProjectId = project.id;
    session.phase = "complete";
    saveSession(session);
    return `Your project **${name}** has been created and set as active!`;
  }

  if (action === "connect_provider") {
    const scope = (actionData.scope as string) ?? "";
    const credentials = (actionData.credentials as Record<string, string>) ?? {};

    // Derive repoLink from scope for GitHub projects when not explicitly provided
    if (!repoLink && pmTool === "github" && scope) {
      repoLink = `https://github.com/${scope}`;
      session.projectInfo.repoLink = repoLink;
    }

    session.scope = scope;
    session.credentials = credentials;

    // Check if a provider with this scope is already connected
    const existingProviders = listProviderConfigs();
    const existingMatch = existingProviders.find(
      (p) => p.type === pmTool && p.scope === scope,
    );

    if (existingMatch) {
      const project = getOrCreateProject(session, name, repoLink);
      setActiveProjectId(project.id);
      session.createdProjectId = project.id;
      session.connectedProviderName = existingMatch.name;
      session.phase = "scaffolding";
      saveSession(session);

      const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : "Jira";
      return `I found an existing ${toolName} connection for **${scope}** — I've linked your project to it.\n\nWould you like me to set up an initial project structure (default labels and milestones)?`;
    }

    // Create the FACE project first
    const project = getOrCreateProject(session, name, repoLink);
    setActiveProjectId(project.id);
    session.createdProjectId = project.id;

    // Connect the provider
    const providerConfig = {
      type: pmTool,
      name: scope || name,
      scope,
      credentials: { ...credentials },
    };

    let result: { ok: boolean; error?: string };
    try {
      result = await addProvider(providerConfig);
    } catch (err) {
      session.credentials = null;
      saveSession(session);
      return mapProviderErrorToGuidance(pmTool, (err as Error).message);
    }
    if (!result.ok) {
      session.credentials = null;
      saveSession(session);
      return mapProviderErrorToGuidance(pmTool, result.error ?? "Unknown connection error");
    }

    session.connectedProviderName = providerConfig.name;
    session.phase = "scaffolding";
    saveSession(session);

    const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : "Jira";
    return `Connected to ${toolName} successfully!\n\nWould you like me to set up an initial project structure (default labels and milestones)?`;
  }

  return null;
}

/**
 * Check the connected PM tool for existing projects matching a search term.
 */
async function handleCheckPmTool(
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
  let repoLink = (actionData.repoLink as string) ?? "";
  const pmTool = (actionData.pmTool as string) ?? "local";
  const existingProviderName = (actionData.existingProviderName as string) ?? "";

  session.projectInfo.name = name;
  if (description) session.projectInfo.description = description;
  if (goals) session.projectInfo.goals = goals;
  session.pmTool = pmTool as "github" | "linear" | "jira" | "local";

  const providers = listProviderConfigs();
  const matchedProvider = existingProviderName
    ? providers.find((p) => p.name === existingProviderName)
    : providers.find((p) => p.type === pmTool);

  if (!matchedProvider) {
    return `Could not find the existing provider connection "${existingProviderName}". Please provide credentials to connect.`;
  }

  // Derive repoLink from the matched provider's scope for GitHub projects when not explicitly provided
  if (!repoLink && pmTool === "github" && matchedProvider.scope) {
    repoLink = `https://github.com/${matchedProvider.scope}`;
  }
  if (repoLink) session.projectInfo.repoLink = repoLink;

  const project = getOrCreateProject(session, name, repoLink);
  setActiveProjectId(project.id);
  session.createdProjectId = project.id;
  session.connectedProviderName = matchedProvider.name;
  session.scope = matchedProvider.scope;

  session.phase = "scaffolding";
  saveSession(session);

  const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : pmTool === "jira" ? "Jira" : "PM tool";
  return `Your project **${name}** has been created and linked to the existing ${toolName} connection (${matchedProvider.scope}).\n\nWould you like me to set up an initial project structure (default labels and milestones)?`;
}

// ── Provider error mapping ─────────────────────────────────────────

/**
 * Map raw provider errors to conversational guidance messages.
 * Known validation errors get specific instructions; unknown errors
 * get a generic but helpful message.
 */
function mapProviderErrorToGuidance(pmTool: string, rawError: string): string {
  const toolName = pmTool === "github" ? "GitHub" : pmTool === "linear" ? "Linear" : pmTool === "jira" ? "Jira" : pmTool;

  // Known validation errors → specific guidance
  const knownErrors: { pattern: RegExp; guidance: string }[] = [
    {
      pattern: /scope must be "owner\/repo"/i,
      guidance: `It looks like the GitHub repository format wasn't quite right. Could you provide it as **owner/repo** (e.g. \`acme/my-project\`)?`,
    },
    {
      pattern: /API key is required/i,
      guidance: `I still need a ${toolName} API key to connect. Could you provide your API key? You can find or create one in your ${toolName} account settings.`,
    },
    {
      pattern: /team ID is required/i,
      guidance: `I need a Linear team ID to connect. You can find this in your Linear workspace under Settings > Teams. Could you share it?`,
    },
    {
      pattern: /baseUrl is required/i,
      guidance: `I need your Jira instance URL to connect (e.g. \`https://yourteam.atlassian.net\`). Could you provide it?`,
    },
    {
      pattern: /project key is required/i,
      guidance: `I need the Jira project key to connect (e.g. \`PROJ\`). You can find this in your Jira project settings. What is it?`,
    },
    {
      pattern: /email.*(required|missing)/i,
      guidance: `I need the email address associated with your Jira account to authenticate. Could you provide it?`,
    },
    {
      pattern: /token.*(required|missing)/i,
      guidance: `I still need an API token to connect to ${toolName}. Could you provide one?`,
    },
    {
      pattern: /(unauthorized|forbidden|401|403)/i,
      guidance: `The credentials were rejected by ${toolName}. Could you double-check your API token and try again? Make sure it has the required permissions.`,
    },
    {
      pattern: /(not found|404)/i,
      guidance: `${toolName} couldn't find the project or resource. Could you verify the scope/ID you provided is correct?`,
    },
  ];

  for (const { pattern, guidance } of knownErrors) {
    if (pattern.test(rawError)) {
      return guidance;
    }
  }

  // Generic fallback — still conversational
  return `I ran into an issue connecting to ${toolName}: ${rawError}\n\nCould you double-check the details and try again?`;
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

  const reply = `All done! **${projectName}** is connected and ready to use.\n\nHead to the Board or Issues tab to start working.`;
  session.messages.push({
    role: "assistant",
    content: reply,
    timestamp: new Date().toISOString(),
  });
  saveSession(session);
  return NextResponse.json({ session: sanitizeForClient(session) });
}
