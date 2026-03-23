"use client";

import { useEffect, useState } from "react";

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RelativeTime({ date }: { date: Date | string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  const [text, setText] = useState(formatRelative(d));

  useEffect(() => {
    const interval = setInterval(() => setText(formatRelative(d)), 30_000);
    return () => clearInterval(interval);
  }, [d]);

  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()}>
      {text}
    </time>
  );
}
