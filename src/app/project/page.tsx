"use client";

import { useState } from "react";
import { ProjectSidebar } from "@/components/project/ProjectSidebar";
import { BoardView } from "@/components/project/BoardView";
import { IssueListView } from "@/components/project/IssueListView";
import { IssueDetailPanel } from "@/components/project/IssueDetailPanel";
import { SettingsView } from "@/components/project/SettingsView";
import { AgentPanel } from "@/components/project/AgentPanel";
import { RequirementWorkflow } from "@/components/project/RequirementWorkflow";
import { RequirementsView } from "@/components/project/RequirementsView";

export type ViewMode = "board" | "list" | "workflow" | "requirements" | "settings";

export default function ProjectPage() {
  const [view, setView] = useState<ViewMode>("board");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [agentIssueId, setAgentIssueId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  const openWorkflow = (id: string) => {
    setSelectedWorkflowId(id);
    setView("workflow");
  };

  return (
    <div className="flex h-screen">
      <ProjectSidebar
        activeView={view}
        onViewChange={(v) => {
          if (v === "workflow") setSelectedWorkflowId(null); // new workflow
          setView(v);
        }}
        onSelectWorkflow={openWorkflow}
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
              workflowId={selectedWorkflowId}
              onClose={() => setView("requirements")}
              onCreated={refresh}
            />
          )}
          {view === "requirements" && (
            <RequirementsView
              key={refreshKey}
              onSelectWorkflow={openWorkflow}
              onNewWorkflow={() => {
                setSelectedWorkflowId(null);
                setView("workflow");
              }}
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
