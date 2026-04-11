import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/platforms/env";
import { fetchTwitterMessages } from "@/lib/platforms/twitter";
import { fetchDiscordMessages } from "@/lib/platforms/discord";
import { fetchTelegramMessages } from "@/lib/platforms/telegram";
import { extractTrendingTopics } from "@/lib/trending";
import type { PlatformMessage, PlatformType } from "@/lib/platforms/types";

// Default keywords to search for on Twitter (Discord and Telegram fetch all recent messages)
const DEFAULT_KEYWORDS = ["tech", "ai", "trending", "news", "software", "development"];

export async function GET() {
  const messages: PlatformMessage[] = [];
  const platformStatus: { platform: PlatformType; configured: boolean; messageCount: number; error?: string }[] = [];

  // Fetch from all configured platforms in parallel
  const fetchers: Promise<void>[] = [];

  if (hasCredentials(["TWITTER_BEARER_TOKEN"])) {
    fetchers.push(
      fetchTwitterMessages(DEFAULT_KEYWORDS)
        .then((msgs) => {
          messages.push(...msgs);
          platformStatus.push({ platform: "twitter", configured: true, messageCount: msgs.length });
        })
        .catch((err) => {
          platformStatus.push({ platform: "twitter", configured: true, messageCount: 0, error: (err as Error).message });
        }),
    );
  } else {
    platformStatus.push({ platform: "twitter", configured: false, messageCount: 0 });
  }

  if (hasCredentials(["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"])) {
    fetchers.push(
      fetchDiscordMessages()
        .then((msgs) => {
          messages.push(...msgs);
          platformStatus.push({ platform: "discord", configured: true, messageCount: msgs.length });
        })
        .catch((err) => {
          platformStatus.push({ platform: "discord", configured: true, messageCount: 0, error: (err as Error).message });
        }),
    );
  } else {
    platformStatus.push({ platform: "discord", configured: false, messageCount: 0 });
  }

  if (hasCredentials(["TELEGRAM_BOT_TOKEN"])) {
    fetchers.push(
      fetchTelegramMessages()
        .then((msgs) => {
          messages.push(...msgs);
          platformStatus.push({ platform: "telegram", configured: true, messageCount: msgs.length });
        })
        .catch((err) => {
          platformStatus.push({ platform: "telegram", configured: true, messageCount: 0, error: (err as Error).message });
        }),
    );
  } else {
    platformStatus.push({ platform: "telegram", configured: false, messageCount: 0 });
  }

  await Promise.all(fetchers);

  const topics = extractTrendingTopics(messages);

  return NextResponse.json({
    topics,
    totalMessages: messages.length,
    platforms: platformStatus,
    analyzedAt: new Date().toISOString(),
  });
}
