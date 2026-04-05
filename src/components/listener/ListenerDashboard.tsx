"use client";

import { useState } from "react";
import { TopicScanner } from "./TopicScanner";
import { ContentReview } from "./ContentReview";
import { EngagementView } from "./EngagementView";
import { CommentReview } from "./CommentReview";
import { ListenerConfig } from "./ListenerConfig";

type Tab = "topics" | "content" | "engagement" | "comments" | "config";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "topics", label: "Topics", icon: "◎" },
  { key: "content", label: "Content", icon: "✎" },
  { key: "engagement", label: "Engagement", icon: "◆" },
  { key: "comments", label: "Comments", icon: "◇" },
  { key: "config", label: "Config", icon: "⚙" },
];

export function ListenerDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("topics");

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="text-[10px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "topics" && <TopicScanner />}
        {activeTab === "content" && <ContentReview />}
        {activeTab === "engagement" && <EngagementView />}
        {activeTab === "comments" && <CommentReview />}
        {activeTab === "config" && <ListenerConfig />}
      </div>
    </div>
  );
}
