import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ProjectProvider, ProjectProviderConfig } from "./types";
import { createProvider, registerProvider } from "./registry";
import { GitHubProvider } from "./providers/github";
import { LinearProvider } from "./providers/linear";
import { JiraProvider } from "./providers/jira";
import { getMergedPrompt } from "./prompts/prompt-merger";

// Register built-in providers
registerProvider("github", () => new GitHubProvider());
registerProvider("linear", () => new LinearProvider());
registerProvider("jira", () => new JiraProvider());

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

  // Log the effective prompt state for this provider
  const merged = getMergedPrompt(provConfig.type);
  if (merged) {
    console.error(`[face] provider ${provConfig.type}: prompt v${merged.baseVersion} with ${merged.patchCount} patch(es)`);
  }

  return provider;
}

/**
 * Connect and return every configured provider.
 * Results are cached the same way getActiveProvider() caches.
 */
export async function getAllProviders(): Promise<ProjectProvider[]> {
  const config = loadConfig();
  const providers: ProjectProvider[] = [];
  for (const provConfig of config.providers) {
    if (connectedProviders.has(provConfig.name)) {
      providers.push(connectedProviders.get(provConfig.name)!);
      continue;
    }
    try {
      const provider = createProvider(provConfig);
      await provider.connect(provConfig);
      connectedProviders.set(provConfig.name, provider);
      providers.push(provider);
    } catch {
      // Skip providers that fail to connect
    }
  }
  return providers;
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
