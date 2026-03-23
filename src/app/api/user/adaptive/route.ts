import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/user/profile";
import { computeAdaptiveLayout } from "@/lib/user/adaptive";

export async function GET() {
  const profile = getUserProfile();
  const role = profile?.role ?? "other";
  const layout = computeAdaptiveLayout(role);
  return NextResponse.json(layout);
}
