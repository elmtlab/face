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
 *   { sessionId: string, message: string }  — Send a chat message
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
      // Add initial AI greeting
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

    // Handle chat message
    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Add user message
    session.messages.push({
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString(),
    });

    // Process message based on current phase
    const reply = await processMessage(session, message.trim());
    session.messages.push({
      role: "assistant",
      content: reply,
      timestamp: new Date().toISOString(),
    });

    // Auto-trigger connection if phase just transitioned to "connecting"
    if (session.phase === "connecting") {
      const connectionReply = await attemptConnection(session);
      session.messages.push({
        role: "assistant",
        content: connectionReply,
        timestamp: new Date().toISOString(),
      });
    }

    // Auto-trigger scaffolding if user said yes and AI responded with "setting up..."
    if (session.phase === "scaffolding" && reply.includes("set up the project structure")) {
      saveSession(session);
      return handleScaffold(session, true);
    }

    saveSession(session);
    return NextResponse.json({ session: sanitizeForClient(session) });
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
    return `Welcome! I'll help you set up a new project. I see you already have ${existing.length} provider connection(s) configured.\n\nDo you have an **existing project** in an external PM tool (like GitHub Projects, Linear, or Jira) that you'd like to connect? Or would you like to **create a new project** from scratch?`;
  }
  return "Welcome! I'll help you set up your project in FACE.\n\nDo you have an **existing project** in a PM tool (like GitHub Projects, Linear, or Jira) that you'd like to connect? Or would you like to **create a new project** from scratch?";
}

// ── Message processing ──────────────────────────────────────────────

async function processMessage(session: SetupSessionState, message: string): Promise<string> {
  const lc = message.toLowerCase();

  switch (session.phase) {
    case "greeting":
      return handleGreetingResponse(session, lc, message);
    case "collecting":
      return handleCollecting(session, lc, message);
    case "scaffolding":
      return handleScaffoldingResponse(session, lc);
    default:
      return "This setup session is already complete. You can start a new one if needed.";
  }
}

// ── Phase: Greeting ─────────────────────────────────────────────────

function handleGreetingResponse(session: SetupSessionState, lc: string, _raw: string): string {
  const hasExisting = lc.includes("existing") || lc.includes("yes") || lc.includes("connect") || lc.includes("have");
  const wantsNew = lc.includes("new") || lc.includes("no") || lc.includes("scratch") || lc.includes("create");

  if (hasExisting && !wantsNew) {
    session.hasExistingProject = true;
    session.phase = "collecting";
    return "Great! Which PM tool is your project in?\n\n- **GitHub Projects** — connect a GitHub repository\n- **Linear** — connect a Linear team\n- **Jira** — connect a Jira project\n\nJust tell me which one, and I'll guide you through connecting it.";
  }

  if (wantsNew || (!hasExisting && !wantsNew)) {
    if (wantsNew) {
      session.hasExistingProject = false;
      session.phase = "collecting";
      return "Let's create a new project! First, what would you like to **name** your project?";
    }
    // Ambiguous — ask again
    return "I'd like to understand your situation better. Do you:\n\n1. **Have an existing project** in a tool like GitHub, Linear, or Jira that you want to connect?\n2. **Want to create a brand new project** from scratch?\n\nJust say \"existing\" or \"new\" (or describe what you'd like to do).";
  }

  // Both signals present — clarify
  session.hasExistingProject = false;
  session.phase = "collecting";
  return "Let's create a new project! First, what would you like to **name** your project?";
}

// ── Phase: Collecting ───────────────────────────────────────────────

function handleCollecting(session: SetupSessionState, lc: string, raw: string): string {
  // Existing project flow — collect PM tool choice and credentials
  if (session.hasExistingProject) {
    return collectExistingProject(session, lc, raw);
  }

  // New project flow — collect project info
  return collectNewProject(session, lc, raw);
}

function collectExistingProject(session: SetupSessionState, lc: string, raw: string): string {
  // Step 1: Determine PM tool
  if (!session.pmTool) {
    if (lc.includes("github")) {
      session.pmTool = "github";
      return "GitHub it is! I'll need two things:\n\n1. Your **repository** in `owner/repo` format (e.g. `myorg/myproject`)\n2. A **personal access token** with `repo` scope\n\nYou can create a token at GitHub → Settings → Developer settings → Personal access tokens (classic).\n\nLet's start — what's your repository?";
    }
    if (lc.includes("linear")) {
      session.pmTool = "linear";
      return "Linear! I'll need:\n\n1. Your **team ID** (found in your Linear URL or team settings)\n2. A **Linear API key** (create one at Linear → Settings → API)\n\nWhat's your team ID?";
    }
    if (lc.includes("jira")) {
      session.pmTool = "jira";
      return "Jira! I'll need:\n\n1. Your **Jira base URL** (e.g. `https://yourteam.atlassian.net`)\n2. Your **project key** (e.g. `PROJ`)\n3. Your **email address** associated with Jira\n4. An **API token** (create one at Atlassian → Account → API tokens)\n\nLet's start — what's your Jira base URL?";
    }

    return "Which PM tool would you like to connect?\n\n- **GitHub** — connect a GitHub repository\n- **Linear** — connect a Linear team\n- **Jira** — connect a Jira project";
  }

  // Step 2+: Collect tool-specific credentials
  return collectCredentials(session, lc, raw);
}

function collectCredentials(session: SetupSessionState, lc: string, raw: string): string {
  if (!session.credentials) {
    session.credentials = {};
  }

  switch (session.pmTool) {
    case "github":
      return collectGitHubCredentials(session, lc, raw);
    case "linear":
      return collectLinearCredentials(session, lc, raw);
    case "jira":
      return collectJiraCredentials(session, lc, raw);
    default:
      return "Something went wrong. Let's start over — which PM tool would you like to connect?";
  }
}

function collectGitHubCredentials(session: SetupSessionState, _lc: string, raw: string): string {
  // Try to extract repo
  if (!session.scope) {
    const repoMatch = raw.match(/(?:github\.com\/)?([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
    if (repoMatch) {
      session.scope = repoMatch[1].replace(/\.git$/, "");
      return `Got it — **${session.scope}**. Now paste your GitHub personal access token (it starts with \`ghp_\` or \`github_pat_\`).`;
    }
    return "I need your repository in `owner/repo` format (e.g. `myorg/myproject`). You can also paste the full GitHub URL.";
  }

  // Try to extract token
  if (!session.credentials!.token) {
    const tokenMatch = raw.match(/(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{20,})/);
    if (tokenMatch) {
      session.credentials!.token = tokenMatch[1];
      session.phase = "connecting";
      // Also collect project name from repo
      if (!session.projectInfo.name) {
        session.projectInfo.name = session.scope!.split("/")[1] ?? session.scope!;
      }
      session.projectInfo.repoLink = `https://github.com/${session.scope}`;
      return "Got your token. Let me verify the connection...";
    }
    return "I need a GitHub personal access token. It should start with `ghp_` or `github_pat_`. Paste it here — I won't show it back to you.";
  }

  session.phase = "connecting";
  return "I have everything I need. Let me verify the connection...";
}

function collectLinearCredentials(session: SetupSessionState, _lc: string, raw: string): string {
  if (!session.scope) {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      session.scope = trimmed;
      return `Team ID set to **${session.scope}**. Now paste your Linear API key.`;
    }
    return "What's your Linear team ID?";
  }

  if (!session.credentials!.token) {
    const trimmed = raw.trim();
    if (trimmed.length > 5) {
      session.credentials!.token = trimmed;
      session.phase = "connecting";
      if (!session.projectInfo.name) {
        session.projectInfo.name = session.scope!;
      }
      return "Got your API key. Let me verify the connection...";
    }
    return "I need your Linear API key. You can create one at Linear → Settings → API.";
  }

  session.phase = "connecting";
  return "I have everything I need. Let me verify the connection...";
}

function collectJiraCredentials(session: SetupSessionState, _lc: string, raw: string): string {
  if (!session.credentials!.baseUrl) {
    const urlMatch = raw.match(/(https?:\/\/[a-zA-Z0-9._-]+\.atlassian\.net)/i);
    const trimmed = raw.trim();
    const url = urlMatch ? urlMatch[1] : (trimmed.includes(".atlassian.net") ? `https://${trimmed.replace(/^https?:\/\//, "")}` : null);
    if (url) {
      session.credentials!.baseUrl = url.replace(/\/+$/, "");
      return `Base URL set to **${session.credentials!.baseUrl}**. What's your Jira project key? (e.g. \`PROJ\`)`;
    }
    return "I need your Jira base URL (e.g. `https://yourteam.atlassian.net`).";
  }

  if (!session.scope) {
    const keyMatch = raw.match(/\b([A-Z][A-Z0-9]{1,9})\b/);
    if (keyMatch) {
      session.scope = keyMatch[1];
      return `Project key set to **${session.scope}**. What's the email address associated with your Jira account?`;
    }
    return "I need your Jira project key (e.g. `PROJ`). It's usually all uppercase letters.";
  }

  if (!session.credentials!.email) {
    const emailMatch = raw.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      session.credentials!.email = emailMatch[0];
      return "Got your email. Now paste your Jira API token (create one at Atlassian → Account → API tokens).";
    }
    return "I need the email address associated with your Jira account.";
  }

  if (!session.credentials!.token) {
    const trimmed = raw.trim();
    if (trimmed.length > 5) {
      session.credentials!.token = trimmed;
      session.phase = "connecting";
      if (!session.projectInfo.name) {
        session.projectInfo.name = session.scope!;
      }
      return "Got your API token. Let me verify the connection...";
    }
    return "I need your Jira API token. Paste it here.";
  }

  session.phase = "connecting";
  return "I have everything I need. Let me verify the connection...";
}

function collectNewProject(session: SetupSessionState, lc: string, raw: string): string {
  // Step 1: Name
  if (!session.projectInfo.name) {
    session.projectInfo.name = raw.trim();
    return `**${session.projectInfo.name}** — nice! Give me a brief description of what this project is about. (Or type "skip" to move on.)`;
  }

  // Step 2: Description
  if (!session.projectInfo.description) {
    if (lc === "skip" || lc === "none") {
      session.projectInfo.description = "";
    } else {
      session.projectInfo.description = raw.trim();
    }
    return "What are the main goals for this project? (Or type \"skip\" to move on.)";
  }

  // Step 3: Goals
  if (!session.projectInfo.goals) {
    if (lc === "skip" || lc === "none") {
      session.projectInfo.goals = "";
    } else {
      session.projectInfo.goals = raw.trim();
    }
    return "Which PM tool would you like to use for this project?\n\n- **GitHub Projects** — great for code-centric teams\n- **Linear** — modern issue tracking\n- **Jira** — enterprise project management\n- **Local** — manage everything locally in FACE (no external tool)\n\nPick one, or say \"local\" to skip external integrations.";
  }

  // Step 4: PM tool choice
  if (!session.pmTool) {
    if (lc.includes("github")) {
      session.pmTool = "github";
      return "GitHub it is! I'll need:\n\n1. Your **repository** in `owner/repo` format\n2. A **personal access token** with `repo` scope\n\nWhat's your repository?";
    }
    if (lc.includes("linear")) {
      session.pmTool = "linear";
      return "Linear! I'll need:\n\n1. Your **team ID**\n2. A **Linear API key**\n\nWhat's your team ID?";
    }
    if (lc.includes("jira")) {
      session.pmTool = "jira";
      return "Jira! I'll need:\n\n1. Your **Jira base URL** (e.g. `https://yourteam.atlassian.net`)\n2. Your **project key** (e.g. `PROJ`)\n3. Your **email address**\n4. An **API token**\n\nWhat's your Jira base URL?";
    }
    if (lc.includes("local") || lc.includes("face") || lc.includes("none") || lc.includes("skip")) {
      session.pmTool = "local";
      session.phase = "connecting";
      return "No problem — I'll set up local project management in FACE. Let me create your project...";
    }

    return "Which tool would you like? Options: **GitHub**, **Linear**, **Jira**, or **Local** (no external tool).";
  }

  // If we have a PM tool but it's not local, we need credentials
  if (session.pmTool !== "local") {
    return collectCredentials(session, lc, raw);
  }

  session.phase = "connecting";
  return "Let me create your project...";
}

// ── Phase: Connecting ───────────────────────────────────────────────

async function attemptConnection(session: SetupSessionState): Promise<string> {
  const projectName = session.projectInfo.name ?? "Untitled Project";
  const repoLink = session.projectInfo.repoLink ?? "";

  // Create the FACE project
  const project = createProject(projectName, repoLink);
  setActiveProjectId(project.id);
  session.createdProjectId = project.id;

  // If local-only, skip provider connection
  if (session.pmTool === "local" || !session.pmTool) {
    session.phase = "complete";
    saveSession(session);
    return `Your project **${projectName}** has been created and set as active! You're all set to start managing requirements and tasks in FACE.`;
  }

  // Connect the PM provider
  const providerConfig = buildProviderConfig(session);
  if (!providerConfig) {
    session.phase = "error";
    saveSession(session);
    return "I don't have enough information to connect the provider. Please start a new setup.";
  }

  const result = await addProvider(providerConfig);
  if (!result.ok) {
    // Don't fail the whole session — let user retry
    session.phase = "collecting";
    // Clear the credential that likely failed
    if (session.credentials) {
      session.credentials.token = "";
    }
    return `Connection failed: ${result.error}\n\nPlease double-check your credentials and try again. Paste your ${session.pmTool === "github" ? "token" : "API key"} again.`;
  }

  session.connectedProviderName = providerConfig.name;

  // Ask about scaffolding (only for non-local tools)
  session.phase = "scaffolding";
  saveSession(session);

  const toolName = session.pmTool === "github" ? "GitHub" : session.pmTool === "linear" ? "Linear" : "Jira";
  return `Connected to ${toolName} successfully!\n\nWould you like me to set up an initial project structure? This includes:\n- Default **labels** (bug, enhancement, priority levels, status labels)\n- Default **milestones** (MVP, v1.0)\n\nSay **"yes"** to auto-create this structure, or **"no"** to skip it.`;
}

function buildProviderConfig(session: SetupSessionState) {
  if (!session.pmTool || !session.scope || !session.credentials) return null;

  const name = session.pmTool === "github"
    ? session.scope
    : session.projectInfo.name ?? session.scope;

  return {
    type: session.pmTool,
    name,
    scope: session.scope,
    credentials: { ...session.credentials },
  };
}

// ── Phase: Scaffolding ──────────────────────────────────────────────

function handleScaffoldingResponse(session: SetupSessionState, lc: string): string {
  const yes = lc.includes("yes") || lc.includes("sure") || lc.includes("go ahead") || lc.includes("create") || lc.includes("set up");
  const no = lc.includes("no") || lc.includes("skip") || lc.includes("don't") || lc.includes("nah");

  if (yes) {
    // Scaffolding will be triggered by the UI calling action: "scaffold"
    return "I'll set up the project structure now...";
  }
  if (no) {
    session.phase = "complete";
    saveSession(session);
    const projectName = session.projectInfo.name ?? "your project";
    return `All done! **${projectName}** is connected and ready to use. No project structure was created — you can set that up manually whenever you like.\n\nHead to the Board or Issues tab to see your project.`;
  }

  return "Would you like me to create default labels, milestones, and board structure? Say **\"yes\"** or **\"no\"**.";
}

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
