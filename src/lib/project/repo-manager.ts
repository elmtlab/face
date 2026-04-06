/**
 * Per-project repository management with git worktrees.
 *
 * Clones project repos to ~/.face/repos/<owner>/<repo>/ and creates
 * isolated worktrees for each story implementation so multiple stories
 * on the same repo can run in parallel.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { getProject } from "../projects/store";

// ── Constants ─────────────────────────────────────────────────────────

const REPOS_DIR = join(homedir(), ".face", "repos");

// ── GitHub URL parsing ────────────────────────────────────────────────

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  cloneUrl: string;
}

/**
 * Validate and parse a GitHub URL into owner/repo components.
 * Accepts HTTPS URLs (https://github.com/owner/repo) and
 * SSH URLs (git@github.com:owner/repo.git).
 *
 * Returns null if the URL is not a valid GitHub repo URL.
 */
export function parseGitHubUrl(url: string): ParsedGitHubRepo | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  // HTTPS: https://github.com/owner/repo or https://github.com/owner/repo.git
  const httpsMatch = trimmed.match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
      cloneUrl: `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}.git`,
    };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = trimmed.match(
    /^git@github\.com:([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?$/,
  );
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
      cloneUrl: `git@github.com:${sshMatch[1]}/${sshMatch[2]}.git`,
    };
  }

  // Shorthand: owner/repo
  const shortMatch = trimmed.match(
    /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/,
  );
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      cloneUrl: `https://github.com/${shortMatch[1]}/${shortMatch[2]}.git`,
    };
  }

  return null;
}

// ── Repo clone management ─────────────────────────────────────────────

/**
 * Return the local clone path for a parsed GitHub repo.
 */
function repoClonePath(parsed: ParsedGitHubRepo): string {
  return join(REPOS_DIR, parsed.owner, parsed.repo);
}

/**
 * Ensure a GitHub repo is cloned locally. If already cloned, fetches
 * the latest from origin and resets the default branch.
 *
 * Returns the path to the local clone.
 */
export function ensureRepoCloned(parsed: ParsedGitHubRepo): string {
  const clonePath = repoClonePath(parsed);

  if (existsSync(join(clonePath, ".git"))) {
    // Already cloned — fetch latest
    try {
      execSync("git fetch origin", {
        cwd: clonePath,
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Reset default branch to match origin
      const defaultBranch = getDefaultBranchFromClone(clonePath);
      execSync(`git checkout ${defaultBranch}`, {
        cwd: clonePath,
        encoding: "utf-8",
        stdio: "pipe",
      });
      execSync(`git reset --hard origin/${defaultBranch}`, {
        cwd: clonePath,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (err) {
      console.error(
        `[face] Failed to update repo ${parsed.owner}/${parsed.repo}:`,
        (err as Error).message,
      );
    }
    return clonePath;
  }

  // Clone the repo
  const parentDir = join(REPOS_DIR, parsed.owner);
  mkdirSync(parentDir, { recursive: true });

  execSync(`git clone ${parsed.cloneUrl} ${clonePath}`, {
    encoding: "utf-8",
    stdio: "pipe",
  });

  return clonePath;
}

/**
 * Detect the default branch of a local clone.
 */
function getDefaultBranchFromClone(clonePath: string): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: clonePath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    try {
      execSync("git rev-parse --verify origin/main", {
        cwd: clonePath,
        encoding: "utf-8",
        stdio: "pipe",
      });
      return "main";
    } catch {
      return "master";
    }
  }
}

// ── Worktree management ───────────────────────────────────────────────

/**
 * Generate a branch name from a story ID and title.
 * Convention: story/<id>-<slug>
 */
function generateBranchName(storyId: string, storyTitle: string): string {
  const slug = storyTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `story/${storyId}-${slug}`;
}

/**
 * Create a git worktree for implementing a story.
 *
 * The worktree is created under <clone>/.worktrees/<branch-name>/
 * and branched off the default branch at origin/HEAD.
 *
 * Returns the absolute path to the worktree directory.
 */
export function createWorktree(
  clonePath: string,
  storyId: string,
  storyTitle: string,
): string {
  const branch = generateBranchName(storyId, storyTitle);
  const worktreeDir = join(clonePath, ".worktrees", branch.replace(/\//g, "-"));

  // If the worktree already exists (e.g. from a previous failed attempt), clean it up
  if (existsSync(worktreeDir)) {
    try {
      execSync(`git worktree remove --force ${worktreeDir}`, {
        cwd: clonePath,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch {
      // Force remove directory if worktree remove fails
      rmSync(worktreeDir, { recursive: true, force: true });
      try {
        execSync("git worktree prune", {
          cwd: clonePath,
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch {
        // best-effort
      }
    }
  }

  // Delete the branch if it exists locally (leftover from previous attempt)
  try {
    execSync(`git branch -D ${branch}`, {
      cwd: clonePath,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch {
    // Branch doesn't exist — fine
  }

  // Determine the base commit (latest on default branch from origin)
  const defaultBranch = getDefaultBranchFromClone(clonePath);
  const baseRef = `origin/${defaultBranch}`;

  // Create the worktree with a new branch
  mkdirSync(join(clonePath, ".worktrees"), { recursive: true });
  execSync(`git worktree add -b ${branch} ${worktreeDir} ${baseRef}`, {
    cwd: clonePath,
    encoding: "utf-8",
    stdio: "pipe",
  });

  return worktreeDir;
}

/**
 * Clean up a worktree after PR creation.
 * Removes the worktree directory and prunes the git worktree list.
 */
export function cleanupWorktree(clonePath: string, worktreePath: string): void {
  try {
    execSync(`git worktree remove --force ${worktreePath}`, {
      cwd: clonePath,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch {
    // If worktree remove fails, try manual cleanup
    try {
      rmSync(worktreePath, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }

  try {
    execSync("git worktree prune", {
      cwd: clonePath,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch {
    // best-effort
  }
}

/**
 * Detect whether a given directory is inside a git worktree.
 * Returns the main worktree (clone) path, or null if not a worktree.
 */
export function getWorktreeClonePath(worktreePath: string): string | null {
  try {
    const commonDir = execSync("git rev-parse --git-common-dir", {
      cwd: worktreePath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    const gitDir = execSync("git rev-parse --git-dir", {
      cwd: worktreePath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    // If common dir and git dir differ, we're in a worktree
    if (commonDir !== gitDir && commonDir !== ".git") {
      // commonDir is the path to the main repo's .git directory
      // The clone path is one level up from .git
      const absCommon = resolve(worktreePath, commonDir);
      return dirname(absCommon);
    }
    return null;
  } catch {
    return null;
  }
}

// ── High-level entry point ────────────────────────────────────────────

export interface WorktreeResult {
  workingDirectory: string;
  /** The main clone path (for worktree cleanup later). Null if no worktree was created. */
  clonePath: string | null;
  /** The parsed repo info. Null if no repo was resolved. */
  repoInfo: ParsedGitHubRepo | null;
}

/**
 * Resolve the working directory for a story implementation.
 *
 * If the project has a valid GitHub repoLink:
 *   1. Ensures the repo is cloned locally
 *   2. Creates a worktree for the story
 *   3. Returns the worktree path
 *
 * If no valid repoLink, falls back to process.cwd() (current behavior).
 */
export function resolveWorkingDirectory(
  projectId: string | null,
  storyId: string,
  storyTitle: string,
): WorktreeResult {
  if (!projectId) {
    return { workingDirectory: process.cwd(), clonePath: null, repoInfo: null };
  }

  const project = getProject(projectId);
  if (!project?.repoLink) {
    return { workingDirectory: process.cwd(), clonePath: null, repoInfo: null };
  }

  const parsed = parseGitHubUrl(project.repoLink);
  if (!parsed) {
    console.error(
      `[face] Invalid GitHub URL for project "${project.name}": ${project.repoLink}`,
    );
    return { workingDirectory: process.cwd(), clonePath: null, repoInfo: null };
  }

  const clonePath = ensureRepoCloned(parsed);
  const worktreePath = createWorktree(clonePath, storyId, storyTitle);

  return { workingDirectory: worktreePath, clonePath, repoInfo: parsed };
}
