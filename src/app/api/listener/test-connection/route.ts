import { NextRequest, NextResponse } from "next/server";
import { testConnection } from "@/lib/listener/platforms";
import type { PlatformName } from "@/lib/listener/env";

export async function POST(req: NextRequest) {
  const { platform } = (await req.json()) as { platform: PlatformName };
  if (!["twitter", "discord", "telegram"].includes(platform)) {
    return NextResponse.json(
      { ok: false, error: "Invalid platform" },
      { status: 400 },
    );
  }
  const result = await testConnection(platform);
  return NextResponse.json(result);
}
