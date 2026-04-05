import type { PMSyncProvider, PMSyncProviderConfig, PMSyncProviderFactory } from "./types";

const factories = new Map<string, PMSyncProviderFactory>();

export function registerPMSyncProvider(type: string, factory: PMSyncProviderFactory) {
  factories.set(type, factory);
}

export function createPMSyncProvider(config: PMSyncProviderConfig): PMSyncProvider {
  const factory = factories.get(config.type);
  if (!factory) {
    throw new Error(
      `Unknown PM sync provider type: ${config.type}. Available: ${[...factories.keys()].join(", ")}`,
    );
  }
  return factory();
}

export function availablePMSyncProviders(): string[] {
  return [...factories.keys()];
}
