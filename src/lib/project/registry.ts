import type { ProjectProvider, ProjectProviderConfig, ProviderFactory } from "./types";

const factories = new Map<string, ProviderFactory>();

export function registerProvider(type: string, factory: ProviderFactory) {
  factories.set(type, factory);
}

export function createProvider(config: ProjectProviderConfig): ProjectProvider {
  const factory = factories.get(config.type);
  if (!factory) {
    throw new Error(`Unknown project provider type: ${config.type}. Available: ${[...factories.keys()].join(", ")}`);
  }
  return factory();
}

export function availableProviders(): string[] {
  return [...factories.keys()];
}
