import { describe, it, expect } from "vitest";
import { registerPMSyncProvider, createPMSyncProvider, availablePMSyncProviders } from "../registry";
import type { PMSyncProvider, PMSyncProviderConfig } from "../types";

const mockProvider: PMSyncProvider = {
  type: "test",
  displayName: "Test",
  connect: async () => {},
  testConnection: async () => ({ ok: true }),
  createProject: async () => ({ ok: true, externalId: "p1" }),
  createTask: async () => ({ ok: true, externalId: "t1" }),
  updateTask: async () => ({ ok: true }),
};

describe("PM sync registry", () => {
  it("registers and creates a provider", () => {
    registerPMSyncProvider("test", () => mockProvider);
    expect(availablePMSyncProviders()).toContain("test");

    const config: PMSyncProviderConfig = {
      type: "test",
      name: "My Test",
      credentials: {},
      scope: "test-scope",
      enabled: true,
    };
    const provider = createPMSyncProvider(config);
    expect(provider.type).toBe("test");
  });

  it("throws for unknown provider type", () => {
    expect(() =>
      createPMSyncProvider({
        type: "nonexistent",
        name: "x",
        credentials: {},
        scope: "",
        enabled: true,
      }),
    ).toThrow("Unknown PM sync provider type: nonexistent");
  });
});
