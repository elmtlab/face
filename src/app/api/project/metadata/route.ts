import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";

export async function GET() {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const [labels, milestones, members] = await Promise.all([
    provider.listLabels(),
    provider.listMilestones(),
    provider.listMembers(),
  ]);

  return NextResponse.json({ labels, milestones, members });
}
