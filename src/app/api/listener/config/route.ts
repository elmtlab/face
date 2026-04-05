import { NextRequest, NextResponse } from "next/server";
import {
  getListenerState,
  saveListenerState,
} from "@/lib/listener/storage";
import { availablePlatformAdapters } from "@/lib/listener/registry";
import { clearAdapterCache } from "@/lib/listener/scheduler";
import type { PlatformAdapterConfig } from "@/lib/listener/types";

// Ensure adapter is registered
import "@/lib/listener/adapters/twitter";

export async function GET() {
  const state = getListenerState();
  return NextResponse.json({
    adapters: state.adapters.map((a) => ({
      type: a.type,
      name: a.name,
      enabled: a.enabled,
      // Never expose credentials
    })),
    availableAdapters: availablePlatformAdapters(),
    scheduler: state.scheduler,
  });
}

/**
 * POST adds or updates a platform adapter configuration.
 * Body: { type, name, credentials, enabled }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, name, credentials, enabled } = body as {
    type: string;
    name: string;
    credentials: Record<string, string>;
    enabled?: boolean;
  };

  if (!type || !name || !credentials) {
    return NextResponse.json(
      { error: "Missing required fields: type, name, credentials" },
      { status: 400 },
    );
  }

  const config: PlatformAdapterConfig = {
    type,
    name,
    credentials,
    enabled: enabled ?? true,
  };

  const state = getListenerState();
  const idx = state.adapters.findIndex((a) => a.type === type);
  if (idx >= 0) {
    state.adapters[idx] = config;
  } else {
    state.adapters.push(config);
  }

  saveListenerState(state);
  clearAdapterCache();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  if (!type) {
    return NextResponse.json(
      { error: "Missing type parameter" },
      { status: 400 },
    );
  }

  const state = getListenerState();
  state.adapters = state.adapters.filter((a) => a.type !== type);
  saveListenerState(state);
  clearAdapterCache();

  return NextResponse.json({ ok: true });
}
