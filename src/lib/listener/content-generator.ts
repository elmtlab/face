/**
 * AI-powered content generation for the Listener pipeline.
 *
 * Uses the local Claude Code agent (same approach as ai-summarize.ts)
 * to draft social media posts based on discovered topics and brand voice.
 */

import { execFile } from "child_process";
import { readConfig } from "../tasks/file-manager";
import type { ScannedTopic, GeneratedContent } from "./types";

const BRAND_VOICE_PROMPT = `You are a social media content writer for a technology company focused on AI, project management, product management, software engineering, and semiconductor technology.

Brand voice guidelines:
- Professional but approachable — knowledgeable without being condescending
- Forward-thinking and optimistic about technology's potential
- Data-informed, referencing real trends when possible
- Concise and engaging — every word earns its place
- Use clear language, avoid jargon unless the audience expects it
- Include relevant hashtags (2-3 max) naturally at the end

Platform-specific rules:
- X/Twitter: max 280 characters. Be punchy and direct. Ask questions or share insights that invite engagement.`;

export function generateContentForTopic(
  topic: ScannedTopic,
): Promise<GeneratedContent> {
  return new Promise((resolve) => {
    const config = readConfig();
    const claudePath = config?.agents?.["claude-code"]?.path;

    const contentId = `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!claudePath) {
      resolve(fallbackContent(topic, contentId));
      return;
    }

    const instruction = [
      BRAND_VOICE_PROMPT,
      "",
      "Write a single tweet (max 280 characters) about this trending topic:",
      "",
      `Topic: ${topic.title}`,
      `Context: ${topic.description}`,
      `Related keywords: ${topic.matchedKeywords.join(", ")}`,
      "",
      "Rules:",
      "- Output ONLY the tweet text, nothing else",
      "- Must be under 280 characters",
      "- Do not use markdown formatting",
      "- Include 2-3 relevant hashtags",
    ].join("\n");

    const child = execFile(
      claudePath,
      ["-p", instruction, "--output-format", "text"],
      {
        timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
          SHELL: process.env.SHELL,
          LANG: process.env.LANG,
          TERM: process.env.TERM,
          NODE_ENV: process.env.NODE_ENV,
          FACE_INTERNAL: "1",
        } as NodeJS.ProcessEnv,
      },
      (err, stdout) => {
        if (err || !stdout?.trim()) {
          console.warn(
            `[listener] AI content generation failed, using fallback`,
          );
          resolve(fallbackContent(topic, contentId));
          return;
        }

        let body = stdout.trim();
        // Clean up quotes if wrapped
        body = body.replace(/^["']|["']$/g, "").trim();
        // Truncate if over 280
        if (body.length > 280) body = body.slice(0, 277) + "...";

        resolve({
          id: contentId,
          topicId: topic.id,
          platform: topic.platform,
          body,
          status: "pending_review",
          createdAt: new Date().toISOString(),
        });
      },
    );

    child.on("error", () => {
      resolve(fallbackContent(topic, contentId));
    });
  });
}

export function generateReplyForComment(
  commentBody: string,
  originalPostBody: string,
): Promise<string> {
  return new Promise((resolve) => {
    const config = readConfig();
    const claudePath = config?.agents?.["claude-code"]?.path;

    if (!claudePath) {
      resolve(fallbackReply());
      return;
    }

    const instruction = [
      BRAND_VOICE_PROMPT,
      "",
      "Write a thoughtful reply to this comment on our post.",
      "",
      `Our original post: ${originalPostBody}`,
      `Comment we're replying to: ${commentBody}`,
      "",
      "Rules:",
      "- Output ONLY the reply text, nothing else",
      "- Must be under 280 characters",
      "- Be genuine and conversational",
      "- Add value — don't just say 'thanks'",
      "- No hashtags in replies",
    ].join("\n");

    const child = execFile(
      claudePath,
      ["-p", instruction, "--output-format", "text"],
      {
        timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
          SHELL: process.env.SHELL,
          LANG: process.env.LANG,
          TERM: process.env.TERM,
          NODE_ENV: process.env.NODE_ENV,
          FACE_INTERNAL: "1",
        } as NodeJS.ProcessEnv,
      },
      (err, stdout) => {
        if (err || !stdout?.trim()) {
          resolve(fallbackReply());
          return;
        }
        let reply = stdout.trim().replace(/^["']|["']$/g, "").trim();
        if (reply.length > 280) reply = reply.slice(0, 277) + "...";
        resolve(reply);
      },
    );

    child.on("error", () => resolve(fallbackReply()));
  });
}

function fallbackContent(
  topic: ScannedTopic,
  id: string,
): GeneratedContent {
  const hashtags = topic.matchedKeywords
    .slice(0, 2)
    .map((k) => `#${k.replace(/\s+/g, "")}`)
    .join(" ");

  let body = `${topic.title} is trending in tech. ${hashtags}`;
  if (body.length > 280) body = body.slice(0, 277) + "...";

  return {
    id,
    topicId: topic.id,
    platform: topic.platform,
    body,
    status: "pending_review",
    createdAt: new Date().toISOString(),
  };
}

function fallbackReply(): string {
  return "Great perspective — thanks for sharing your thoughts on this!";
}
