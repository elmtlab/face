export { readEnvFile, writeEnvFile, hasCredentials, getCredentials } from "./env";
export { testTwitterConnection, fetchTwitterMessages } from "./twitter";
export { testDiscordConnection, fetchDiscordMessages } from "./discord";
export { testTelegramConnection, fetchTelegramMessages } from "./telegram";
export { PLATFORM_CONFIGS } from "./types";
export type {
  PlatformType,
  PlatformCredentials,
  PlatformConfig,
  ConnectionStatus,
  PlatformMessage,
  TrendingTopic,
} from "./types";
