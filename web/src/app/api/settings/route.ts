import { NextRequest, NextResponse } from "next/server";
import { readEnvFile, writeEnvFile, PLATFORM_CONFIGS } from "@/lib/platforms";
import type { PlatformType } from "@/lib/platforms/types";

export async function GET() {
  const env = readEnvFile();

  const platforms = PLATFORM_CONFIGS.map((config) => {
    const configured = config.credentials.every((c) => env[c.key] && env[c.key].length > 0);
    const maskedCredentials: Record<string, string> = {};
    for (const cred of config.credentials) {
      const val = env[cred.key];
      maskedCredentials[cred.key] = val ? `${"*".repeat(Math.min(val.length, 8))}${val.slice(-4)}` : "";
    }
    return {
      type: config.type,
      displayName: config.displayName,
      configured,
      credentials: maskedCredentials,
    };
  });

  return NextResponse.json({ platforms });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { credentials } = body as { credentials: Record<string, string> };

  if (!credentials || typeof credentials !== "object") {
    return NextResponse.json({ error: "Missing credentials object" }, { status: 400 });
  }

  const env = readEnvFile();
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  writeEnvFile(env);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { platform } = (await request.json()) as { platform: PlatformType };
  const config = PLATFORM_CONFIGS.find((c) => c.type === platform);
  if (!config) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  const env = readEnvFile();
  for (const cred of config.credentials) {
    delete env[cred.key];
  }

  writeEnvFile(env);
  return NextResponse.json({ success: true });
}
