"use client";

import { Suspense } from "react";
import { ProjectDashboard } from "@/components/project/ProjectDashboard";

/**
 * /project — Dual product manager / project manager dashboard.
 *
 * Renders the ProjectDashboard inside a Suspense boundary (required by
 * useSearchParams). The active view tab and sidebar selection are
 * persisted via URL query params (?role=product&view=requirements)
 * and localStorage.
 */
export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectDashboard />
    </Suspense>
  );
}
