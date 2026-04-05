import { NextRequest, NextResponse } from "next/server";
import { getSyncReference, listSyncReferences } from "@/lib/pm-sync/store";
import type { SyncStatus } from "@/lib/pm-sync/types";

/** GET /api/pm-sync/status — get sync status for items */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const faceId = url.searchParams.get("faceId");

  // Single item lookup
  if (faceId) {
    const ref = getSyncReference(faceId);
    if (!ref) {
      return NextResponse.json({ reference: null });
    }
    return NextResponse.json({ reference: ref });
  }

  // List with optional filters
  const status = url.searchParams.get("status") as SyncStatus | null;
  const type = url.searchParams.get("type") as "project" | "task" | null;

  const references = listSyncReferences({
    status: status ?? undefined,
    type: type ?? undefined,
  });

  return NextResponse.json({ references });
}
