import { NextResponse } from "next/server";
import { readConfig } from "@/lib/tasks/file-manager";
import { detectAllAgents } from "@/lib/agents/detect";

export async function GET() {
  // Try cached config first, fall back to live detection
  let config = readConfig();
  if (!config) {
    config = await detectAllAgents();
  }

  const agents = Object.entries(config.agents).map(([id, info]) => ({
    id,
    name: formatAgentName(id),
    installed: info.installed,
    configured: info.configured,
    version: info.version ?? null,
    path: info.path,
  }));

  return NextResponse.json(agents);
}

function formatAgentName(id: string): string {
  const names: Record<string, string> = {
    "claude-code": "Claude Code",
    codex: "Codex",
  };
  return names[id] ?? id;
}
