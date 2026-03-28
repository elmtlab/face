import { describe, test, expect } from "bun:test";
import { describeToolUse } from "../describe-tool";

describe("describeToolUse", () => {
  // --- Bash ---

  test("Bash with command shows truncated command", () => {
    const result = describeToolUse("Bash", { command: "git status" });
    expect(result).toBe("git status");
  });

  test("Bash with description fallback shows description", () => {
    const result = describeToolUse("Bash", { description: "List files" });
    expect(result).toBe("List files");
  });

  test("Bash with no input shows 'Running command'", () => {
    const result = describeToolUse("Bash", {});
    expect(result).toBe("Running command");
  });

  test("Bash with very long command is truncated to 120 chars", () => {
    const longCommand = "a".repeat(200);
    const result = describeToolUse("Bash", { command: longCommand });
    expect(result).toHaveLength(120);
    expect(result).toBe("a".repeat(120));
  });

  test("Bash prefers command over description", () => {
    const result = describeToolUse("Bash", {
      command: "npm test",
      description: "Run tests",
    });
    expect(result).toBe("npm test");
  });

  // --- Read ---

  test("Read with file_path shows 'Reading filename'", () => {
    const result = describeToolUse("Read", {
      file_path: "/src/lib/tasks/runner.ts",
    });
    expect(result).toBe("Reading runner.ts");
  });

  test("Read with no file_path shows generic description", () => {
    const result = describeToolUse("Read", {});
    expect(result).toBe("Reading file");
  });

  // --- Write ---

  test("Write with file_path shows 'Writing filename'", () => {
    const result = describeToolUse("Write", {
      file_path: "/src/components/App.tsx",
    });
    expect(result).toBe("Writing App.tsx");
  });

  test("Write with no file_path shows generic description", () => {
    const result = describeToolUse("Write", {});
    expect(result).toBe("Writing file");
  });

  // --- Edit ---

  test("Edit with file_path shows 'Editing filename'", () => {
    const result = describeToolUse("Edit", {
      file_path: "/src/lib/utils.ts",
    });
    expect(result).toBe("Editing utils.ts");
  });

  test("Edit with no file_path shows generic description", () => {
    const result = describeToolUse("Edit", {});
    expect(result).toBe("Editing file");
  });

  // --- Grep ---

  test("Grep shows 'Searching content'", () => {
    const result = describeToolUse("Grep", { pattern: "TODO" });
    expect(result).toBe("Searching content: TODO");
  });

  // --- Glob ---

  test("Glob shows 'Searching files'", () => {
    const result = describeToolUse("Glob", { pattern: "**/*.ts" });
    expect(result).toBe("Searching files: **/*.ts");
  });

  // --- Unknown tool ---

  test("Unknown tool returns the tool name", () => {
    const result = describeToolUse("MyCustomTool", {});
    expect(result).toBe("MyCustomTool");
  });
});
