import { NextRequest, NextResponse } from "next/server";
import { testTwitterConnection } from "@/lib/platforms/twitter";
import { testDiscordConnection } from "@/lib/platforms/discord";
import { testTelegramConnection } from "@/lib/platforms/telegram";
import type { PlatformType, ConnectionStatus } from "@/lib/platforms/types";

export async function POST(request: NextRequest) {
  const { platform } = (await request.json()) as { platform?: PlatformType };

  if (!platform) {
    // Test all platforms
    const results = await Promise.all([
      testTwitterConnection(),
      testDiscordConnection(),
      testTelegramConnection(),
    ]);
    return NextResponse.json({ results });
  }

  let result: ConnectionStatus;
  switch (platform) {
    case "twitter":
      result = await testTwitterConnection();
      break;
    case "discord":
      result = await testDiscordConnection();
      break;
    case "telegram":
      result = await testTelegramConnection();
      break;
    default:
      return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  return NextResponse.json({ results: [result] });
}
