import { readEnvFile } from "./env";
import type { ConnectionStatus, PlatformMessage } from "./types";

export async function testTelegramConnection(): Promise<ConnectionStatus> {
  const env = readEnvFile();
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { platform: "telegram", connected: false, error: "Bot token not configured" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) {
      const body = await res.text();
      return { platform: "telegram", connected: false, error: `API error ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = await res.json();
    if (!data.ok) {
      return { platform: "telegram", connected: false, error: data.description || "Unknown error" };
    }

    return { platform: "telegram", connected: true, username: `@${data.result.username}` };
  } catch (err) {
    return { platform: "telegram", connected: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

export async function fetchTelegramMessages(): Promise<PlatformMessage[]> {
  const env = readEnvFile();
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];

  // Telegram Bot API can only receive new updates via getUpdates (long-polling).
  // It cannot read message history. We fetch recent updates as available.
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=1`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.ok || !data.result) return [];

    const messages: PlatformMessage[] = [];
    for (const update of data.result) {
      const msg = update.message || update.channel_post;
      if (!msg || !msg.text) continue;
      messages.push({
        id: String(msg.message_id),
        platform: "telegram",
        author: msg.from?.username || msg.from?.first_name || "unknown",
        body: msg.text,
        timestamp: new Date(msg.date * 1000).toISOString(),
      });
    }

    return messages;
  } catch {
    return [];
  }
}
