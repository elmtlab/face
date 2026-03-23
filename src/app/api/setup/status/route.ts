import { NextResponse } from "next/server";
import { detectAllAgents } from "@/lib/agents/detect";

export async function GET() {
  const config = await detectAllAgents();
  const hasAnyAgent = Object.values(config.agents).some((a) => a.installed);
  const hasAnyConfigured = Object.values(config.agents).some(
    (a) => a.installed && a.configured
  );
  // Only require setup if no agent is configured at all
  const needsSetup = hasAnyAgent && !hasAnyConfigured;

  return NextResponse.json({
    config,
    needsSetup,
    hasAnyAgent,
  });
}
