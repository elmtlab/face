import { NextRequest, NextResponse } from "next/server";
import { dispatchNotification } from "@/lib/notifications/manager";
import type { NotificationPayload } from "@/lib/notifications/types";

/**
 * POST /api/notifications/dispatch
 *
 * Dispatches a notification to all configured providers.
 * Called autonomously by the AI layer when project events occur.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventType, priority, title, body: notifBody, url, metadata } = body as {
    eventType: string;
    priority?: string;
    title: string;
    body: string;
    url?: string;
    metadata?: Record<string, unknown>;
  };

  if (!eventType || !title || !notifBody) {
    return NextResponse.json(
      { error: "Missing required fields: eventType, title, body" },
      { status: 400 },
    );
  }

  const payload: NotificationPayload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: eventType as NotificationPayload["eventType"],
    priority: (priority ?? "normal") as NotificationPayload["priority"],
    title,
    body: notifBody,
    url,
    metadata,
    timestamp: new Date().toISOString(),
  };

  const results = await dispatchNotification(payload);
  return NextResponse.json({ results });
}
