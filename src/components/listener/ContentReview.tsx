"use client";

import { useState, useEffect, useCallback } from "react";

interface GeneratedContent {
  id: string;
  topicId: string;
  platform: string;
  body: string;
  editedBody?: string;
  status: string;
  rejectionReason?: string;
  platformPostUrl?: string;
  createdAt: string;
  publishedAt?: string;
}

type FilterStatus = "all" | "pending_review" | "approved" | "rejected" | "published";

export function ContentReview() {
  const [content, setContent] = useState<GeneratedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fetchContent = useCallback(async () => {
    try {
      const url = filter === "all"
        ? "/api/listener/content"
        : `/api/listener/content?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setContent(data.content ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch("/api/listener/content", { method: "POST" });
      await fetchContent();
    } finally {
      setGenerating(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject", editedBody?: string) {
    await fetch(`/api/listener/content/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, editedBody }),
    });
    await fetchContent();
  }

  async function handleSaveEdit(id: string) {
    await fetch(`/api/listener/content/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", editedBody: editText }),
    });
    setEditingId(null);
    setEditText("");
    await fetchContent();
  }

  function startEdit(item: GeneratedContent) {
    setEditingId(item.id);
    setEditText(item.editedBody ?? item.body);
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: "text-zinc-400 bg-zinc-800",
    pending_review: "text-amber-400 bg-amber-900/30",
    approved: "text-green-400 bg-green-900/30",
    rejected: "text-red-400 bg-red-900/30",
    published: "text-blue-400 bg-blue-900/30",
    failed: "text-red-400 bg-red-900/30",
  };

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading content...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["all", "pending_review", "approved", "published", "rejected"] as FilterStatus[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                  filter === s
                    ? "bg-zinc-700 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ),
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Content"}
        </button>
      </div>

      {content.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-6 text-center">
          <p className="text-sm text-zinc-400">No content yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Scan for topics first, then generate content
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {content.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-zinc-800 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    STATUS_COLORS[item.status] ?? "text-zinc-400 bg-zinc-800"
                  }`}
                >
                  {item.status.replace("_", " ")}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>

              {editingId === item.id ? (
                <div className="mt-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    maxLength={280}
                    rows={3}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">
                      {editText.length}/280
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-300 whitespace-pre-wrap">
                  {item.editedBody ?? item.body}
                </p>
              )}

              {item.platformPostUrl && (
                <a
                  href={item.platformPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-[10px] text-blue-400 hover:text-blue-300"
                >
                  View published post
                </a>
              )}

              {item.rejectionReason && (
                <p className="mt-1 text-[10px] text-red-400/70">
                  Rejected: {item.rejectionReason}
                </p>
              )}

              {item.status === "pending_review" && editingId !== item.id && (
                <div className="mt-3 flex gap-2 border-t border-zinc-800 pt-2">
                  <button
                    onClick={() => handleAction(item.id, "approve")}
                    className="rounded bg-green-700 px-3 py-1 text-[10px] font-medium text-white hover:bg-green-600"
                  >
                    Approve & Publish
                  </button>
                  <button
                    onClick={() => startEdit(item)}
                    className="rounded bg-zinc-700 px-3 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleAction(item.id, "reject")}
                    className="rounded bg-red-800/50 px-3 py-1 text-[10px] font-medium text-red-300 hover:bg-red-700/50"
                  >
                    Reject
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
