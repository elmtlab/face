import { NextRequest, NextResponse } from "next/server";
import {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
} from "@/lib/listener/scheduler";
import {
  getListenerState,
  updateListenerState,
} from "@/lib/listener/storage";
import type { SchedulerConfig } from "@/lib/listener/types";

export async function GET() {
  const state = getListenerState();
  return NextResponse.json({
    running: isSchedulerRunning(),
    config: state.scheduler,
    lastScanAt: state.lastScanAt ?? null,
    lastGenerateAt: state.lastGenerateAt ?? null,
    lastAnalyzeAt: state.lastAnalyzeAt ?? null,
  });
}

/**
 * POST controls the scheduler.
 * Body: { action: "start" | "stop" | "update", config?: Partial<SchedulerConfig> }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;
  const configUpdate = body.config as Partial<SchedulerConfig> | undefined;

  switch (action) {
    case "start": {
      const state = getListenerState();
      if (configUpdate) {
        const newConfig = { ...state.scheduler, ...configUpdate };
        updateListenerState({ scheduler: newConfig });
        startScheduler(newConfig);
      } else {
        startScheduler(state.scheduler);
      }
      return NextResponse.json({ ok: true, running: true });
    }
    case "stop": {
      stopScheduler();
      return NextResponse.json({ ok: true, running: false });
    }
    case "update": {
      if (!configUpdate) {
        return NextResponse.json(
          { error: "config is required for update action" },
          { status: 400 },
        );
      }
      const state = getListenerState();
      const newConfig = { ...state.scheduler, ...configUpdate };
      updateListenerState({ scheduler: newConfig });
      // Restart if running
      if (isSchedulerRunning()) {
        startScheduler(newConfig);
      }
      return NextResponse.json({ ok: true, config: newConfig });
    }
    default:
      return NextResponse.json(
        { error: "Invalid action. Use: start, stop, update" },
        { status: 400 },
      );
  }
}
