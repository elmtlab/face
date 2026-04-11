export interface PlatformCredentials {
  [key: string]: string;
}

export interface PlatformConfig {
  type: PlatformType;
  displayName: string;
  credentials: { key: string; label: string; placeholder: string }[];
}

export type PlatformType = "twitter" | "discord" | "telegram";

export interface ConnectionStatus {
  platform: PlatformType;
  connected: boolean;
  username?: string;
  error?: string;
}

export interface PlatformMessage {
  id: string;
  platform: PlatformType;
  author: string;
  body: string;
  timestamp: string;
}

export interface TrendingTopic {
  keyword: string;
  score: number;
  count: number;
  platforms: PlatformType[];
  sampleMessages: string[];
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    type: "twitter",
    displayName: "X / Twitter",
    credentials: [
      { key: "TWITTER_API_KEY", label: "API Key", placeholder: "Consumer API key" },
      { key: "TWITTER_API_SECRET", label: "API Secret", placeholder: "Consumer API secret" },
      { key: "TWITTER_ACCESS_TOKEN", label: "Access Token", placeholder: "OAuth access token" },
      { key: "TWITTER_ACCESS_TOKEN_SECRET", label: "Access Token Secret", placeholder: "OAuth access token secret" },
      { key: "TWITTER_BEARER_TOKEN", label: "Bearer Token", placeholder: "Bearer token for read access" },
    ],
  },
  {
    type: "discord",
    displayName: "Discord",
    credentials: [
      { key: "DISCORD_BOT_TOKEN", label: "Bot Token", placeholder: "Discord bot token" },
      { key: "DISCORD_GUILD_ID", label: "Guild ID", placeholder: "Target server ID" },
    ],
  },
  {
    type: "telegram",
    displayName: "Telegram",
    credentials: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", placeholder: "Token from @BotFather" },
      { key: "TELEGRAM_CHAT_ID", label: "Chat ID", placeholder: "Target chat/group ID" },
    ],
  },
];
