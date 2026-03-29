"use client";

import { useState } from "react";
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

  if (showWorkflow) {
    return (
      <div className="min-h-[500px] -m-4 rounded-lg overflow-hidden border border-zinc-800">
        <RequirementWorkflow
          workflowId={selectedWorkflowId}
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
