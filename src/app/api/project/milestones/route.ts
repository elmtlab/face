import { NextResponse } from "next/server";
import { getAllProviders } from "@/lib/project/manager";
import type { Milestone } from "@/lib/project/types";

export async function GET(req: Request) {
  const providers = await getAllProviders();
  if (providers.length === 0) {
    return NextResponse.json({ milestones: [] });
  }

  const url = new URL(req.url);
  const providerFilter = url.searchParams.get("provider");

  const allMilestones: Milestone[] = [];
  for (const provider of providers) {
    if (providerFilter && provider.displayName !== providerFilter) continue;
    try {
      const milestones = await provider.listMilestones();
      allMilestones.push(...milestones);
    } catch {
      // Skip providers that fail
    }
  }

  return NextResponse.json({ milestones: allMilestones });
}
