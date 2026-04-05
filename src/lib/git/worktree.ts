/**
 * Git worktree management for concurrent task isolation.
 *
 * Each development task gets its own worktree so multiple tasks can run
 * simultaneously without git state conflicts (branch races, dirty trees,
 * rebase collisions).
 *
 * Worktrees share .git objects with the main repo — lightweight compared
 * to full clones.
 */

import { execSync } from "child_process";
import { existsSync, rmSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/** Worktrees live under ~/.face/worktrees/ to keep repos clean */
const WORKTREES_DIR = join(homedir(), ".face", "worktrees");

function ensureWorktreesDir(): void {
  if (!existsSync(WORKTREES_DIR)) {
    mkdirSync(WORKTREES_DIR, { recursive: true });
  }
}

/**
 * Build the worktree path for a given task.
 */
export function getWorktreePath(taskId: string): string {
  return join(WORKTREES_DIR, taskId);
}

/**
 * Create a new git worktree for a task.
 *
 * Creates a detached worktree starting from the current HEAD of the default
 * branch. The spawned agent is expected to create its own feature branch.
 *
 * @returns The absolute path to the new worktree directory.
 */
export function createWorktree(repoRoot: string, taskId: string): string {
  ensureWorktreesDir();
  const wtPath = getWorktreePath(taskId);

  // Clean up leftovers from a previous crash
  if (existsSync(wtPath)) {
    removeWorktree(repoRoot, taskId);
  }

  // Fetch latest so the worktree starts from an up-to-date base
  const baseBranch = getBaseBranch(repoRoot);
  try {
    execSync(`git fetch origin ${baseBranch}`, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch {
    // Remote may not be reachable — continue with local state
  }

  // Create a detached worktree from origin/<baseBranch>
  // Using --detach so the agent can freely create any branch name
  try {
    execSync(
      `git worktree add --detach "${wtPath}" origin/${baseBranch}`,
      { cwd: repoRoot, encoding: "utf-8", stdio: "pipe", timeout: 30_000 },
    );
  } catch {
    // Fallback: try local base branch if origin ref doesn't exist
    execSync(
      `git worktree add --detach "${wtPath}" ${baseBranch}`,
      { cwd: repoRoot, encoding: "utf-8", stdio: "pipe", timeout: 30_000 },
    );
  }

  console.log(`[face] Created worktree for ${taskId} at ${wtPath}`);
  return wtPath;
}

/**
 * Remove a worktree and prune its git metadata.
 *
 * Safe to call even if the worktree was already removed or never created.
 */
export function removeWorktree(repoRoot: string, taskId: string): void {
  const wtPath = getWorktreePath(taskId);

  try {
    // git worktree remove --force handles dirty worktrees
    execSync(`git worktree remove --force "${wtPath}"`, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 15_000,
    });
  } catch {
    // If git worktree remove fails (e.g. path already gone), clean up manually
    if (existsSync(wtPath)) {
      rmSync(wtPath, { recursive: true, force: true });
    }
  }

  // Prune stale worktree metadata
  try {
    execSync("git worktree prune", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 10_000,
    });
  } catch {
    // best-effort
  }
}

/**
 * Clean up any worktrees left behind by crashed or interrupted tasks.
 *
 * Scans ~/.face/worktrees/ and removes entries that don't correspond
 * to any currently running task.
 *
 * @param runningTaskIds - IDs of tasks that are currently in-flight
 */
export function cleanupOrphanedWorktrees(
  repoRoot: string,
  runningTaskIds: Set<string>,
): void {
  if (!existsSync(WORKTREES_DIR)) return;

  let entries: string[];
  try {
    entries = readdirSync(WORKTREES_DIR);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Each worktree directory is named after a task ID
    if (runningTaskIds.has(entry)) continue;

    console.log(`[face] Cleaning up orphaned worktree: ${entry}`);
    removeWorktree(repoRoot, entry);
  }
}

/**
 * Determine the base branch (main or master) for the repository.
 */
function getBaseBranch(cwd: string): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    try {
      execSync("git rev-parse --verify main", { cwd, stdio: "pipe" });
      return "main";
    } catch {
      return "master";
    }
  }
}
