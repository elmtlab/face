import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the filesystem so tests don't touch the real store
let mockStoreData: string | null = null;

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (path: string) => {
      if (path.endsWith("projects.json")) return mockStoreData !== null;
      return actual.existsSync(path);
    },
    readFileSync: (path: string, encoding?: string) => {
      if (typeof path === "string" && path.endsWith("projects.json")) return mockStoreData ?? "";
      return actual.readFileSync(path, encoding as BufferEncoding);
    },
    writeFileSync: (path: string, data: string) => {
      if (typeof path === "string" && path.endsWith("projects.json")) {
        mockStoreData = data;
        return;
      }
      return actual.writeFileSync(path, data);
    },
    mkdirSync: () => {},
  };
});

import { createProject, getProject, listProjects } from "./store";

/**
 * Mirrors the getOrCreateProject helper in the setup chat route.
 * Tests the idempotency pattern: if a session already holds a
 * createdProjectId, return the existing project instead of creating a new one.
 */
function getOrCreateProject(
  createdProjectId: string | null,
  name: string,
  repoLink: string,
) {
  if (createdProjectId) {
    const existing = getProject(createdProjectId);
    if (existing) return existing;
  }
  return createProject(name, repoLink);
}

describe("setup idempotency guard", () => {
  beforeEach(() => {
    mockStoreData = null;
  });

  it("returns existing project when session already has createdProjectId", () => {
    const first = createProject("My Project", "https://github.com/test/repo");

    // Simulate a retry — session already has the project ID
    const second = getOrCreateProject(first.id, "My Project", "https://github.com/test/repo");

    expect(second.id).toBe(first.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("creates a new project when session has no createdProjectId", () => {
    const project = getOrCreateProject(null, "New Project", "");

    expect(project.name).toBe("New Project");
    expect(listProjects()).toHaveLength(1);
  });

  it("falls through to createProject if createdProjectId references a deleted project", () => {
    const first = createProject("Old Project", "");
    const deletedId = first.id;

    // Simulate the project being deleted — reset the store
    mockStoreData = null;

    const project = getOrCreateProject(deletedId, "New Project", "");
    expect(project.name).toBe("New Project");
    expect(project.id).not.toBe(deletedId);
  });
});
