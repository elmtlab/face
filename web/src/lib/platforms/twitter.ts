import { readEnvFile } from "./env";
import type { ConnectionStatus, PlatformMessage } from "./types";

export async function testTwitterConnection(): Promise<ConnectionStatus> {
  const env = readEnvFile();
  const bearerToken = env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return { platform: "twitter", connected: false, error: "Bearer token not configured" };
  }

  try {
    const res = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      return { platform: "twitter", connected: false, error: `API error ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = await res.json();
    return { platform: "twitter", connected: true, username: `@${data.data.username}` };
  } catch (err) {
    return { platform: "twitter", connected: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

export async function fetchTwitterMessages(keywords: string[]): Promise<PlatformMessage[]> {
  const env = readEnvFile();
  const bearerToken = env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return [];

  const query = keywords.map((k) => `"${k}"`).join(" OR ");
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "author_id,created_at,text");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.data) return [];

    return data.data.map((tweet: { id: string; text: string; author_id: string; created_at: string }) => ({
      id: tweet.id,
      platform: "twitter" as const,
      author: tweet.author_id,
      body: tweet.text,
      timestamp: tweet.created_at,
    }));
  } catch {
    return [];
  }
}
