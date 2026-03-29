import { NextResponse } from "next/server";
import { scanAllTasks } from "@/lib/security/scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  const reports = scanAllTasks();
  return NextResponse.json({ reports });
}
