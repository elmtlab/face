import { readEnvFile } from "./env";
import type { ConnectionStatus, PlatformMessage } from "./types";

const BASE_URL = "https://discord.com/api/v10";

async function discordFetch(path: string, token: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function testDiscordConnection(): Promise<ConnectionStatus> {
  const env = readEnvFile();
  const token = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;
  if (!token) {
    return { platform: "discord", connected: false, error: "Bot token not configured" };
  }

  try {
    const res = await discordFetch("/users/@me", token);
    if (!res.ok) {
      const body = await res.text();
      return { platform: "discord", connected: false, error: `API error ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = await res.json();
    let username = data.username;

    if (guildId) {
      const guildRes = await discordFetch(`/guilds/${guildId}`, token);
      if (guildRes.ok) {
        const guild = await guildRes.json();
        username = `${data.username} in ${guild.name}`;
      }
    }

    return { platform: "discord", connected: true, username };
  } catch (err) {
    return { platform: "discord", connected: false, error: `Connection failed: ${(err as Error).message}` };
  }
}

export async function fetchDiscordMessages(): Promise<PlatformMessage[]> {
  const env = readEnvFile();
  const token = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;
  if (!token || !guildId) return [];

  try {
    const channelsRes = await discordFetch(`/guilds/${guildId}/channels`, token);
    if (!channelsRes.ok) return [];
    const channels = await channelsRes.json();

    const textChannels = channels
      .filter((ch: { type: number }) => ch.type === 0)
      .slice(0, 5);

    const messages: PlatformMessage[] = [];

    for (const channel of textChannels) {
      try {
        const msgRes = await discordFetch(`/channels/${channel.id}/messages?limit=50`, token);
        if (!msgRes.ok) continue;
        const msgs = await msgRes.json();
        for (const msg of msgs) {
          if (msg.author.bot) continue;
          messages.push({
            id: msg.id,
            platform: "discord",
            author: msg.author.username,
            body: msg.content,
            timestamp: msg.timestamp,
          });
        }
      } catch {
        continue;
      }
    }

    return messages;
  } catch {
    return [];
  }
}
