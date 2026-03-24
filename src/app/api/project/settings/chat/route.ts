import { NextResponse } from "next/server";
import { addProvider, listProviderConfigs } from "@/lib/project/manager";
import { availableProviders } from "@/lib/project/registry";

/**
 * POST /api/project/settings/chat
 *
 * AI-driven settings configuration.
 * The AI parses user intent and either asks follow-up questions
 * or extracts provider config and connects automatically.
 *
 * Body: { messages: { role: "user"|"assistant", content: string }[] }
 */
export async function POST(req: Request) {
  const { messages } = await req.json();

  const existing = listProviderConfigs();
  const available = availableProviders();

  const systemPrompt = `You are a setup assistant for a project management tool. Help the user connect their project management provider.

CONTEXT:
- Available provider types: ${available.join(", ")}
- Already connected: ${existing.length > 0 ? existing.map((p) => `${p.name} (${p.type}, ${p.scope})`).join(", ") : "none"}

YOUR JOB:
1. Figure out which provider they want to connect (GitHub, Jira, Linear)
2. Get the required info:
   - For GitHub: repository (owner/repo format) and personal access token
   - For Jira: base URL, project key, and API token
   - For Linear: team slug and API key
3. When you have ALL required info, output a JSON block with EXACTLY this format:

\`\`\`config
{"type":"github","name":"display name","scope":"owner/repo","credentials":{"token":"the-token"}}
\`\`\`

RULES:
- Be conversational and helpful, not robotic
- Ask ONE thing at a time
- If they paste a token, acknowledge it and proceed
- If they mention a repo URL like github.com/owner/repo, extract owner/repo from it
- For GitHub tokens: they need "repo" scope, created at GitHub Settings → Developer settings → Personal access tokens
- Keep responses short — 1-3 sentences
- NEVER show the token back to the user
- When you output the config block, also add a brief message like "Let me connect that for you..."`;

  // Call AI
  const aiReply = await callAI(systemPrompt, messages);

  // Check if AI produced a config block
  const configMatch = aiReply.match(/```config\n([\s\S]*?)\n```/);
  let connected = false;
  let connectionError: string | null = null;

  if (configMatch) {
    try {
      const config = JSON.parse(configMatch[1]);
      const result = await addProvider(config);
      if (result.ok) {
        connected = true;
      } else {
        connectionError = result.error ?? "Connection failed";
      }
    } catch {
      connectionError = "Failed to parse configuration";
    }
  }

  // Clean the config block from the visible reply
  const cleanReply = aiReply.replace(/```config\n[\s\S]*?\n```/g, "").trim();

  // Build the assistant's visible message
  let finalReply = cleanReply;
  if (connected) {
    finalReply += "\n\nConnected successfully! Your project board should now load with issues from your repository. Head to the Board or Issues tab to see them.";
  } else if (connectionError) {
    finalReply += `\n\nI tried to connect but got an error: ${connectionError}. Could you double-check your token and try again?`;
  }

  return NextResponse.json({
    reply: finalReply,
    connected,
    connectionError,
  });
}

async function callAI(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const { spawn } = await import("child_process");
  const { readConfig } = await import("@/lib/tasks/file-manager");

  const config = readConfig();
  const agentPath = config?.agents?.["claude-code"]?.path;

  if (!agentPath) {
    // Fallback: parse the user input ourselves for simple cases
    return fallbackParse(messages);
  }

  const fullPrompt = `${systemPrompt}\n\n${messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n")}\n\nAssistant:`;

  return new Promise((resolve) => {
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
        resolve(stdout.trim() || fallbackParse(messages));
      }
    });
    child.on("error", () => {
      resolve(fallbackParse(messages));
    });
  });
}

/**
 * Simple regex-based fallback when Claude Code isn't available.
 * Handles the most common case: user provides repo + token in messages.
 */
function fallbackParse(messages: { role: string; content: string }[]): string {
  const allText = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");

  // Try to find a GitHub repo reference
  const repoMatch = allText.match(/(?:github\.com\/)?([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)/);
  // Try to find a token
  const tokenMatch = allText.match(/(ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{20,})/);

  if (repoMatch && tokenMatch) {
    const scope = repoMatch[1].replace(/\.git$/, "");
    return `Let me connect that for you...\n\n\`\`\`config\n{"type":"github","name":"${scope}","scope":"${scope}","credentials":{"token":"${tokenMatch[1]}"}}\n\`\`\``;
  }

  if (repoMatch && !tokenMatch) {
    return `Got it — I'll connect to **${repoMatch[1]}**. Now I need your GitHub personal access token. You can create one at GitHub → Settings → Developer settings → Personal access tokens (classic). It needs the "repo" scope. Paste it here when you have it.`;
  }

  if (!repoMatch && tokenMatch) {
    return "Thanks for the token. Which GitHub repository do you want to connect? Give me the owner/repo (e.g. `myorg/myproject`) or paste the repo URL.";
  }

  return "Hi! I'll help you connect a project management tool. Which provider would you like to set up?\n\n- **GitHub** — connect a GitHub repository\n- **Jira** — connect a Jira project (coming soon)\n- **Linear** — connect a Linear team (coming soon)\n\nJust tell me what you'd like to connect, for example: \"Connect my GitHub repo owner/repo\"";
}
