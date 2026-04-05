"use client";

import { useState, useEffect, useCallback } from "react";

interface SurfacedComment {
  id: string;
  contentId: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  authorProfileUrl?: string;
  body: string;
  qualityScore: number;
  scoreBreakdown: {
    relevance: number;
    sentiment: number;
    engagement: number;
  };
  metrics: { likes: number; replies: number };
  replied: boolean;
  replyBody?: string;
  surfacedAt: string;
}

export function CommentReview() {
  const [comments, setComments] = useState<SurfacedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [generatingReply, setGeneratingReply] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const url = showAll
        ? "/api/listener/comments"
        : "/api/listener/comments?quality=high";
      const res = await fetch(url);
      const data = await res.json();
      setComments(data.comments ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  async function handleGenerateReply(commentId: string) {
    setGeneratingReply(true);
    try {
      const res = await fetch(`/api/listener/comments/${commentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateAI: true }),
      });
      const data = await res.json();
      if (data.draft) {
        setReplyText(data.draft);
        setReplyingTo(commentId);
      }
    } finally {
      setGeneratingReply(false);
    }
  }

  async function handleSendReply(commentId: string) {
    if (!replyText.trim()) return;
    try {
      await fetch(`/api/listener/comments/${commentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText }),
      });
      setReplyingTo(null);
      setReplyText("");
      await fetchComments();
    } catch {
      // silent
    }
  }

  function scoreColor(score: number): string {
    if (score >= 0.7) return "text-green-400";
    if (score >= 0.4) return "text-amber-400";
    return "text-red-400";
  }

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading comments...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-400">
            {comments.length} comment{comments.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-blue-400 hover:text-blue-300"
          >
            {showAll ? "High quality only" : "Show all"}
          </button>
        </div>
      </div>

      {comments.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-6 text-center">
          <p className="text-sm text-zinc-400">No comments yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Publish posts and analyze engagement to see comments
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg border border-zinc-800 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {comment.authorProfileUrl ? (
                      <a
                        href={comment.authorProfileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-zinc-200 hover:text-blue-400"
                      >
                        {comment.authorName}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-zinc-200">
                        {comment.authorName}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      {comment.authorHandle}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">
                    {comment.body}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-sm font-medium ${scoreColor(comment.qualityScore)}`}>
                    {Math.round(comment.qualityScore * 100)}
                  </span>
                  <span className="text-[10px] text-zinc-600">quality</span>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500">
                <span>
                  Relevance: {Math.round(comment.scoreBreakdown.relevance * 100)}%
                </span>
                <span>
                  Sentiment: {Math.round(comment.scoreBreakdown.sentiment * 100)}%
                </span>
                <span>
                  Engagement: {Math.round(comment.scoreBreakdown.engagement * 100)}%
                </span>
                <span className="text-zinc-600">|</span>
                <span>{comment.metrics.likes} likes</span>
                <span>{comment.metrics.replies} replies</span>
              </div>

              {/* Reply section */}
              {comment.replied ? (
                <div className="mt-2 rounded bg-zinc-800/50 p-2">
                  <span className="text-[10px] text-zinc-500">Your reply:</span>
                  <p className="text-xs text-zinc-300">{comment.replyBody}</p>
                </div>
              ) : replyingTo === comment.id ? (
                <div className="mt-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    maxLength={280}
                    rows={2}
                    placeholder="Type your reply..."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      {replyText.length}/280
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyText("");
                        }}
                        className="rounded px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSendReply(comment.id)}
                        disabled={!replyText.trim()}
                        className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        Send Reply
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2 border-t border-zinc-800 pt-2">
                  <button
                    onClick={() => {
                      setReplyingTo(comment.id);
                      setReplyText("");
                    }}
                    className="rounded bg-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-600"
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => handleGenerateReply(comment.id)}
                    disabled={generatingReply}
                    className="rounded bg-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
                  >
                    {generatingReply ? "Generating..." : "AI Reply"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
