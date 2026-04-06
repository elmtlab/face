/**
 * Automatically create a GitHub PR after a task completes successfully.
 *
 * Detects the branch the agent created during implementation, pushes it
 * (if needed), and opens a PR back to the base branch. Updates the
 * associated workflow with PR metadata so the poller can track it.
 *
 * For per-project repos using worktrees, this module:
 *   - Detects the target repo from the git remote (not the FACE provider)
 *   - Creates the PR in the project's repo
 *   - Cleans up the worktree after successful PR creation
 */

import { execSync } from "child_process";
import { getActiveProvider } from "./manager";
import { GitHubProvider } from "./providers/github";
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
} from "./workflow";
import {
  getWorktreeClonePath,
  cleanupWorktree,
  parseGitHubUrl,
} from "./repo-manager";
import { listProviderConfigs } from "./manager";
import type { FaceTask } from "../tasks/types";

/**
 * After a task completes, find its workflow and create a PR if applicable.
 *
 * Called fire-and-forget from the task runner — errors are logged, never thrown.
 */
export async function createPRForCompletedTask(task: FaceTask): Promise<void> {
  if (task.status !== "completed") return;

  // Find the workflow that references this task
  const workflow = listWorkflows().find(
    (w) => w.taskId === task.id && w.phase === "implementing",
  );
  if (!workflow) return;

  const cwd = task.workingDirectory;

  // Determine whether this is a worktree (per-project repo) or the FACE repo
  const clonePath = getWorktreeClonePath(cwd);

  // Resolve the GitHub provider for PR operations.
  // For worktrees, detect the repo from the git remote; for FACE repo, use the active provider.
  const gh = await resolveGitHubProvider(cwd);
  if (!gh) return;

  try {
    // Detect the current branch in the working directory
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
    }).trim();

    // Determine the default branch (base for PR)
    const baseBranch = getDefaultBranch(cwd);

    // Don't create a PR if the agent worked directly on the default branch
    if (branch === baseBranch) {
      console.log(
        `[face] Task ${task.id} completed on ${baseBranch} — skipping PR creation`,
      );
      cleanupWorktreeIfNeeded(clonePath, cwd);
      return;
    }

    // Fetch latest base branch before pushing or creating PR
    try {
      execSync(`git fetch origin ${baseBranch}`, { cwd, encoding: "utf-8", stdio: "pipe" });
    } catch {
      // best-effort — remote may not be reachable
    }

    // Rebase onto latest base branch to minimize merge conflicts
    try {
      execSync(`git rebase origin/${baseBranch}`, { cwd, encoding: "utf-8", stdio: "pipe" });
    } catch {
      // Rebase failed — abort and report conflict
      try {
        execSync("git rebase --abort", { cwd, encoding: "utf-8", stdio: "pipe" });
      } catch {
        // already aborted or not in rebase state
      }
      console.error(
        `[face] Rebase of ${branch} onto origin/${baseBranch} failed — conflicts need manual resolution`,
      );
      // Update workflow to surface the conflict to the user
      const fresh = loadWorkflow(workflow.id);
      if (fresh) {
        fresh.pr = {
          number: 0,
          url: "",
          repo: gh.getRepo(),
          branch,
          status: "open",
          conflicted: true,
        };
        fresh.updatedAt = new Date().toISOString();
        saveWorkflow(fresh);
      }
      if (workflow.issueId) {
        try {
          await gh.addComment(
            workflow.issueId,
            `Could not auto-create PR: branch \`${branch}\` has conflicts with \`${baseBranch}\` that need manual resolution.`,
          );
        } catch {
          // best-effort
        }
      }
      // Don't clean up worktree on conflict — user may need to resolve manually
      return;
    }

    // Ensure the branch is pushed to the remote
    try {
      execSync(`git push -u origin ${branch} --force-with-lease`, { cwd, encoding: "utf-8", stdio: "pipe" });
    } catch {
      // May already be pushed or no remote — try anyway
    }

    // Check if a PR already exists for this branch
    const existing = await gh.findPRByBranch(branch);
    if (existing) {
      console.log(
        `[face] PR #${existing.number} already exists for branch ${branch}`,
      );
      updateWorkflowWithPR(workflow.id, {
        number: existing.number,
        url: existing.url,
        repo: gh.getRepo(),
        branch,
      });
      cleanupWorktreeIfNeeded(clonePath, cwd);
      return;
    }

    // Build PR title and body from the story
    const story = workflow.generatedStory;
    const title = story?.title ?? task.title;
    const bodyParts: string[] = [];

    if (workflow.issueId) {
      bodyParts.push(`Closes #${workflow.issueId}`);
      bodyParts.push("");
    }
    if (story?.body) {
      bodyParts.push(story.body);
    }
    bodyParts.push("");
    bodyParts.push(
      `<sub>Automatically created by FACE for workflow \`${workflow.id}\`</sub>`,
    );

    const pr = await gh.createPullRequest({
      title,
      body: bodyParts.join("\n"),
      head: branch,
      base: baseBranch,
    });

    console.log(
      `[face] Created PR #${pr.number} for task ${task.id}: ${pr.url}`,
    );

    updateWorkflowWithPR(workflow.id, {
      number: pr.number,
      url: pr.url,
      repo: gh.getRepo(),
      branch,
    });

    // Comment on the issue about the PR
    if (workflow.issueId) {
      try {
        await gh.addComment(
          workflow.issueId,
          `Implementation PR created: #${pr.number}\nPolling for merge status — will auto-close when merged.`,
        );
      } catch {
        // best-effort
      }
    }

    // Clean up worktree after successful PR creation
    cleanupWorktreeIfNeeded(clonePath, cwd);
  } catch (err) {
    console.error(
      `[face] Failed to create PR for task ${task.id}:`,
      (err as Error).message,
    );
  }
}

/**
 * Resolve a GitHubProvider for the repo that the working directory belongs to.
 *
 * For per-project repos (worktrees), detects owner/repo from the git remote
 * and creates a GitHubProvider connected to that repo using the configured token.
 *
 * For the FACE repo, returns the active provider as before.
 */
async function resolveGitHubProvider(cwd: string): Promise<GitHubProvider | null> {
  // Try to detect the remote repo from the working directory
  const remoteRepo = getRemoteRepo(cwd);

  // Get the active provider to check if it matches or to borrow the token
  const activeProvider = await getActiveProvider();

  if (remoteRepo && activeProvider?.type === "github") {
    const activeGh = activeProvider as GitHubProvider;
    const activeRepo = activeGh.getRepo();

    // If the remote matches the active provider, just use it
    if (remoteRepo === activeRepo) {
      return activeGh;
    }

    // Different repo — create a provider for the project's repo using the same token
    const token = getProviderToken();
    if (token) {
      const gh = new GitHubProvider();
      await gh.connect({
        type: "github",
        name: `project-${remoteRepo}`,
        scope: remoteRepo,
        credentials: { token },
      });
      return gh;
    }
  }

  // Fallback to active provider
  if (activeProvider?.type === "github") {
    return activeProvider as GitHubProvider;
  }

  return null;
}

/**
 * Extract owner/repo from the origin remote of a git working directory.
 */
function getRemoteRepo(cwd: string): string | null {
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();

    const parsed = parseGitHubUrl(remoteUrl);
    if (parsed) {
      return `${parsed.owner}/${parsed.repo}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the GitHub token from the configured provider.
 */
function getProviderToken(): string | null {
  const configs = listProviderConfigs();
  const ghConfig = configs.find((c) => c.type === "github");
  return ghConfig?.credentials?.token ?? null;
}

/**
 * Clean up a worktree if the working directory is in one.
 */
function cleanupWorktreeIfNeeded(clonePath: string | null, worktreePath: string): void {
  if (clonePath) {
    try {
      cleanupWorktree(clonePath, worktreePath);
      console.log(`[face] Cleaned up worktree: ${worktreePath}`);
    } catch (err) {
      console.error(
        `[face] Failed to clean up worktree ${worktreePath}:`,
        (err as Error).message,
      );
    }
  }
}

function updateWorkflowWithPR(
  workflowId: string,
  pr: { number: number; url: string; repo: string; branch: string },
): void {
  const fresh = loadWorkflow(workflowId);
  if (!fresh) return;

  fresh.pr = {
    number: pr.number,
    url: pr.url,
    repo: pr.repo,
    branch: pr.branch,
    status: "open",
  };
  fresh.updatedAt = new Date().toISOString();
  saveWorkflow(fresh);
}

function getDefaultBranch(cwd: string): string {
  try {
    // Try to read the default branch from the remote HEAD
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    // Fallback: check if "main" or "master" exists
    try {
      execSync("git rev-parse --verify main", { cwd, stdio: "pipe" });
      return "main";
    } catch {
      return "master";
    }
  }
}
