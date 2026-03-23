import { execFile } from "child_process";
import { readConfig } from "./file-manager";

/**
 * Use the local AI agent to summarize a user prompt into a concise task title.
 * Returns a short, actionable goal (5-15 words).
 * Falls back to simple truncation if the agent isn't available.
 */
export function summarizePrompt(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const config = readConfig();
    const claudePath = config?.agents?.["claude-code"]?.path;

    if (!claudePath) {
      resolve(fallbackTitle(prompt));
      return;
    }

    const instruction = [
      "Summarize the following user request into a short, actionable task title (5-15 words).",
      "Rules:",
      "- Start with a verb (e.g. Remove, Add, Fix, Update, Refactor, Implement)",
      "- Describe the goal, not the process",
      "- No quotes, no punctuation at the end",
      "- Output ONLY the title, nothing else",
      "",
      "User request:",
      prompt,
    ].join("\n");

    const child = execFile(
      claudePath,
      ["-p", instruction, "--output-format", "text"],
      {
        timeout: 15_000,
        env: { ...process.env, FACE_INTERNAL: "1" },
      },
      (err, stdout) => {
        if (err || !stdout?.trim()) {
          resolve(fallbackTitle(prompt));
          return;
        }

        let title = stdout.trim();
        // Clean up: remove quotes, trailing punctuation
        title = title.replace(/^["']|["']$/g, "").replace(/[.!?]+$/, "").trim();

        // Sanity check: if the "summary" is longer than the prompt, use fallback
        if (title.length > 100 || title.length === 0) {
          resolve(fallbackTitle(prompt));
          return;
        }

        resolve(title);
      }
    );

    // Don't let a hung process block forever
    child.on("error", () => resolve(fallbackTitle(prompt)));
  });
}

function fallbackTitle(prompt: string): string {
  let text = prompt.split("\n")[0].trim();
  text = text
    .replace(/^(hey|hi|hello|please|can you|could you|I want to|I'd like to|let's|we should|we need to)\s*/i, "")
    .replace(/^(go ahead and|try to|make sure to)\s*/i, "")
    .trim();
  text = text.replace(/^(we |I )?(don'?t|do not) (need|want|like|use)\s+/i, "Remove ");
  if (text.length > 0) text = text[0].toUpperCase() + text.slice(1);
  text = text.replace(/[.!?]+$/, "").trim();
  if (text.length > 80) text = text.slice(0, 77) + "...";
  return text || "Agent task";
}
