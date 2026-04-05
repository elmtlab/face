import { NextRequest, NextResponse } from "next/server";
import { getSyncReference } from "@/lib/pm-sync/store";
import { retryFailed, syncProject } from "@/lib/pm-sync/worker";
import { getProject } from "@/lib/projects/store";

/**
 * POST /api/pm-sync/retry — manually retry a failed sync item.
 *
 * Resets the retry count and re-enqueues the item for sync.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const faceId = body.faceId as string | undefined;
  if (!faceId) {
    return NextResponse.json({ error: "faceId is required" }, { status: 400 });
  }

  const ref = getSyncReference(faceId);
  if (!ref) {
    return NextResponse.json({ error: "No sync reference found for this item" }, { status: 404 });
  }

  if (ref.status !== "failed") {
    return NextResponse.json({ error: `Item is not in failed state (current: ${ref.status})` }, { status: 400 });
  }

  // Reset and re-trigger
  const ok = retryFailed(faceId);
  if (!ok) {
    return NextResponse.json({ error: "Failed to queue retry" }, { status: 500 });
  }

  // Re-submit the sync with available data
  if (ref.type === "project") {
    const project = getProject(faceId);
    if (project) {
      syncProject({
        faceId: project.id,
        name: project.name,
        description: `Repository: ${project.repoLink}`,
      });
    }
  }
  // Task retries are handled by the pm_sync_retry_requested event listener

  return NextResponse.json({ ok: true, message: "Retry queued" });
}
