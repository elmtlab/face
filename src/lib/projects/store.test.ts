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

import { createProject, listProjects, DuplicateProjectError } from "./store";

describe("createProject", () => {
  beforeEach(() => {
    mockStoreData = null;
  });

  it("creates a project successfully", () => {
    const project = createProject("Test Project", "https://github.com/test/repo");
    expect(project.name).toBe("Test Project");
    expect(project.repoLink).toBe("https://github.com/test/repo");
    expect(project.id).toMatch(/^proj-/);

    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Test Project");
  });

  it("throws DuplicateProjectError for exact name match", () => {
    createProject("My Project", "https://github.com/test/repo");

    expect(() => createProject("My Project", "https://github.com/test/other")).toThrow(
      DuplicateProjectError,
    );
    expect(() => createProject("My Project", "https://github.com/test/other")).toThrow(
      'A project named "My Project" already exists',
    );

    expect(listProjects()).toHaveLength(1);
  });

  it("throws DuplicateProjectError for case-insensitive name match", () => {
    createProject("My Project", "https://github.com/test/repo");

    expect(() => createProject("my project", "")).toThrow(DuplicateProjectError);
    expect(() => createProject("MY PROJECT", "")).toThrow(DuplicateProjectError);

    expect(listProjects()).toHaveLength(1);
  });

  it("allows different project names", () => {
    createProject("Project A", "");
    createProject("Project B", "");

    expect(listProjects()).toHaveLength(2);
  });
});
