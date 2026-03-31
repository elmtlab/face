import { NextResponse } from "next/server";
import {
  getPollIntervalMs,
  setPollIntervalMs,
  pollNow,
} from "@/lib/project/pr-poller";
import { listWorkflows } from "@/lib/project/workflow";

/**
 * GET /api/project/pr-poller
 *
 * Returns the current poller configuration and tracked PRs.
 */
export async function GET() {
  const workflows = listWorkflows().filter((w) => w.pr);
  const tracked = workflows.map((w) => ({
    workflowId: w.id,
    phase: w.phase,
    pr: w.pr,
    taskId: w.taskId,
    issueId: w.issueId,
  }));

  return NextResponse.json({
    pollIntervalMs: getPollIntervalMs(),
    trackedPRs: tracked,
  });
}

/**
 * POST /api/project/pr-poller
 *
 * Trigger an immediate poll of all implementing workflows.
 * Clears backoff state so every workflow is checked fresh.
 */
export async function POST() {
  const result = await pollNow();
  return NextResponse.json(result);
}

/**
 * PATCH /api/project/pr-poller
 *
 * Update the polling interval.
 *
 * Body: { pollIntervalMs: number }
 */
export async function PATCH(req: Request) {
  const body = await req.json();
  const ms = body.pollIntervalMs;

  if (typeof ms !== "number" || ms < 30_000) {
    return NextResponse.json(
      { error: "pollIntervalMs must be a number >= 30000 (30 seconds)" },
      { status: 400 },
    );
  }

  setPollIntervalMs(ms);

  return NextResponse.json({ pollIntervalMs: getPollIntervalMs() });
}
