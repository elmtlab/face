import type { FaceTask, FaceTaskStep, FaceTaskActivity } from "./types";

// --- Tool classification ---

type ActionKind = "read" | "modify" | "create" | "execute" | "search" | "other";

function classifyTool(tool: string): ActionKind {
  const t = tool.toLowerCase();
  if (["edit"].some((k) => t.includes(k))) return "modify";
  if (["write"].some((k) => t.includes(k))) return "create";
  if (["read", "glob"].some((k) => t.includes(k))) return "read";
  if (["bash", "command"].some((k) => t.includes(k))) return "execute";
  if (["grep", "search", "agent", "explore"].some((k) => t.includes(k)))
    return "search";
  return "other";
}

function extractFile(step: FaceTaskStep): string | null {
  const match = step.description.match(
    /(?:^|\s)((?:\/|\.\/|src\/|~\/)[^\s,'"]+)/
  );
  return match?.[1] ?? null;
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 2) return p;
  return parts.slice(-2).join("/");
}

// --- Activities: group by WHAT CHANGED, not what tool ran ---

export function buildActivities(steps: FaceTaskStep[]): FaceTaskActivity[] {
  if (steps.length === 0) return [];

  // Collect file-level changes
  const fileActions = new Map<
    string,
    { kinds: Set<ActionKind>; steps: FaceTaskStep[] }
  >();
  const commands: FaceTaskStep[] = [];
  const searches: FaceTaskStep[] = [];

  for (const step of steps) {
    const kind = classifyTool(step.tool);
    const file = extractFile(step);

    if (kind === "execute") {
      commands.push(step);
    } else if (kind === "search" && !file) {
      searches.push(step);
    } else if (file) {
      if (!fileActions.has(file)) {
        fileActions.set(file, { kinds: new Set(), steps: [] });
      }
      const entry = fileActions.get(file)!;
      entry.kinds.add(kind);
      entry.steps.push(step);
    }
  }

  const activities: FaceTaskActivity[] = [];

  // Group modified/created files into a single "Changes" activity
  const modifiedFiles: string[] = [];
  const createdFiles: string[] = [];
  const readOnlyFiles: string[] = [];

  for (const [file, info] of fileActions) {
    if (info.kinds.has("create")) createdFiles.push(file);
    else if (info.kinds.has("modify")) modifiedFiles.push(file);
    else readOnlyFiles.push(file);
  }

  // "Investigated" activity (read-only files)
  if (readOnlyFiles.length > 0) {
    activities.push({
      id: `activity-${activities.length + 1}`,
      label: describeReadActivity(readOnlyFiles),
      category: "read",
      filesInvolved: readOnlyFiles,
      stepCount: readOnlyFiles.reduce(
        (n, f) => n + (fileActions.get(f)?.steps.length ?? 0),
        0
      ),
      startedAt: fileActions.get(readOnlyFiles[0])!.steps[0].timestamp,
    });
  }

  // "Modified" activity
  if (modifiedFiles.length > 0) {
    const allSteps = modifiedFiles.flatMap(
      (f) => fileActions.get(f)?.steps ?? []
    );
    activities.push({
      id: `activity-${activities.length + 1}`,
      label: describeModifyActivity(modifiedFiles),
      category: "write",
      filesInvolved: modifiedFiles,
      stepCount: allSteps.length,
      startedAt: allSteps[0]?.timestamp ?? new Date().toISOString(),
    });
  }

  // "Created" activity
  if (createdFiles.length > 0) {
    const allSteps = createdFiles.flatMap(
      (f) => fileActions.get(f)?.steps ?? []
    );
    activities.push({
      id: `activity-${activities.length + 1}`,
      label: describeCreateActivity(createdFiles),
      category: "write",
      filesInvolved: createdFiles,
      stepCount: allSteps.length,
      startedAt: allSteps[0]?.timestamp ?? new Date().toISOString(),
    });
  }

  // "Ran commands" activity
  if (commands.length > 0) {
    const cmdLabels = commands
      .map((c) => describeCommand(c.description))
      .filter(Boolean);
    const uniqueLabels = [...new Set(cmdLabels)];

    activities.push({
      id: `activity-${activities.length + 1}`,
      label:
        uniqueLabels.length > 0
          ? uniqueLabels.join(", then ")
          : `Ran ${commands.length} command${commands.length > 1 ? "s" : ""}`,
      category: "execute",
      filesInvolved: [],
      stepCount: commands.length,
      startedAt: commands[0].timestamp,
    });
  }

  // "Searched codebase" activity
  if (searches.length > 0) {
    activities.push({
      id: `activity-${activities.length + 1}`,
      label: `Searched codebase (${searches.length} queries)`,
      category: "search",
      filesInvolved: [],
      stepCount: searches.length,
      startedAt: searches[0].timestamp,
    });
  }

  return activities;
}

// --- Descriptive labels ---

function describeReadActivity(files: string[]): string {
  if (files.length === 1) return `Reviewed ${shortenPath(files[0])}`;
  const area = findCommonArea(files);
  return area
    ? `Reviewed ${files.length} files in ${area}`
    : `Reviewed ${files.length} files`;
}

function describeModifyActivity(files: string[]): string {
  if (files.length === 1) return `Updated ${shortenPath(files[0])}`;
  const area = findCommonArea(files);
  return area
    ? `Updated ${files.length} files in ${area}`
    : `Updated ${files.length} files`;
}

function describeCreateActivity(files: string[]): string {
  if (files.length === 1) return `Created ${shortenPath(files[0])}`;
  return `Created ${files.length} new files`;
}

function describeCommand(cmd: string): string {
  const c = cmd.trim().slice(0, 100);
  if (/test|jest|vitest|mocha/.test(c)) return "Ran tests";
  if (/build|compile|tsc/.test(c)) return "Built project";
  if (/npm install|yarn add|pnpm/.test(c)) return "Installed dependencies";
  if (/lint|eslint|prettier/.test(c)) return "Linted code";
  if (/git commit|git push/.test(c)) return "Committed changes";
  if (/git/.test(c)) return "Git operation";
  if (/curl|fetch|wget/.test(c)) return "Made HTTP request";
  return "";
}

function findCommonArea(files: string[]): string | null {
  const dirs = files
    .map((f) => {
      const parts = f.split("/");
      return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    })
    .filter(Boolean) as string[];

  if (dirs.length === 0) return null;

  // Find shortest common prefix
  const first = dirs[0];
  let common = first;
  for (const dir of dirs.slice(1)) {
    while (!dir.startsWith(common) && common.includes("/")) {
      common = common.slice(0, common.lastIndexOf("/"));
    }
  }

  if (!common) return null;
  const parts = common.split("/");
  return parts.slice(-2).join("/") || parts[parts.length - 1];
}

// --- Title derivation ---

export function deriveTitle(steps: FaceTaskStep[]): string {
  if (steps.length === 0) return "Agent session";

  const files = new Set<string>();
  const modifiedFiles = new Set<string>();
  const commands: string[] = [];

  for (const step of steps.slice(0, 15)) {
    const file = extractFile(step);
    if (file) {
      files.add(file);
      const kind = classifyTool(step.tool);
      if (kind === "modify" || kind === "create") modifiedFiles.add(file);
    }
    if (classifyTool(step.tool) === "execute") {
      commands.push(step.description);
    }
  }

  // Describe based on what was changed
  if (modifiedFiles.size > 0) {
    const area = findCommonArea(Array.from(modifiedFiles));
    if (area) return `Changes to ${area}`;
    const first = shortenPath(Array.from(modifiedFiles)[0]);
    if (modifiedFiles.size === 1) return `Update ${first}`;
    return `Update ${first} and ${modifiedFiles.size - 1} more`;
  }

  // Command-based
  for (const cmd of commands) {
    if (/test/.test(cmd)) return "Running tests";
    if (/build/.test(cmd)) return "Building project";
  }

  if (files.size > 0) {
    const area = findCommonArea(Array.from(files));
    if (area) return `Working on ${area}`;
  }

  return "Agent session";
}

// --- Summary: what the user gets ---

export function buildSummary(task: FaceTask): string {
  if (task.result) {
    return task.result.slice(0, 300);
  }

  const activities = task.activities ?? [];
  if (activities.length === 0 && task.steps.length === 0) {
    return "Starting...";
  }

  // Build outcome-focused summary
  const parts: string[] = [];

  const writes = activities.filter((a) => a.category === "write");
  const executes = activities.filter((a) => a.category === "execute");

  if (writes.length > 0) {
    parts.push(writes.map((w) => w.label).join("; "));
  }
  if (executes.length > 0) {
    parts.push(executes.map((e) => e.label).join("; "));
  }

  if (parts.length > 0) return parts.join(". ");

  // Fallback: describe what's happening now
  if (activities.length > 0) {
    return activities[activities.length - 1].label;
  }

  return `${task.steps.length} operations completed`;
}
