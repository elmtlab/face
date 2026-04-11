import { NextRequest, NextResponse } from "next/server";
import { getConnectionStatus, readEnv, type PlatformName } from "@/lib/listener/env";
import { fetchAllMessages, type PlatformMessage } from "@/lib/listener/platforms";
import { extractTrending } from "@/lib/listener/trending";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  const status = getConnectionStatus();
  const env = readEnv();

  // Build source list from configured platforms.
  const sources: { platform: PlatformName; sourceId: string }[] = [];

  if (status.twitter.configured) {
    const twitterUserId = await resolveTwitterUserId(env.X_BEARER_TOKEN ?? "");
    if (twitterUserId) {
      sources.push({ platform: "twitter", sourceId: twitterUserId });
    }
  }
  if (status.discord.configured) {
    const channelId = searchParams.get("discord_channel") ?? "";
    if (channelId) {
      sources.push({ platform: "discord", sourceId: channelId });
    }
  }
  if (status.telegram.configured) {
    const chatId = searchParams.get("telegram_chat") ?? "";
    sources.push({ platform: "telegram", sourceId: chatId });
  }

  const connectedPlatforms = Object.entries(status)
    .filter(([, v]) => v.configured)
    .map(([k]) => k);
  const unconfiguredPlatforms = Object.entries(status)
    .filter(([, v]) => !v.configured)
    .map(([k]) => k);

  let messages: PlatformMessage[] = [];
  if (sources.length > 0) {
    messages = await fetchAllMessages(sources, limit);
  }

  const topics = extractTrending(messages, 20);

  return NextResponse.json({
    topics,
    messageCount: messages.length,
    connectedPlatforms,
    unconfiguredPlatforms,
  });
}

async function resolveTwitterUserId(bearerToken: string): Promise<string | null> {
  if (!bearerToken) return null;
  try {
    const res = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.id ?? null;
  } catch {
    return null;
  }
}
