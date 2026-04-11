import { NextRequest, NextResponse } from "next/server";
import { readEnv, writeEnv, type ListenerEnv } from "@/lib/listener/env";

export async function GET() {
  const env = readEnv();
  // Mask secret values — only return whether each key has a value
  const masked: Record<string, string> = {};
  for (const [key, val] of Object.entries(env)) {
    masked[key] = val ? "••••" + val.slice(-4) : "";
  }
  return NextResponse.json({ settings: masked });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<ListenerEnv>;
  // Filter out masked placeholder values so we don't overwrite real secrets
  const cleaned: Partial<ListenerEnv> = {};
  for (const [key, val] of Object.entries(body)) {
    if (val && !val.startsWith("••••")) {
      cleaned[key as keyof ListenerEnv] = val;
    }
  }
  writeEnv(cleaned);
  return NextResponse.json({ ok: true });
}
