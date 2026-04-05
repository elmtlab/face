import { NextRequest, NextResponse } from "next/server";
import {
  listPMSyncConfigs,
  addPMSyncProvider,
  removePMSyncProvider,
  updatePMSyncProvider,
  getActivePMSyncProviderName,
  setActivePMSyncProvider,
} from "@/lib/pm-sync/manager";
import { availablePMSyncProviders } from "@/lib/pm-sync/registry";
import type { PMSyncProviderConfig } from "@/lib/pm-sync/types";

/** GET /api/pm-sync/config — list configured PM sync providers */
export async function GET() {
  const providers = listPMSyncConfigs();
  const active = getActivePMSyncProviderName();
  const available = availablePMSyncProviders();
  return NextResponse.json({ providers, active, available });
}

/** POST /api/pm-sync/config — add or update a PM sync provider */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, name, credentials, scope, enabled } = body as {
    type?: string;
    name?: string;
    credentials?: Record<string, string>;
    scope?: string;
    enabled?: boolean;
  };

  if (!type || !name || !credentials || !scope) {
    return NextResponse.json(
      { error: "Missing required fields: type, name, credentials, scope" },
      { status: 400 },
    );
  }

  const config: PMSyncProviderConfig = {
    type,
    name,
    credentials,
    scope,
    enabled: enabled !== false, // default true
  };

  try {
    const result = await addPMSyncProvider(config);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

/** PUT /api/pm-sync/config — update provider settings or set active */
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Set active provider
  if (typeof body.active === "string") {
    const ok = setActivePMSyncProvider(body.active as string);
    if (!ok) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // Update provider settings
  const { name, enabled, credentials, scope } = body as {
    name?: string;
    enabled?: boolean;
    credentials?: Record<string, string>;
    scope?: string;
  };

  if (!name) {
    return NextResponse.json({ error: "Provider name is required" }, { status: 400 });
  }

  const ok = updatePMSyncProvider(name, { enabled, credentials, scope });
  if (!ok) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/pm-sync/config — remove a PM sync provider */
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Provider name is required" }, { status: 400 });
  }

  removePMSyncProvider(name);
  return NextResponse.json({ ok: true });
}
