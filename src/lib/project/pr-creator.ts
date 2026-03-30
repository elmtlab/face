/**
 * Automatically create a GitHub PR after a task completes successfully.
 *
 * Detects the branch the agent created during implementation, pushes it
 * (if needed), and opens a PR back to the base branch. Updates the
 * associated workflow with PR metadata so the poller can track it.
 */

import { execSync } from "child_process";
import { getActiveProvider } from "./manager";
import { GitHubProvider } from "./providers/github";
import {
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
} from "./workflow";
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

  const provider = await getActiveProvider();
  if (!provider || provider.type !== "github") return;

  const gh = provider as GitHubProvider;
  const cwd = task.workingDirectory;

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
  } catch (err) {
    console.error(
      `[face] Failed to create PR for task ${task.id}:`,
      (err as Error).message,
    );
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
