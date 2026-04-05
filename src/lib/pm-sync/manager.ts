import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { PMSyncProvider, PMSyncProviderConfig } from "./types";
import { createPMSyncProvider, registerPMSyncProvider } from "./registry";
import { LinearSyncProvider } from "./providers/linear";

// Register built-in providers
registerPMSyncProvider("linear", () => new LinearSyncProvider());

const CONFIG_DIR = join(homedir(), ".face");
const CONFIG_FILE = join(CONFIG_DIR, "pm-sync-providers.json");

interface StoredConfig {
  providers: PMSyncProviderConfig[];
  /** Name of the active PM sync provider */
  activeProvider?: string;
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
const connectedProviders = new Map<string, PMSyncProvider>();

export async function getActivePMSyncProvider(): Promise<PMSyncProvider | null> {
  const config = loadConfig();
  const activeName = config.activeProvider ?? config.providers.find((p) => p.enabled)?.name;
  if (!activeName) return null;

  if (connectedProviders.has(activeName)) {
    return connectedProviders.get(activeName)!;
  }

  const provConfig = config.providers.find((p) => p.name === activeName);
  if (!provConfig || !provConfig.enabled) return null;

  const provider = createPMSyncProvider(provConfig);
  await provider.connect(provConfig);
  connectedProviders.set(activeName, provider);
  return provider;
}

export async function addPMSyncProvider(
  config: PMSyncProviderConfig,
): Promise<{ ok: boolean; error?: string }> {
  const provider = createPMSyncProvider(config);
  await provider.connect(config);
  const test = await provider.testConnection();
  if (!test.ok) return test;

  const stored = loadConfig();
  stored.providers = stored.providers.filter((p) => p.name !== config.name);
  stored.providers.push(config);
  if (!stored.activeProvider) stored.activeProvider = config.name;
  saveConfig(stored);

  connectedProviders.set(config.name, provider);
  return { ok: true };
}

export function listPMSyncConfigs(): PMSyncProviderConfig[] {
  return loadConfig().providers;
}

export function getActivePMSyncProviderName(): string | null {
  const config = loadConfig();
  return config.activeProvider ?? config.providers.find((p) => p.enabled)?.name ?? null;
}

export function setActivePMSyncProvider(name: string): boolean {
  const config = loadConfig();
  if (!config.providers.find((p) => p.name === name)) return false;
  config.activeProvider = name;
  saveConfig(config);
  connectedProviders.delete(name); // force reconnect
  return true;
}

export function removePMSyncProvider(name: string) {
  const config = loadConfig();
  config.providers = config.providers.filter((p) => p.name !== name);
  if (config.activeProvider === name) {
    config.activeProvider = config.providers.find((p) => p.enabled)?.name;
  }
  saveConfig(config);
  connectedProviders.delete(name);
}

export function updatePMSyncProvider(
  name: string,
  updates: Partial<Pick<PMSyncProviderConfig, "enabled" | "credentials" | "scope">>,
): boolean {
  const config = loadConfig();
  const provider = config.providers.find((p) => p.name === name);
  if (!provider) return false;

  if (updates.enabled !== undefined) provider.enabled = updates.enabled;
  if (updates.credentials !== undefined) provider.credentials = updates.credentials;
  if (updates.scope !== undefined) provider.scope = updates.scope;

  saveConfig(config);
  connectedProviders.delete(name); // force reconnect on next use
  return true;
}
