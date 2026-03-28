import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  NotificationProvider,
  NotificationProviderConfig,
  NotificationPayload,
  NotificationResult,
  NotificationEventType,
} from "./types";
import {
  createNotificationProvider,
  registerNotificationProvider,
} from "./registry";
import { SlackProvider } from "./providers/slack";
import { TelegramProvider } from "./providers/telegram";

// Register built-in providers
registerNotificationProvider("slack", () => new SlackProvider());
registerNotificationProvider("telegram", () => new TelegramProvider());

const CONFIG_DIR = join(homedir(), ".face");
const CONFIG_FILE = join(CONFIG_DIR, "notification-providers.json");

interface StoredConfig {
  providers: NotificationProviderConfig[];
}

function loadConfig(): StoredConfig {
  if (!existsSync(CONFIG_FILE)) return { providers: [] };
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return { providers: [] };
  }
}

function saveConfig(config: StoredConfig) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Singleton connected provider cache
const connectedProviders = new Map<string, NotificationProvider>();

export async function getNotificationProvider(
  name: string,
): Promise<NotificationProvider | null> {
  if (connectedProviders.has(name)) {
    return connectedProviders.get(name)!;
  }

  const config = loadConfig();
  const provConfig = config.providers.find((p) => p.name === name);
  if (!provConfig) return null;

  const provider = createNotificationProvider(provConfig);
  await provider.connect(provConfig);
  connectedProviders.set(name, provider);
  return provider;
}

export async function addNotificationProvider(
  config: NotificationProviderConfig,
): Promise<{ ok: boolean; error?: string }> {
  const provider = createNotificationProvider(config);
  await provider.connect(config);
  const test = await provider.testConnection();
  if (!test.ok) return test;

  const stored = loadConfig();
  stored.providers = stored.providers.filter((p) => p.name !== config.name);
  stored.providers.push(config);
  saveConfig(stored);

  connectedProviders.set(config.name, provider);
  return { ok: true };
}

export function listNotificationConfigs(): NotificationProviderConfig[] {
  return loadConfig().providers;
}

export function removeNotificationProvider(name: string) {
  const config = loadConfig();
  config.providers = config.providers.filter((p) => p.name !== name);
  saveConfig(config);
  connectedProviders.delete(name);
}

/**
 * Dispatch a notification to all configured providers that match the event type.
 * Called autonomously by the AI layer when project events occur.
 */
export async function dispatchNotification(
  payload: NotificationPayload,
): Promise<Record<string, NotificationResult>> {
  const config = loadConfig();
  const results: Record<string, NotificationResult> = {};

  for (const provConfig of config.providers) {
    // Skip if provider has an event filter that doesn't include this event
    if (
      provConfig.eventFilter &&
      provConfig.eventFilter.length > 0 &&
      !provConfig.eventFilter.includes(payload.eventType as NotificationEventType)
    ) {
      continue;
    }

    try {
      const provider = await getNotificationProvider(provConfig.name);
      if (provider) {
        results[provConfig.name] = await provider.send(payload);
      }
    } catch (err) {
      results[provConfig.name] = {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return results;
}
