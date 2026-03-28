import type {
  NotificationProvider,
  NotificationProviderConfig,
  NotificationProviderFactory,
} from "./types";

const factories = new Map<string, NotificationProviderFactory>();

export function registerNotificationProvider(
  type: string,
  factory: NotificationProviderFactory,
) {
  factories.set(type, factory);
}

export function createNotificationProvider(
  config: NotificationProviderConfig,
): NotificationProvider {
  const factory = factories.get(config.type);
  if (!factory) {
    throw new Error(
      `Unknown notification provider type: ${config.type}. Available: ${[...factories.keys()].join(", ")}`,
    );
  }
  return factory();
}

export function availableNotificationProviders(): string[] {
  return [...factories.keys()];
}
