import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const LISTENER_DIR = "/Users/czhong/Documents/ui/listener";
const ENV_PATH = join(LISTENER_DIR, ".env");

export interface ListenerEnv {
  X_API_KEY: string;
  X_API_SECRET: string;
  X_ACCESS_TOKEN: string;
  X_ACCESS_TOKEN_SECRET: string;
  X_BEARER_TOKEN: string;
  DISCORD_BOT_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
}

const ALL_KEYS: (keyof ListenerEnv)[] = [
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
  "X_BEARER_TOKEN",
  "DISCORD_BOT_TOKEN",
  "TELEGRAM_BOT_TOKEN",
];

export function readEnv(): Partial<ListenerEnv> {
  if (!existsSync(ENV_PATH)) return {};
  const content = readFileSync(ENV_PATH, "utf-8");
  const env: Partial<ListenerEnv> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (ALL_KEYS.includes(key as keyof ListenerEnv)) {
      env[key as keyof ListenerEnv] = value;
    }
  }
  return env;
}

export function writeEnv(values: Partial<ListenerEnv>): void {
  const existing = readEnv();
  const merged = { ...existing, ...values };
  const lines: string[] = ["# Listener platform credentials"];
  for (const key of ALL_KEYS) {
    const val = merged[key];
    if (val !== undefined && val !== "") {
      lines.push(`${key}="${val}"`);
    }
  }
  lines.push(""); // trailing newline
  writeFileSync(ENV_PATH, lines.join("\n"), "utf-8");
}

export type PlatformName = "twitter" | "discord" | "telegram";

export function getConnectionStatus(): Record<
  PlatformName,
  { configured: boolean }
> {
  const env = readEnv();
  return {
    twitter: {
      configured: !!(env.X_BEARER_TOKEN && env.X_API_KEY && env.X_API_SECRET),
    },
    discord: {
      configured: !!env.DISCORD_BOT_TOKEN,
    },
    telegram: {
      configured: !!env.TELEGRAM_BOT_TOKEN,
    },
  };
}
