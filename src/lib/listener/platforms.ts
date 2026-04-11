import { readEnv, type PlatformName } from "./env";

export interface PlatformMessage {
  id: string;
  platform: PlatformName;
  text: string;
  authorUsername: string;
  authorDisplayName: string;
  createdAt: string | null;
}

interface TestResult {
  ok: boolean;
  username?: string;
  error?: string;
}

// ── Twitter ──

async function twitterTestConnection(): Promise<TestResult> {
  const env = readEnv();
  if (!env.X_BEARER_TOKEN) return { ok: false, error: "Missing bearer token" };
  const res = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = await res.json();
  return { ok: true, username: data.data?.username };
}

async function twitterFetchMessages(
  userId: string,
  limit = 20,
): Promise<PlatformMessage[]> {
  const env = readEnv();
  if (!env.X_BEARER_TOKEN) return [];
  const url = new URL(
    `https://api.twitter.com/2/users/${userId}/tweets`,
  );
  url.searchParams.set("max_results", String(Math.min(limit, 100)));
  url.searchParams.set("tweet.fields", "created_at,author_id");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.data) return [];
  return data.data.map(
    (t: { id: string; text: string; created_at?: string }) => ({
      id: t.id,
      platform: "twitter" as const,
      text: t.text,
      authorUsername: userId,
      authorDisplayName: "",
      createdAt: t.created_at ?? null,
    }),
  );
}

// ── Discord ──

const DISCORD_API = "https://discord.com/api/v10";

async function discordTestConnection(): Promise<TestResult> {
  const env = readEnv();
  if (!env.DISCORD_BOT_TOKEN)
    return { ok: false, error: "Missing bot token" };
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = await res.json();
  return { ok: true, username: data.username };
}

async function discordFetchMessages(
  channelId: string,
  limit = 20,
): Promise<PlatformMessage[]> {
  const env = readEnv();
  if (!env.DISCORD_BOT_TOKEN) return [];
  const url = new URL(`${DISCORD_API}/channels/${channelId}/messages`);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(
    (m: {
      id: string;
      content: string;
      author: { username: string; global_name?: string };
      timestamp: string;
    }) => ({
      id: m.id,
      platform: "discord" as const,
      text: m.content,
      authorUsername: m.author.username,
      authorDisplayName: m.author.global_name ?? m.author.username,
      createdAt: m.timestamp,
    }),
  );
}

// ── Telegram ──

const TG_API = "https://api.telegram.org";

async function telegramTestConnection(): Promise<TestResult> {
  const env = readEnv();
  if (!env.TELEGRAM_BOT_TOKEN)
    return { ok: false, error: "Missing bot token" };
  const res = await fetch(
    `${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/getMe`,
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.description };
  return { ok: true, username: data.result?.username };
}

async function telegramFetchMessages(
  _chatId: string,
  limit = 20,
): Promise<PlatformMessage[]> {
  const env = readEnv();
  if (!env.TELEGRAM_BOT_TOKEN) return [];
  const url = new URL(
    `${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`,
  );
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.ok || !data.result) return [];
  const messages: PlatformMessage[] = [];
  for (const update of data.result) {
    const msg = update.message;
    if (!msg?.text) continue;
    if (_chatId && String(msg.chat.id) !== String(_chatId)) continue;
    messages.push({
      id: String(msg.message_id),
      platform: "telegram",
      text: msg.text,
      authorUsername: msg.from?.username ?? String(msg.from?.id ?? ""),
      authorDisplayName:
        [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
        msg.from?.username ||
        "",
      createdAt: msg.date
        ? new Date(msg.date * 1000).toISOString()
        : null,
    });
  }
  return messages;
}

// ── Public API ──

export async function testConnection(
  platform: PlatformName,
): Promise<TestResult> {
  switch (platform) {
    case "twitter":
      return twitterTestConnection();
    case "discord":
      return discordTestConnection();
    case "telegram":
      return telegramTestConnection();
  }
}

export async function fetchMessages(
  platform: PlatformName,
  sourceId: string,
  limit = 20,
): Promise<PlatformMessage[]> {
  switch (platform) {
    case "twitter":
      return twitterFetchMessages(sourceId, limit);
    case "discord":
      return discordFetchMessages(sourceId, limit);
    case "telegram":
      return telegramFetchMessages(sourceId, limit);
  }
}

export async function fetchAllMessages(
  sources: { platform: PlatformName; sourceId: string }[],
  limit = 20,
): Promise<PlatformMessage[]> {
  const results = await Promise.allSettled(
    sources.map((s) => fetchMessages(s.platform, s.sourceId, limit)),
  );
  const messages: PlatformMessage[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") messages.push(...r.value);
  }
  return messages;
}
