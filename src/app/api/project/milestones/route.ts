import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";

export async function GET() {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const milestones = await provider.listMilestones();
  return NextResponse.json({ milestones });
}
