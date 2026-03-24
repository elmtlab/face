"use client";

import { useState } from "react";
import { ProjectSidebar } from "@/components/project/ProjectSidebar";
import { BoardView } from "@/components/project/BoardView";
import { IssueListView } from "@/components/project/IssueListView";
import { IssueDetailPanel } from "@/components/project/IssueDetailPanel";
import { SettingsView } from "@/components/project/SettingsView";
import { AgentPanel } from "@/components/project/AgentPanel";
import { RequirementWorkflow } from "@/components/project/RequirementWorkflow";

export type ViewMode = "board" | "list" | "workflow" | "settings";

export default function ProjectPage() {
  const [view, setView] = useState<ViewMode>("board");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [agentIssueId, setAgentIssueId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="flex h-screen">
      <ProjectSidebar
        activeView={view}
        onViewChange={setView}
        onRefresh={refresh}
        refreshKey={refreshKey}
      />

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {view === "board" && (
            <BoardView
              key={refreshKey}
              onSelectIssue={setSelectedIssueId}
              onAssignAgent={setAgentIssueId}
            />
          )}
          {view === "list" && (
            <IssueListView
              key={refreshKey}
              onSelectIssue={setSelectedIssueId}
              onAssignAgent={setAgentIssueId}
            />
          )}
          {view === "workflow" && (
            <RequirementWorkflow
              onClose={() => setView("board")}
              onCreated={refresh}
            />
          )}
          {view === "settings" && <SettingsView />}
        </div>

        {view !== "workflow" && selectedIssueId && (
          <IssueDetailPanel
            issueId={selectedIssueId}
            onClose={() => setSelectedIssueId(null)}
            onAssignAgent={setAgentIssueId}
            onUpdate={refresh}
          />
        )}

        {view !== "workflow" && agentIssueId && (
          <AgentPanel
            issueId={agentIssueId}
            onClose={() => setAgentIssueId(null)}
          />
        )}
      </main>
    </div>
  );
}
