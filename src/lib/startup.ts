import { runMigrations } from "./db/migrate";
import { detectAllAgents } from "./agents/detect";
import { ensureFaceDir, watchTasks } from "./tasks/file-manager";
import { eventBus } from "./events/bus";
import { startPRPoller } from "./project/pr-poller";

const globalForStartup = globalThis as unknown as {
  __faceInitialized?: boolean;
  __faceCleanup?: () => void;
};

export async function runStartup(): Promise<void> {
  if (globalForStartup.__faceInitialized) return;
  globalForStartup.__faceInitialized = true;

  console.log("[face] Starting up...");

  // 1. Ensure ~/.face/ exists
  ensureFaceDir();

  // 2. Database (for usage tracking)
  try {
    runMigrations();
  } catch (err) {
    console.error("[face] Database migration failed:", err);
  }

  // 3. Detect installed agents
  try {
    const config = await detectAllAgents();
    const agents = Object.entries(config.agents);
    const installed = agents.filter(([, a]) => a.installed);
    const configured = agents.filter(([, a]) => a.configured);

    console.log(
      `[face] Agents detected: ${installed.map(([id]) => id).join(", ") || "none"}`
    );
    if (configured.length > 0) {
      console.log(
        `[face] Agents configured: ${configured.map(([id]) => id).join(", ")}`
      );
    }
  } catch (err) {
    console.error("[face] Agent detection failed:", err);
  }

  // 4. Watch ~/.face/tasks/ for changes
  const unwatch = watchTasks((event, filename) => {
    eventBus.emit("task-file-changed", { event, filename });
  });
  globalForStartup.__faceCleanup = unwatch;

  // 5. Start background PR merge-status poller
  startPRPoller();

  console.log("[face] Server ready");
}
