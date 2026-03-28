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
import { MilestoneView } from "@/components/project/MilestoneView";
import { TriageView } from "@/components/project/TriageView";

export type ViewMode = "board" | "list" | "workflow" | "requirements" | "milestones" | "triage" | "settings";

const VIEW_LABELS: Record<ViewMode, string> = {
  board: "Board",
  list: "Issues",
  workflow: "New Requirement",
  requirements: "Requirements",
  milestones: "Milestones",
  triage: "Triage",
  settings: "Settings",
};

export default function ProjectPage() {
  const [view, setView] = useState<ViewMode>("board");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [agentIssueId, setAgentIssueId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const refresh = () => setRefreshKey((k) => k + 1);

  const openWorkflow = (id: string) => {
    setSelectedWorkflowId(id);
    setView("workflow");
  };

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <ProjectSidebar
          activeView={view}
          onViewChange={(v) => {
            if (v === "workflow") setSelectedWorkflowId(null);
            setView(v);
          }}
          onSelectWorkflow={openWorkflow}
          onRefresh={refresh}
          refreshKey={refreshKey}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 animate-in slide-in-from-left duration-200">
            <ProjectSidebar
              activeView={view}
              onViewChange={(v) => {
                if (v === "workflow") setSelectedWorkflowId(null);
                setView(v);
                setMobileSidebarOpen(false);
              }}
              onSelectWorkflow={(id) => {
                openWorkflow(id);
                setMobileSidebarOpen(false);
              }}
              onRefresh={refresh}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold text-zinc-100">{VIEW_LABELS[view]}</h1>
        </div>

        <div className="flex flex-1 overflow-hidden">
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
            {view === "milestones" && (
              <MilestoneView
                onFilterBoard={() => {
                  setView("board");
                }}
              />
            )}
            {view === "triage" && <TriageView />}
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
        </div>
      </main>
    </div>
  );
}
