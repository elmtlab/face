"use client";

import { useState } from "react";
import { RequirementWorkflow } from "@/components/project/RequirementWorkflow";
import { useProjectContext } from "@/lib/projects/ProjectContext";

/**
 * Widget wrapper for RequirementWorkflow.
 * Used in role view "New Requirement" sidebar links to provide
 * the full 6-stage requirement workflow (identical to /project).
 */
export function RequirementWorkflowWidget() {
  // Reset key to allow starting a fresh workflow after completing one
  const [workflowKey, setWorkflowKey] = useState(0);
  const { activeProjectId } = useProjectContext();

  return (
    <div className="min-h-[500px] -m-4 rounded-lg overflow-hidden border border-zinc-800">
      <RequirementWorkflow
        key={workflowKey}
        workflowId={null}
        activeProjectId={activeProjectId}
        onClose={() => setWorkflowKey((k) => k + 1)}
        onCreated={() => {}}
      />
    </div>
  );
}
