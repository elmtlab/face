import { NextResponse } from "next/server";
import { readConfig } from "@/lib/tasks/file-manager";
import { getDb } from "@/lib/db";

export async function GET() {
  // Check DB
  let dbHealthy = false;
  try {
    getDb();
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }

  // Check agents from config
  const config = readConfig();
  const agents: Record<
    string,
    { installed: boolean; configured: boolean; healthy: boolean }
  > = {};

  if (config) {
    for (const [id, info] of Object.entries(config.agents)) {
      agents[id] = {
        installed: info.installed,
        configured: info.configured,
        healthy: info.installed && info.configured,
      };
    }
  }

  const anyHealthy = Object.values(agents).some((a) => a.healthy);
  const allHealthy =
    dbHealthy && Object.values(agents).every((a) => a.healthy);

  return NextResponse.json({
    status: allHealthy ? "ok" : anyHealthy ? "degraded" : "setup_required",
    agents,
    db: dbHealthy,
  });
}
