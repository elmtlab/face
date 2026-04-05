import type {
  PlatformAdapter,
  PlatformAdapterConfig,
  PlatformAdapterFactory,
} from "./types";

const factories = new Map<string, PlatformAdapterFactory>();

export function registerPlatformAdapter(
  type: string,
  factory: PlatformAdapterFactory,
) {
  factories.set(type, factory);
}

export function createPlatformAdapter(
  config: PlatformAdapterConfig,
): PlatformAdapter {
  const factory = factories.get(config.type);
  if (!factory) {
    throw new Error(
      `Unknown platform adapter type: ${config.type}. Available: ${[...factories.keys()].join(", ")}`,
    );
  }
  return factory();
}

export function availablePlatformAdapters(): string[] {
  return [...factories.keys()];
}
