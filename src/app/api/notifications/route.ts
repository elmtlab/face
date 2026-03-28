import { NextRequest, NextResponse } from "next/server";
import {
  listNotificationConfigs,
  addNotificationProvider,
  removeNotificationProvider,
} from "@/lib/notifications/manager";
import type { NotificationProviderConfig } from "@/lib/notifications/types";

export async function GET() {
  const configs = listNotificationConfigs();
  return NextResponse.json({
    providers: configs.map((c) => ({
      name: c.name,
      type: c.type,
      target: c.target,
      eventFilter: c.eventFilter ?? [],
    })),
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, name, credentials, target, eventFilter } = body as {
    type: string;
    name: string;
    credentials: Record<string, string>;
    target: string;
    eventFilter?: string[];
  };

  if (!type || !name || !credentials || !target) {
    return NextResponse.json(
      { error: "Missing required fields: type, name, credentials, target" },
      { status: 400 },
    );
  }

  const config: NotificationProviderConfig = {
    type,
    name,
    credentials,
    target,
    eventFilter: eventFilter as NotificationProviderConfig["eventFilter"],
  };

  try {
    const result = await addNotificationProvider(config);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to add provider" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing name parameter" }, { status: 400 });
  }

  removeNotificationProvider(name);
  return NextResponse.json({ ok: true });
}
