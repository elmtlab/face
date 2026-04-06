import { NextResponse } from "next/server";
import { loadWorkflow, cancelWorkflow, restoreWorkflow } from "@/lib/project/workflow";
import { getSyncReference } from "@/lib/pm-sync/store";
import { getActivePMSyncProvider } from "@/lib/pm-sync/manager";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const workflow = loadWorkflow(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json({ workflow });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const workflow = loadWorkflow(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  if (workflow.phase === "cancelled") {
    return NextResponse.json({ error: "Workflow already deleted" }, { status: 400 });
  }

  // Remember the previous phase for rollback
  const previousPhase = workflow.phase;

  // Soft-delete locally
  const cancelled = cancelWorkflow(workflowId);
  if (!cancelled) {
    return NextResponse.json({ error: "Failed to cancel workflow" }, { status: 500 });
  }

  // Archive in PM tool if synced
  const syncRef = getSyncReference(workflowId);
  if (syncRef?.externalId) {
    try {
      const provider = await getActivePMSyncProvider();
      if (provider) {
        const result = await provider.archiveTask(syncRef.externalId);
        if (!result.ok) {
          // Rollback local cancellation
          restoreWorkflow(workflowId, previousPhase);
          return NextResponse.json(
            { error: `PM tool sync failed: ${result.error}`, syncError: true },
            { status: 502 },
          );
        }
      }
    } catch (e) {
      // Rollback local cancellation
      restoreWorkflow(workflowId, previousPhase);
      return NextResponse.json(
        { error: `PM tool sync failed: ${(e as Error).message}`, syncError: true },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
