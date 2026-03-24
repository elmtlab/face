import { NextResponse } from "next/server";
import {
  addProvider,
  listProviderConfigs,
  removeProvider,
  setActiveProvider,
  getActiveProviderName,
} from "@/lib/project/manager";
import { availableProviders } from "@/lib/project/registry";

export async function GET() {
  const configs = listProviderConfigs();
  const active = getActiveProviderName();
  const available = availableProviders();
  return NextResponse.json({ providers: configs, active, available });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "add") {
    const result = await addProvider(body.config);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "setActive") {
    const ok = setActiveProvider(body.name);
    return NextResponse.json({ ok });
  }

  if (body.action === "remove") {
    removeProvider(body.name);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
