/**
 * Comment quality scoring pipeline.
 *
 * Scores comments using a blend of:
 * - Relevance: keyword overlap with the original post
 * - Sentiment: simple positive/negative word matching
 * - Engagement: normalized like/reply counts
 *
 * Scores range 0–1. Higher is better quality.
 */

import type { SurfacedComment } from "./types";

const POSITIVE_WORDS = new Set([
  "great", "awesome", "excellent", "love", "amazing", "fantastic",
  "insightful", "agree", "brilliant", "helpful", "interesting",
  "impressive", "useful", "valuable", "thanks", "thank",
  "innovative", "clever", "smart", "well", "best", "good",
]);

const NEGATIVE_WORDS = new Set([
  "terrible", "awful", "hate", "worst", "useless", "spam",
  "scam", "fake", "garbage", "stupid", "dumb", "boring",
  "wrong", "bad", "disappointing", "waste",
]);

export function scoreComment(
  comment: {
    body: string;
    metrics: { likes: number; replies: number };
  },
  originalPostBody: string,
): { relevance: number; sentiment: number; engagement: number; total: number } {
  const relevance = computeRelevance(comment.body, originalPostBody);
  const sentiment = computeSentiment(comment.body);
  const engagement = computeEngagement(comment.metrics);

  // Weighted blend
  const total = relevance * 0.4 + sentiment * 0.3 + engagement * 0.3;

  return { relevance, sentiment, engagement, total };
}

function computeRelevance(commentBody: string, postBody: string): number {
  const postWords = new Set(
    postBody
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

  if (postWords.size === 0) return 0.5;

  const commentWords = commentBody
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (commentWords.length === 0) return 0;

  const overlap = commentWords.filter((w) => postWords.has(w)).length;
  return Math.min(overlap / Math.max(postWords.size * 0.3, 1), 1);
}

function computeSentiment(body: string): number {
  const words = body
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/);

  let positive = 0;
  let negative = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) positive++;
    if (NEGATIVE_WORDS.has(word)) negative++;
  }

  const total = positive + negative;
  if (total === 0) return 0.5; // neutral

  // Score: 0 = all negative, 0.5 = neutral, 1 = all positive
  return positive / total;
}

function computeEngagement(metrics: {
  likes: number;
  replies: number;
}): number {
  // Normalize with diminishing returns (log scale)
  const likeScore = Math.min(Math.log2(metrics.likes + 1) / 10, 1);
  const replyScore = Math.min(Math.log2(metrics.replies + 1) / 8, 1);
  return likeScore * 0.6 + replyScore * 0.4;
}

export function filterHighQualityComments(
  comments: SurfacedComment[],
  minScore: number = 0.5,
): SurfacedComment[] {
  return comments
    .filter((c) => c.qualityScore >= minScore)
    .sort((a, b) => b.qualityScore - a.qualityScore);
}
