"use client";

import { useState, useEffect } from "react";
import { RequirementsView } from "@/components/project/RequirementsView";
import { RequirementWorkflow } from "@/components/project/RequirementWorkflow";

/**
 * Full requirements widget with phase timeline and inline workflow editing.
 * Replaces the previous minimal list with the same experience as /project.
 */
export function RequirementsListWidget() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Load the active project on mount
  useEffect(() => {
    fetch("/api/projects/active")
      .then((r) => r.json())
      .then((d) => {
        if (d.project?.id) setActiveProjectId(d.project.id);
      })
      .catch(() => {});
  }, []);

  if (showWorkflow) {
    return (
      <div className="min-h-[500px] -m-4 rounded-lg overflow-hidden border border-zinc-800">
        <RequirementWorkflow
          workflowId={selectedWorkflowId}
          activeProjectId={activeProjectId}
          onClose={() => {
            setShowWorkflow(false);
            setSelectedWorkflowId(null);
          }}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[400px] -m-4 overflow-hidden">
      <RequirementsView
        key={refreshKey}
        activeProjectId={activeProjectId}
        onSelectWorkflow={(id) => {
          setSelectedWorkflowId(id);
          setShowWorkflow(true);
        }}
        onNewWorkflow={() => {
          setSelectedWorkflowId(null);
          setShowWorkflow(true);
        }}
      />
    </div>
  );
}
