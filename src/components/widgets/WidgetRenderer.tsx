"use client";

import type { WidgetConfig } from "@/lib/roles/types";
import { WidgetShell } from "./WidgetShell";
import { TaskSubmitWidget } from "./TaskSubmitWidget";
import { TaskListWidget } from "./TaskListWidget";
import { IssueBoardWidget } from "./IssueBoardWidget";
import { IssueListWidget } from "./IssueListWidget";
import { MilestoneSummaryWidget } from "./MilestoneSummaryWidget";
import { RequirementsListWidget } from "./RequirementsListWidget";
import { RequirementWorkflowWidget } from "./RequirementWorkflowWidget";
import { AgentStatusWidget } from "./AgentStatusWidget";
import { TriageSummaryWidget } from "./TriageSummaryWidget";
import { ProjectManagerWidget } from "./ProjectManagerWidget";
import { TopComponentsWidget } from "./TopComponentsWidget";

interface WidgetRendererProps {
  config: WidgetConfig;
  promptTemplates?: string[];
}

/**
 * Maps a widget config type to its concrete component.
 * This is the single point of extension for adding new widget types.
 */
export function WidgetRenderer({ config, promptTemplates }: WidgetRendererProps) {
  const props = config.props ?? {};

  function renderWidget() {
    switch (config.type) {
      case "task-submit":
        return <TaskSubmitWidget promptTemplates={promptTemplates} />;
      case "task-list":
        return <TaskListWidget readOnly={props.readOnly as boolean} />;
      case "issue-board":
        return <IssueBoardWidget readOnly={props.readOnly as boolean} />;
      case "issue-list":
        return <IssueListWidget filterLabel={props.filterLabel as string} />;
      case "milestone-summary":
        return <MilestoneSummaryWidget />;
      case "requirements-list":
        return <RequirementsListWidget />;
      case "requirement-workflow":
        return <RequirementWorkflowWidget />;
      case "agent-status":
        return <AgentStatusWidget />;
      case "triage-summary":
        return <TriageSummaryWidget />;
      case "project-manager":
        return <ProjectManagerWidget />;
      case "top-components":
        return <TopComponentsWidget />;
      default:
        return (
          <p className="text-xs text-zinc-500">
            Unknown widget type: {config.type}
          </p>
        );
    }
  }

  return (
    <WidgetShell title={config.title} size={config.size}>
      {renderWidget()}
    </WidgetShell>
  );
}
