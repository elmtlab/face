import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  getBasePrompt,
  getAllBasePrompts,
} from "../prompts/base-prompts";
import {
  loadPatches,
  savePatch,
  filterCompatiblePatches,
  setPatchesDir,
  resetPatchesDir,
} from "../prompts/patch-store";
import { getMergedPrompt } from "../prompts/prompt-merger";
import {
  detectAnomalies,
  analyzeAndPatch,
} from "../prompts/anomaly-detector";

// ── Test fixture setup ────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `face-prompt-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  setPatchesDir(TEST_DIR);
});

afterEach(() => {
  resetPatchesDir();
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Base prompts ──────────────────────────────────────────────────────

describe("base-prompts", () => {
  it("returns base prompt for each supported provider", () => {
    for (const provider of ["github", "linear", "jira"]) {
      const prompt = getBasePrompt(provider);
      expect(prompt).not.toBeNull();
      expect(prompt!.provider).toBe(provider);
      expect(prompt!.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(prompt!.content.length).toBeGreaterThan(100);
    }
  });

  it("returns null for unknown provider", () => {
    expect(getBasePrompt("azure-devops")).toBeNull();
  });

  it("getAllBasePrompts returns all three", () => {
    const all = getAllBasePrompts();
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.provider).sort()).toEqual(["github", "jira", "linear"]);
  });
});

// ── Patch store ───────────────────────────────────────────────────────

describe("patch-store", () => {
  it("returns empty array when no patches exist", () => {
    expect(loadPatches("github")).toEqual([]);
  });

  it("saves and loads a patch", () => {
    savePatch({
      provider: "github",
      baseVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      anomaly: "Missing field: draft",
      instruction: "Treat missing draft field as false",
    });

    const patches = loadPatches("github");
    expect(patches).toHaveLength(1);
    expect(patches[0].sequence).toBe(1);
    expect(patches[0].anomaly).toBe("Missing field: draft");
  });

  it("auto-increments sequence numbers", () => {
    for (let i = 0; i < 3; i++) {
      savePatch({
        provider: "jira",
        baseVersion: "1.0.0",
        createdAt: new Date().toISOString(),
        anomaly: `Anomaly ${i}`,
        instruction: `Handle ${i}`,
      });
    }

    const patches = loadPatches("jira");
    expect(patches).toHaveLength(3);
    expect(patches.map((p) => p.sequence)).toEqual([1, 2, 3]);
  });

  it("patches are stored as zero-padded files", () => {
    savePatch({
      provider: "linear",
      baseVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      anomaly: "test",
      instruction: "test",
    });

    const dir = join(TEST_DIR, "linear");
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^001-\d+\.json$/);
  });

  it("separates patches by provider", () => {
    savePatch({
      provider: "github",
      baseVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      anomaly: "github anomaly",
      instruction: "handle it",
    });
    savePatch({
      provider: "jira",
      baseVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      anomaly: "jira anomaly",
      instruction: "handle it",
    });

    expect(loadPatches("github")).toHaveLength(1);
    expect(loadPatches("jira")).toHaveLength(1);
    expect(loadPatches("linear")).toHaveLength(0);
  });

  it("filterCompatiblePatches keeps same-major patches", () => {
    const patches = [
      { sequence: 1, provider: "github", baseVersion: "1.0.0", createdAt: "", anomaly: "a", instruction: "b" },
      { sequence: 2, provider: "github", baseVersion: "1.1.0", createdAt: "", anomaly: "c", instruction: "d" },
      { sequence: 3, provider: "github", baseVersion: "2.0.0", createdAt: "", anomaly: "e", instruction: "f" },
    ];
    const compatible = filterCompatiblePatches(patches, "1.2.0");
    expect(compatible).toHaveLength(2);
    expect(compatible.map((p) => p.sequence)).toEqual([1, 2]);
  });

  it("filterCompatiblePatches rejects different-major patches", () => {
    const patches = [
      { sequence: 1, provider: "github", baseVersion: "1.0.0", createdAt: "", anomaly: "a", instruction: "b" },
    ];
    expect(filterCompatiblePatches(patches, "2.0.0")).toEqual([]);
  });
});

// ── Prompt merger ─────────────────────────────────────────────────────

describe("prompt-merger", () => {
  it("returns base prompt when no patches exist", () => {
    const merged = getMergedPrompt("github");
    expect(merged).not.toBeNull();
    expect(merged!.patchCount).toBe(0);
    expect(merged!.content).toBe(getBasePrompt("github")!.content);
  });

  it("returns null for unknown provider", () => {
    expect(getMergedPrompt("azure-devops")).toBeNull();
  });

  it("merges patches into base prompt", () => {
    savePatch({
      provider: "github",
      baseVersion: "1.0.0",
      createdAt: "2026-01-01T00:00:00Z",
      anomaly: "Field X is missing",
      instruction: "Default X to empty string",
    });

    const merged = getMergedPrompt("github");
    expect(merged!.patchCount).toBe(1);
    expect(merged!.content).toContain("## Learned Patches");
    expect(merged!.content).toContain("Field X is missing");
    expect(merged!.content).toContain("Default X to empty string");
    // Base content is still there
    expect(merged!.content).toContain("## GitHub Integration");
  });

  it("merges multiple patches in order", () => {
    savePatch({
      provider: "github",
      baseVersion: "1.0.0",
      createdAt: "2026-01-01T00:00:00Z",
      anomaly: "First anomaly",
      instruction: "First fix",
    });
    savePatch({
      provider: "github",
      baseVersion: "1.0.0",
      createdAt: "2026-01-02T00:00:00Z",
      anomaly: "Second anomaly",
      instruction: "Second fix",
    });

    const merged = getMergedPrompt("github");
    expect(merged!.patchCount).toBe(2);
    // Verify order — first patch appears before second
    const firstIdx = merged!.content.indexOf("First anomaly");
    const secondIdx = merged!.content.indexOf("Second anomaly");
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it("excludes incompatible patches from merge", () => {
    savePatch({
      provider: "github",
      baseVersion: "999.0.0", // different major than base
      createdAt: "2026-01-01T00:00:00Z",
      anomaly: "Should be excluded",
      instruction: "Never seen",
    });

    const merged = getMergedPrompt("github");
    expect(merged!.patchCount).toBe(0);
    expect(merged!.content).not.toContain("Should be excluded");
  });
});

// ── Anomaly detection ─────────────────────────────────────────────────

describe("anomaly-detector", () => {
  describe("detectAnomalies", () => {
    it("returns empty for valid GitHub issue", () => {
      const validIssue = {
        number: 42,
        title: "Fix bug",
        body: "Description",
        state: "open",
        state_reason: null,
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        milestone: null,
      };
      expect(detectAnomalies("github", "issue", validIssue)).toEqual([]);
    });

    it("detects missing required fields", () => {
      const incompleteIssue = {
        number: 42,
        // title is missing
        state: "open",
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      const anomalies = detectAnomalies("github", "issue", incompleteIssue);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some((a) => a.anomaly.includes('"title"'))).toBe(true);
    });

    it("detects type mismatches", () => {
      const wrongType = {
        number: "42", // should be number
        title: "Fix",
        state: "open",
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      const anomalies = detectAnomalies("github", "issue", wrongType);
      expect(anomalies.some((a) => a.anomaly.includes("number") && a.anomaly.includes("string"))).toBe(true);
    });

    it("detects unknown enum values", () => {
      const unknownState = {
        number: 42,
        title: "Fix",
        state: "draft", // not a known state
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      const anomalies = detectAnomalies("github", "issue", unknownState);
      expect(anomalies.some((a) => a.anomaly.includes('"draft"'))).toBe(true);
    });

    it("detects Jira nested field anomalies", () => {
      const jiraIssue = {
        key: "PROJ-1",
        id: "10001",
        fields: {
          summary: "Bug",
          status: { name: "Mysterious State" }, // unknown status
          created: "2026-01-01T00:00:00Z",
          updated: "2026-01-01T00:00:00Z",
        },
      };
      const anomalies = detectAnomalies("jira", "issue", jiraIssue);
      expect(anomalies.some((a) => a.anomaly.includes("mysterious state"))).toBe(true);
    });

    it("returns empty for null/undefined response", () => {
      expect(detectAnomalies("github", "issue", null)).toEqual([]);
      expect(detectAnomalies("github", "issue", undefined)).toEqual([]);
    });

    it("returns empty for unknown provider/endpoint", () => {
      expect(detectAnomalies("trello", "card", { title: "hi" })).toEqual([]);
    });
  });

  describe("analyzeAndPatch", () => {
    it("creates patches for anomalies", () => {
      const badIssue = {
        number: "not-a-number", // type mismatch
        title: "Fix",
        state: "open",
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      const count = analyzeAndPatch("github", "issue", badIssue);
      expect(count).toBeGreaterThan(0);

      const patches = loadPatches("github");
      expect(patches.length).toBeGreaterThan(0);
      expect(patches[0].provider).toBe("github");
      expect(patches[0].baseVersion).toBe("1.0.0");
    });

    it("does not create duplicate patches", () => {
      const badIssue = {
        number: "not-a-number",
        title: "Fix",
        state: "open",
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };

      const first = analyzeAndPatch("github", "issue", badIssue);
      const second = analyzeAndPatch("github", "issue", badIssue);
      expect(first).toBeGreaterThan(0);
      expect(second).toBe(0); // duplicates suppressed
    });

    it("returns 0 for unknown provider", () => {
      expect(analyzeAndPatch("trello", "card", { title: "hi" })).toBe(0);
    });

    it("returns 0 for valid response", () => {
      const validIssue = {
        number: 42,
        title: "Fix",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        user: { login: "test", id: 1, avatar_url: "" },
        html_url: "https://github.com/test/test/issues/42",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
      expect(analyzeAndPatch("github", "issue", validIssue)).toBe(0);
    });
  });
});

// ── Integration: full flow ────────────────────────────────────────────

describe("end-to-end self-healing flow", () => {
  it("first run with no patches returns base prompt unchanged", () => {
    const merged = getMergedPrompt("github");
    expect(merged).not.toBeNull();
    expect(merged!.patchCount).toBe(0);
    expect(merged!.content).not.toContain("Learned Patches");
  });

  it("anomaly detection generates patch that appears in next merged prompt", () => {
    // Simulate an API response with an unknown state
    const response = {
      number: 1,
      title: "Test",
      state: "pending_review", // not in known enum
      labels: [],
      assignees: [],
      user: { login: "bot", id: 99, avatar_url: "" },
      html_url: "https://github.com/org/repo/issues/1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    // Before: no patches
    expect(getMergedPrompt("github")!.patchCount).toBe(0);

    // Trigger analysis
    analyzeAndPatch("github", "issue", response);

    // After: patch appears in merged prompt
    const merged = getMergedPrompt("github");
    expect(merged!.patchCount).toBeGreaterThan(0);
    expect(merged!.content).toContain("Learned Patches");
    expect(merged!.content).toContain("pending_review");
  });

  it("patches survive across separate load calls", () => {
    savePatch({
      provider: "jira",
      baseVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      anomaly: "Persistent anomaly",
      instruction: "Handle it",
    });

    // Simulate a fresh read (same dir, new call)
    const patches = loadPatches("jira");
    expect(patches).toHaveLength(1);
    expect(patches[0].anomaly).toBe("Persistent anomaly");

    // Verify file on disk
    const dir = join(TEST_DIR, "jira");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);
    const content = JSON.parse(readFileSync(join(dir, files[0]), "utf-8"));
    expect(content.anomaly).toBe("Persistent anomaly");
  });
});
