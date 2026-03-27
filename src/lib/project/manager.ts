import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ProjectProvider, ProjectProviderConfig } from "./types";
import { createProvider, registerProvider } from "./registry";
import { GitHubProvider } from "./providers/github";
import { LinearProvider } from "./providers/linear";

// Register built-in providers
registerProvider("github", () => new GitHubProvider());
registerProvider("linear", () => new LinearProvider());

const CONFIG_DIR = join(homedir(), ".face");
const CONFIG_FILE = join(CONFIG_DIR, "project-providers.json");

interface StoredConfig {
  providers: ProjectProviderConfig[];
  activeProvider?: string; // index by name
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
const connectedProviders = new Map<string, ProjectProvider>();

export async function getActiveProvider(): Promise<ProjectProvider | null> {
  const config = loadConfig();
  const activeName = config.activeProvider ?? config.providers[0]?.name;
  if (!activeName) return null;

  if (connectedProviders.has(activeName)) {
    return connectedProviders.get(activeName)!;
  }

  const provConfig = config.providers.find((p) => p.name === activeName);
  if (!provConfig) return null;

  const provider = createProvider(provConfig);
  await provider.connect(provConfig);
  connectedProviders.set(activeName, provider);
  return provider;
}

export async function addProvider(config: ProjectProviderConfig): Promise<{ ok: boolean; error?: string }> {
  const provider = createProvider(config);
  await provider.connect(config);
  const test = await provider.testConnection();
  if (!test.ok) return test;

  const stored = loadConfig();
  // Replace if same name exists
  stored.providers = stored.providers.filter((p) => p.name !== config.name);
  stored.providers.push(config);
  if (!stored.activeProvider) stored.activeProvider = config.name;
  saveConfig(stored);

  connectedProviders.set(config.name, provider);
  return { ok: true };
}

export function listProviderConfigs(): ProjectProviderConfig[] {
  return loadConfig().providers;
}

export function getActiveProviderName(): string | null {
  const config = loadConfig();
  return config.activeProvider ?? config.providers[0]?.name ?? null;
}

export function setActiveProvider(name: string): boolean {
  const config = loadConfig();
  if (!config.providers.find((p) => p.name === name)) return false;
  config.activeProvider = name;
  saveConfig(config);
  connectedProviders.delete(name); // force reconnect
  return true;
}

export function removeProvider(name: string) {
  const config = loadConfig();
  config.providers = config.providers.filter((p) => p.name !== name);
  if (config.activeProvider === name) {
    config.activeProvider = config.providers[0]?.name;
  }
  saveConfig(config);
  connectedProviders.delete(name);
}
