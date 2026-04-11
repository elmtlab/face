import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/listener/env";

export async function GET() {
  return NextResponse.json(getConnectionStatus());
}
