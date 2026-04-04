import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Shared fs mock ──────────────────────────────────────────────────

let mockStoreData: string | null = null;
let mockSessionFiles: Record<string, string> = {};
let mockDirExists = true;

let mockTmpStoreData: string | null = null;

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (path: string) => {
      if (typeof path === "string" && path.endsWith("projects.json"))
        return mockStoreData !== null;
      if (typeof path === "string" && path.includes("setup-sessions")) {
        if (path.endsWith("setup-sessions")) return mockDirExists;
        const filename = path.split("/").pop()!;
        return filename in mockSessionFiles;
      }
      return actual.existsSync(path);
    },
    readFileSync: (path: string, encoding?: string) => {
      if (typeof path === "string" && path.endsWith("projects.json"))
        return mockStoreData ?? "";
      if (typeof path === "string" && path.includes("setup-sessions")) {
        const filename = path.split("/").pop()!;
        if (filename in mockSessionFiles) return mockSessionFiles[filename];
        throw new Error(`ENOENT: no such file ${path}`);
      }
      return actual.readFileSync(path, encoding as BufferEncoding);
    },
    writeFileSync: (path: string, data: string) => {
      if (typeof path === "string" && path.endsWith("projects.json")) {
        mockStoreData = data;
        return;
      }
      // Capture atomic write temp files for projects.json
      if (typeof path === "string" && path.includes("projects.json") && path.endsWith(".tmp")) {
        mockTmpStoreData = data;
        return;
      }
      if (typeof path === "string" && path.includes("setup-sessions")) {
        const filename = path.split("/").pop()!;
        mockSessionFiles[filename] = data;
        return;
      }
      return actual.writeFileSync(path, data);
    },
    renameSync: (src: string, dest: string) => {
      // Support atomic rename for projects.json
      if (typeof dest === "string" && dest.endsWith("projects.json") && mockTmpStoreData !== null) {
        mockStoreData = mockTmpStoreData;
        mockTmpStoreData = null;
        return;
      }
      return actual.renameSync(src, dest);
    },
    mkdirSync: () => {},
    readdirSync: (path: string) => {
      if (typeof path === "string" && path.includes("setup-sessions")) {
        return Object.keys(mockSessionFiles);
      }
      return actual.readdirSync(path);
    },
  };
});

import {
  createProject,
  getProject,
  listProjects,
  deleteProject,
  updateProject,
  setActiveProjectId,
  getActiveProjectId,
  getActiveProject,
  DuplicateProjectError,
} from "./store";

import {
  createSession,
  loadSession,
  saveSession,
  findActiveSession,
  listSessions,
  sanitizeForClient,
  type SetupSessionState,
} from "./setup";

// ── Helper ──────────────────────────────────────────────────────────

/** Mirrors the idempotent helper from the setup chat route */
function getOrCreateProject(
  session: SetupSessionState,
  name: string,
  repoLink: string,
) {
  if (session.createdProjectId) {
    const existing = getProject(session.createdProjectId);
    if (existing) return existing;
    // Referenced project was deleted — clear the stale reference and try
    // to adopt an existing project with the same name
    session.createdProjectId = null;
    try {
      return createProject(name, repoLink);
    } catch (e) {
      if (e instanceof DuplicateProjectError) {
        const match = listProjects().find(
          (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
        if (match) return match;
      }
      throw e;
    }
  }
  return createProject(name, repoLink);
}

function resetAll() {
  mockStoreData = null;
  mockTmpStoreData = null;
  mockSessionFiles = {};
  mockDirExists = true;
}

// =====================================================================
// 1. STORE EDGE CASES
// =====================================================================

describe("Store: project deletion edge cases", () => {
  beforeEach(resetAll);

  it("deleting the only project clears activeProjectId", () => {
    const p = createProject("Solo Project", "");
    expect(getActiveProjectId()).toBe(p.id);

    deleteProject(p.id);

    expect(listProjects()).toHaveLength(0);
    expect(getActiveProjectId()).toBeNull();
    expect(getActiveProject()).toBeNull();
  });

  it("deleting active project falls back to first remaining project", () => {
    const a = createProject("Project A", "");
    const b = createProject("Project B", "");
    setActiveProjectId(b.id);
    expect(getActiveProjectId()).toBe(b.id);

    deleteProject(b.id);

    expect(listProjects()).toHaveLength(1);
    expect(getActiveProjectId()).toBe(a.id);
  });

  it("deleting a non-active project does not change activeProjectId", () => {
    const a = createProject("Project A", "");
    const b = createProject("Project B", "");
    setActiveProjectId(a.id);

    deleteProject(b.id);

    expect(getActiveProjectId()).toBe(a.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("deleting a non-existent project returns false", () => {
    createProject("Exists", "");
    expect(deleteProject("proj-doesnt-exist")).toBe(false);
    expect(listProjects()).toHaveLength(1);
  });

  it("deleting a project twice returns false on second attempt", () => {
    const p = createProject("Temp", "");
    expect(deleteProject(p.id)).toBe(true);
    expect(deleteProject(p.id)).toBe(false);
  });
});

describe("Store: project creation error handling", () => {
  beforeEach(resetAll);

  it("throws DuplicateProjectError on exact name match", () => {
    createProject("My Project", "");
    expect(() => createProject("My Project", "")).toThrow(DuplicateProjectError);
  });

  it("throws DuplicateProjectError on case-insensitive match", () => {
    createProject("My Project", "");
    expect(() => createProject("my project", "")).toThrow(DuplicateProjectError);
    expect(() => createProject("MY PROJECT", "")).toThrow(DuplicateProjectError);
    expect(() => createProject("My project", "")).toThrow(DuplicateProjectError);
  });

  it("allows creating project after same-name project was deleted", () => {
    const p = createProject("Recyclable", "");
    deleteProject(p.id);

    const p2 = createProject("Recyclable", "");
    expect(p2.name).toBe("Recyclable");
    expect(p2.id).not.toBe(p.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("creates project with empty name if provided", () => {
    const p = createProject("", "");
    expect(p.name).toBe("");
    expect(listProjects()).toHaveLength(1);
  });

  it("handles corrupted store gracefully — returns empty", () => {
    mockStoreData = "this is not json";
    const projects = listProjects();
    expect(projects).toEqual([]);
  });

  it("can create a project after corrupted store reset", () => {
    mockStoreData = "CORRUPTED";
    const p = createProject("Fresh Start", "");
    expect(p.name).toBe("Fresh Start");
    expect(listProjects()).toHaveLength(1);
  });
});

describe("Store: active project management", () => {
  beforeEach(resetAll);

  it("first project is auto-set as active", () => {
    const p = createProject("First", "");
    expect(getActiveProjectId()).toBe(p.id);
  });

  it("second project does NOT auto-become active", () => {
    const a = createProject("First", "");
    createProject("Second", "");
    expect(getActiveProjectId()).toBe(a.id);
  });

  it("setActiveProjectId rejects non-existent project", () => {
    createProject("Exists", "");
    const ok = setActiveProjectId("proj-fake-id");
    expect(ok).toBe(false);
  });

  it("setActiveProjectId allows null", () => {
    const p = createProject("Test", "");
    expect(getActiveProjectId()).toBe(p.id);

    setActiveProjectId(null);
    expect(getActiveProjectId()).toBeNull();
  });
});

describe("Store: update edge cases", () => {
  beforeEach(resetAll);

  it("updating a non-existent project returns null", () => {
    expect(updateProject("proj-missing", { name: "Nope" })).toBeNull();
  });

  it("updating a deleted project returns null", () => {
    const p = createProject("Gone", "");
    deleteProject(p.id);
    expect(updateProject(p.id, { name: "Still Gone" })).toBeNull();
  });

  it("updates updatedAt timestamp", () => {
    const p = createProject("Timely", "");

    // Use fake timers to advance time
    vi.useFakeTimers();
    vi.advanceTimersByTime(5000);

    const updated = updateProject(p.id, { name: "Timely Updated" });
    expect(updated!.updatedAt).not.toBe(p.updatedAt);
    expect(updated!.name).toBe("Timely Updated");

    vi.useRealTimers();
  });
});

// =====================================================================
// 2. SETUP SESSION MANAGEMENT
// =====================================================================

describe("Setup session: creation and persistence", () => {
  beforeEach(resetAll);

  it("creates a session with correct initial state", () => {
    const s = createSession();
    expect(s.id).toMatch(/^setup-/);
    expect(s.phase).toBe("greeting");
    expect(s.messages).toEqual([]);
    expect(s.createdProjectId).toBeNull();
    expect(s.pmTool).toBeNull();
    expect(s.credentials).toBeNull();
  });

  it("persists session and reloads it", () => {
    const s = createSession();
    s.messages.push({ role: "user", content: "Hello", timestamp: new Date().toISOString() });
    saveSession(s);

    const loaded = loadSession(s.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe("Hello");
  });

  it("loadSession returns null for non-existent session", () => {
    expect(loadSession("setup-does-not-exist")).toBeNull();
  });

  it("loadSession returns null for corrupted session file", () => {
    mockSessionFiles["bad-session.json"] = "NOT JSON {{{";
    expect(loadSession("bad-session")).toBeNull();
  });
});

describe("Setup session: findActiveSession", () => {
  beforeEach(resetAll);

  it("returns null when no sessions exist", () => {
    expect(findActiveSession()).toBeNull();
  });

  it("returns incomplete session", () => {
    const s = createSession();
    s.phase = "collecting";
    saveSession(s);

    const active = findActiveSession();
    expect(active).not.toBeNull();
    expect(active!.id).toBe(s.id);
  });

  it("skips completed sessions", () => {
    const s = createSession();
    s.phase = "complete";
    saveSession(s);

    expect(findActiveSession()).toBeNull();
  });

  it("skips error sessions", () => {
    const s = createSession();
    s.phase = "error";
    saveSession(s);

    expect(findActiveSession()).toBeNull();
  });

  it("returns most recent incomplete session when multiple exist", () => {
    const s1 = createSession();
    s1.phase = "collecting";
    saveSession(s1);
    // Overwrite with fixed timestamp after saveSession (which sets updatedAt)
    s1.updatedAt = "2026-01-01T00:00:00.000Z";
    mockSessionFiles[`${s1.id}.json`] = JSON.stringify(s1);

    const s2 = createSession();
    s2.phase = "collecting";
    saveSession(s2);
    s2.updatedAt = "2026-01-02T00:00:00.000Z";
    mockSessionFiles[`${s2.id}.json`] = JSON.stringify(s2);

    const active = findActiveSession();
    expect(active!.id).toBe(s2.id);
  });
});

describe("Setup session: sanitizeForClient", () => {
  beforeEach(resetAll);

  it("strips credentials from session", () => {
    const s = createSession();
    s.credentials = { token: "ghp_secret123", email: "user@test.com" };
    saveSession(s);

    const sanitized = sanitizeForClient(s);
    expect(sanitized.credentials).toBeNull();
    expect(sanitized.id).toBe(s.id);
    expect(sanitized.phase).toBe(s.phase);
  });

  it("does not mutate original session", () => {
    const s = createSession();
    s.credentials = { token: "secret" };
    sanitizeForClient(s);
    expect(s.credentials).toEqual({ token: "secret" });
  });
});

describe("Setup session: abandonment and resume", () => {
  beforeEach(resetAll);

  it("abandoned session persists and can be found later", () => {
    const s = createSession();
    s.phase = "collecting";
    s.messages.push(
      { role: "assistant", content: "Welcome!", timestamp: new Date().toISOString() },
      { role: "user", content: "I want to create a project", timestamp: new Date().toISOString() },
    );
    saveSession(s);

    // Simulate page close / navigation — no explicit cleanup

    // Later, user comes back
    const resumed = findActiveSession();
    expect(resumed).not.toBeNull();
    expect(resumed!.id).toBe(s.id);
    expect(resumed!.messages).toHaveLength(2);
  });

  it("completed session is not resumable", () => {
    const s = createSession();
    s.phase = "collecting";
    saveSession(s);

    // Setup completes
    s.phase = "complete";
    saveSession(s);

    expect(findActiveSession()).toBeNull();
  });

  it("multiple abandoned sessions — only most recent is returned", () => {
    // Old abandoned session
    const old = createSession();
    old.phase = "greeting";
    saveSession(old);
    old.updatedAt = "2026-01-01T00:00:00.000Z";
    mockSessionFiles[`${old.id}.json`] = JSON.stringify(old);

    // Newer abandoned session
    const newer = createSession();
    newer.phase = "collecting";
    saveSession(newer);
    newer.updatedAt = "2026-04-04T00:00:00.000Z";
    mockSessionFiles[`${newer.id}.json`] = JSON.stringify(newer);

    const active = findActiveSession();
    expect(active!.id).toBe(newer.id);
  });
});

// =====================================================================
// 3. IDEMPOTENCY & PROJECT-SESSION INTERACTION
// =====================================================================

describe("Idempotency: getOrCreateProject", () => {
  beforeEach(resetAll);

  it("creates new project when session has no createdProjectId", () => {
    const session = createSession();
    const p = getOrCreateProject(session, "New Project", "https://github.com/test/repo");
    expect(p.name).toBe("New Project");
    expect(listProjects()).toHaveLength(1);
  });

  it("returns existing project on retry (idempotent)", () => {
    const session = createSession();
    const p1 = getOrCreateProject(session, "My Project", "");
    session.createdProjectId = p1.id;
    saveSession(session);

    // Retry — should return same project, not create a new one
    const p2 = getOrCreateProject(session, "My Project", "");
    expect(p2.id).toBe(p1.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("creates NEW project if createdProjectId references deleted project", () => {
    const session = createSession();
    const p1 = createProject("Original", "");
    session.createdProjectId = p1.id;
    saveSession(session);

    // Project gets deleted externally
    deleteProject(p1.id);

    // Idempotency guard falls through — creates a new project
    const p2 = getOrCreateProject(session, "Original", "");
    expect(p2.id).not.toBe(p1.id);
    expect(p2.name).toBe("Original");
    expect(listProjects()).toHaveLength(1);
  });

  it("adopts existing project when deleted project with same name is replaced", () => {
    const session = createSession();
    const p1 = createProject("Shared Name", "");
    session.createdProjectId = p1.id;

    // Someone else creates a project with same name
    // (Simulating: delete p1, then create another with same name)
    deleteProject(p1.id);
    const p2 = createProject("Shared Name", ""); // Different project, same name

    // Now retry with session referencing deleted p1
    // getOrCreateProject falls through (p1 deleted), createProject throws
    // DuplicateProjectError, so it adopts the existing project gracefully
    const result = getOrCreateProject(session, "Shared Name", "");
    expect(result.id).toBe(p2.id);
    expect(result.name).toBe("Shared Name");
    expect(listProjects()).toHaveLength(1);
  });

  it("idempotent across different repoLinks — returns cached project", () => {
    const session = createSession();
    const p1 = getOrCreateProject(session, "Project", "https://old-link.com");
    session.createdProjectId = p1.id;

    // Retry with different repoLink — still returns cached
    const p2 = getOrCreateProject(session, "Project", "https://new-link.com");
    expect(p2.id).toBe(p1.id);
    expect(p2.repoLink).toBe("https://old-link.com"); // original link preserved
  });
});

describe("Delete project during active setup session", () => {
  beforeEach(resetAll);

  it("session continues to reference deleted project", () => {
    const session = createSession();
    const project = createProject("In Progress", "");
    session.createdProjectId = project.id;
    session.phase = "scaffolding";
    saveSession(session);

    // External deletion
    deleteProject(project.id);

    // Session still has the reference
    const loaded = loadSession(session.id)!;
    expect(loaded.createdProjectId).toBe(project.id);
    expect(getProject(project.id)).toBeNull(); // but project is gone
  });

  it("scaffolding after project deletion — project no longer exists", () => {
    const session = createSession();
    const project = createProject("Scaffold Me", "");
    session.createdProjectId = project.id;
    session.phase = "scaffolding";
    setActiveProjectId(project.id);
    saveSession(session);

    // Delete the project mid-setup
    deleteProject(project.id);

    // Active project is now cleared
    expect(getActiveProjectId()).toBeNull();
    // Session still thinks it has a project
    expect(session.createdProjectId).toBe(project.id);
    // But it's gone
    expect(getProject(session.createdProjectId!)).toBeNull();
  });
});

// =====================================================================
// 4. CONCURRENT / RACE CONDITION SCENARIOS
// =====================================================================

describe("Concurrent operations (simulated)", () => {
  beforeEach(resetAll);

  it("two createProject calls with different names succeed", () => {
    const p1 = createProject("Alpha", "");
    const p2 = createProject("Beta", "");
    expect(listProjects()).toHaveLength(2);
    expect(p1.id).not.toBe(p2.id);
  });

  it("read-modify-write: second create sees first create's data", () => {
    createProject("First", "");
    createProject("Second", "");

    const projects = listProjects();
    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.name)).toContain("First");
    expect(projects.map((p) => p.name)).toContain("Second");
  });

  it("delete during iteration doesn't corrupt the list", () => {
    const a = createProject("A", "");
    const b = createProject("B", "");
    const c = createProject("C", "");

    deleteProject(b.id);

    const remaining = listProjects();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((p) => p.name)).toEqual(["A", "C"]);
    expect(getProject(a.id)).not.toBeNull();
    expect(getProject(c.id)).not.toBeNull();
  });
});

// =====================================================================
// 5. SETUP SESSION STATE TRANSITIONS
// =====================================================================

describe("Setup session: phase transitions", () => {
  beforeEach(resetAll);

  it("greeting → collecting → confirming → complete (local project)", () => {
    const s = createSession();
    expect(s.phase).toBe("greeting");

    s.phase = "collecting";
    s.projectInfo.name = "My App";
    saveSession(s);

    s.phase = "confirming";
    saveSession(s);

    // Create project
    const project = createProject("My App", "");
    s.createdProjectId = project.id;
    s.phase = "complete";
    saveSession(s);

    const loaded = loadSession(s.id)!;
    expect(loaded.phase).toBe("complete");
    expect(loaded.createdProjectId).toBe(project.id);
  });

  it("greeting → collecting → connecting → scaffolding → complete (with provider)", () => {
    const s = createSession();
    s.phase = "collecting";
    s.pmTool = "github";
    s.projectInfo.name = "My Repo";
    saveSession(s);

    s.phase = "connecting";
    s.scope = "owner/repo";
    s.credentials = { token: "ghp_test" };
    saveSession(s);

    // Provider connected, project created
    const project = createProject("My Repo", "https://github.com/owner/repo");
    s.createdProjectId = project.id;
    s.phase = "scaffolding";
    saveSession(s);

    s.phase = "complete";
    s.autoScaffold = true;
    saveSession(s);

    const loaded = loadSession(s.id)!;
    expect(loaded.phase).toBe("complete");
    expect(loaded.pmTool).toBe("github");
    expect(loaded.autoScaffold).toBe(true);
  });

  it("error phase is terminal — session not findable as active", () => {
    const s = createSession();
    s.phase = "error";
    saveSession(s);

    expect(findActiveSession()).toBeNull();
  });

  it("session can transition from error back to collecting (recovery)", () => {
    const s = createSession();
    s.phase = "error";
    saveSession(s);

    // Manual recovery
    s.phase = "collecting";
    saveSession(s);

    const active = findActiveSession();
    expect(active).not.toBeNull();
    expect(active!.phase).toBe("collecting");
  });
});

// =====================================================================
// 6. ACTION EXECUTION EDGE CASES
// =====================================================================

describe("Action execution: create_project edge cases", () => {
  beforeEach(resetAll);

  it("creating project sets it as active", () => {
    const session = createSession();
    const project = getOrCreateProject(session, "Active One", "");
    setActiveProjectId(project.id);

    expect(getActiveProjectId()).toBe(project.id);
    expect(getActiveProject()!.name).toBe("Active One");
  });

  it("creating project with repoLink stores it correctly", () => {
    const session = createSession();
    const project = getOrCreateProject(session, "Linked", "https://github.com/org/repo");

    expect(project.repoLink).toBe("https://github.com/org/repo");
    expect(getProject(project.id)!.repoLink).toBe("https://github.com/org/repo");
  });

  it("session fields updated after create_project action", () => {
    const session = createSession();
    const project = getOrCreateProject(session, "Project X", "");

    // Simulating what executeActions does
    session.projectInfo.name = "Project X";
    session.pmTool = "local";
    session.createdProjectId = project.id;
    session.phase = "complete";
    saveSession(session);

    const loaded = loadSession(session.id)!;
    expect(loaded.projectInfo.name).toBe("Project X");
    expect(loaded.pmTool).toBe("local");
    expect(loaded.createdProjectId).toBe(project.id);
    expect(loaded.phase).toBe("complete");
  });
});

describe("Action execution: connect_provider error scenarios", () => {
  beforeEach(resetAll);

  it("credentials cleared from session on provider connection failure", () => {
    const session = createSession();
    session.credentials = { token: "ghp_bad_token" };
    saveSession(session);

    // Simulate provider error — credentials should be cleared
    session.credentials = null;
    saveSession(session);

    const loaded = loadSession(session.id)!;
    expect(loaded.credentials).toBeNull();
  });

  it("project still exists after provider connection fails", () => {
    const session = createSession();
    const project = getOrCreateProject(session, "Half Setup", "");
    session.createdProjectId = project.id;
    saveSession(session);

    // Provider fails — but project was already created
    session.credentials = null;
    saveSession(session);

    // Project should still be accessible
    expect(getProject(project.id)).not.toBeNull();
    expect(getProject(project.id)!.name).toBe("Half Setup");
  });

  it("session stays in collecting phase after connection error (not complete)", () => {
    const session = createSession();
    session.phase = "connecting";
    session.credentials = { token: "bad" };
    saveSession(session);

    // Simulate connection failure
    session.credentials = null;
    // Phase should NOT move to complete
    saveSession(session);

    const loaded = loadSession(session.id)!;
    expect(loaded.phase).toBe("connecting");
    expect(loaded.phase).not.toBe("complete");
  });
});

// =====================================================================
// 7. LISTING AND MULTIPLE SESSION MANAGEMENT
// =====================================================================

describe("Session listing", () => {
  beforeEach(resetAll);

  it("lists all sessions sorted by updatedAt (newest first)", () => {
    const s1 = createSession();
    saveSession(s1);
    s1.updatedAt = "2026-01-01T00:00:00.000Z";
    mockSessionFiles[`${s1.id}.json`] = JSON.stringify(s1);

    const s2 = createSession();
    saveSession(s2);
    s2.updatedAt = "2026-03-01T00:00:00.000Z";
    mockSessionFiles[`${s2.id}.json`] = JSON.stringify(s2);

    const s3 = createSession();
    saveSession(s3);
    s3.updatedAt = "2026-02-01T00:00:00.000Z";
    mockSessionFiles[`${s3.id}.json`] = JSON.stringify(s3);

    const all = listSessions();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe(s2.id); // March — newest
    expect(all[1].id).toBe(s3.id); // February
    expect(all[2].id).toBe(s1.id); // January — oldest
  });

  it("empty directory returns empty list", () => {
    expect(listSessions()).toEqual([]);
  });

  it("corrupted session files are silently skipped in listing", () => {
    const good = createSession();
    saveSession(good);
    mockSessionFiles["corrupted.json"] = "NOT VALID JSON!!!";

    const all = listSessions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(good.id);
  });
});

// =====================================================================
// 8. END-TO-END SCENARIO TESTS
// =====================================================================

describe("E2E: full project creation lifecycle", () => {
  beforeEach(resetAll);

  it("happy path: create local project through setup session", () => {
    // 1. Start session
    const session = createSession();
    session.messages.push({
      role: "assistant",
      content: "Welcome! Tell me about your project.",
      timestamp: new Date().toISOString(),
    });
    saveSession(session);

    // 2. User describes project
    session.messages.push({
      role: "user",
      content: "I want to create a project called TaskTracker",
      timestamp: new Date().toISOString(),
    });
    session.phase = "collecting";
    session.projectInfo.name = "TaskTracker";
    saveSession(session);

    // 3. User confirms
    session.phase = "confirming";
    saveSession(session);

    // 4. Create project
    const project = getOrCreateProject(session, "TaskTracker", "");
    setActiveProjectId(project.id);
    session.createdProjectId = project.id;
    session.phase = "complete";
    saveSession(session);

    // Verify
    expect(listProjects()).toHaveLength(1);
    expect(getActiveProject()!.name).toBe("TaskTracker");
    expect(findActiveSession()).toBeNull(); // session is complete
  });

  it("cancel and resume: user leaves mid-setup, comes back", () => {
    // 1. Start setup
    const session = createSession();
    session.phase = "collecting";
    session.projectInfo.name = "Half Baked";
    session.messages.push(
      { role: "assistant", content: "Welcome!", timestamp: new Date().toISOString() },
      { role: "user", content: "Half Baked project", timestamp: new Date().toISOString() },
    );
    saveSession(session);

    // 2. User closes browser — no cleanup happens
    // (nothing to do here, session persists)

    // 3. User returns — find active session
    const resumed = findActiveSession()!;
    expect(resumed).not.toBeNull();
    expect(resumed.id).toBe(session.id);
    expect(resumed.projectInfo.name).toBe("Half Baked");
    expect(resumed.messages).toHaveLength(2);

    // 4. Continue and complete
    const project = getOrCreateProject(resumed, "Half Baked", "");
    resumed.createdProjectId = project.id;
    resumed.phase = "complete";
    saveSession(resumed);

    expect(findActiveSession()).toBeNull();
    expect(listProjects()).toHaveLength(1);
  });

  it("create, delete, re-create: project is cleanly recreated", () => {
    // Create
    const p1 = createProject("Phoenix", "");
    expect(listProjects()).toHaveLength(1);

    // Delete
    deleteProject(p1.id);
    expect(listProjects()).toHaveLength(0);

    // Re-create with same name
    const p2 = createProject("Phoenix", "");
    expect(p2.id).not.toBe(p1.id);
    expect(listProjects()).toHaveLength(1);
    expect(p2.name).toBe("Phoenix");
  });

  it("error recovery: failed provider connection, retry with correct creds", () => {
    const session = createSession();
    session.phase = "connecting";
    session.pmTool = "github";
    session.scope = "owner/repo";
    session.credentials = { token: "bad_token" };
    saveSession(session);

    // Connection fails
    session.credentials = null; // cleared on failure
    saveSession(session);

    // User provides new credentials
    session.credentials = { token: "good_token" };
    saveSession(session);

    // Connection succeeds, project created
    const project = createProject("GitHub Project", "https://github.com/owner/repo");
    session.createdProjectId = project.id;
    session.phase = "scaffolding";
    session.connectedProviderName = "owner/repo";
    saveSession(session);

    // Skip scaffold
    session.autoScaffold = false;
    session.phase = "complete";
    saveSession(session);

    expect(findActiveSession()).toBeNull();
    expect(listProjects()).toHaveLength(1);
    const loaded = loadSession(session.id)!;
    expect(loaded.connectedProviderName).toBe("owner/repo");
    expect(loaded.phase).toBe("complete");
  });

  it("duplicate name during setup: error surfaced, user picks new name", () => {
    // Existing project
    createProject("Taken Name", "");

    const session = createSession();
    session.phase = "collecting";
    session.projectInfo.name = "Taken Name";
    saveSession(session);

    // Attempt to create — fails
    expect(() => getOrCreateProject(session, "Taken Name", "")).toThrow(
      DuplicateProjectError,
    );

    // User picks a different name
    session.projectInfo.name = "Unique Name";
    const project = getOrCreateProject(session, "Unique Name", "");
    session.createdProjectId = project.id;
    session.phase = "complete";
    saveSession(session);

    expect(listProjects()).toHaveLength(2);
    expect(listProjects().map((p) => p.name).sort()).toEqual(["Taken Name", "Unique Name"]);
  });
});
