import { getActiveProvider } from "@/lib/project/manager";
import { FACE_BASE_URL } from "@/lib/constants";
import type { FaceTask } from "./types";

/**
 * Post a completion summary comment on the linked GitHub issue.
 *
 * Called when a task reaches a terminal state (completed, failed, cancelled)
 * and has a linkedIssue number set. Failures are logged but never thrown —
 * posting a comment must not crash the agent workflow.
 */
export async function postCompletionComment(task: FaceTask): Promise<void> {
  if (!task.linkedIssue) return;

  try {
    const provider = await getActiveProvider();
    if (!provider) {
      console.warn(
        `[face] Cannot post GitHub comment for task ${task.id}: no active project provider configured`
      );
      return;
    }

    const body = buildCommentBody(task);
    await provider.addComment(String(task.linkedIssue), body);

    console.log(
      `[face] Posted completion comment on issue #${task.linkedIssue} for task ${task.id}`
    );

    // Update issue status when task completed successfully.
    // Tasks with repoInfo are on the PR workflow path — their requirement
    // status is deferred to "done" only after the PR is merged (handled by
    // pr-poller). Setting it here would be premature.
    if (task.status === "completed" && !task.repoInfo) {
      try {
        await provider.updateIssue(String(task.linkedIssue), { status: "done" });
        console.log(`[face] Updated issue #${task.linkedIssue} status to done`);
      } catch (err) {
        console.error(`[face] Failed to update issue #${task.linkedIssue} status:`, err);
      }
    }
  } catch (err) {
    console.error(
      `[face] Failed to post GitHub comment on issue #${task.linkedIssue} for task ${task.id}:`,
      err
    );
  }
}

function statusBadge(status: FaceTask["status"]): string {
  switch (status) {
    case "completed":
      return "**Status: Completed**";
    case "failed":
      return "**Status: Failed**";
    case "cancelled":
      return "**Status: Stuck / Cancelled**";
    default:
      return `**Status: ${status}**`;
  }
}

function buildCommentBody(task: FaceTask): string {
  const lines: string[] = [];

  lines.push("### Agent Task Summary");
  lines.push("");
  lines.push(statusBadge(task.status));
  lines.push("");

  if (task.title) {
    lines.push(`**Task:** ${task.title}`);
  }

  lines.push("");
  lines.push(`[View full task details in FACE](${FACE_BASE_URL}/project?task=${task.id})`);

  if (task.summary) {
    lines.push("");
    lines.push(task.summary);
  }

  if (task.result && task.status === "failed") {
    lines.push("");
    lines.push("**Error:**");
    const truncated =
      task.result.length > 500 ? task.result.slice(0, 500) + "..." : task.result;
    lines.push("```");
    lines.push(truncated);
    lines.push("```");
  }

  lines.push("");
  lines.push(
    `<sub>Posted by FACE at ${new Date(task.updatedAt).toISOString()}</sub>`
  );

  return lines.join("\n");
}
