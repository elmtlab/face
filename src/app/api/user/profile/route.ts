import { NextRequest, NextResponse } from "next/server";
import { getUserProfile, createOrUpdateProfile } from "@/lib/user/profile";
import { USER_ROLES, type UserRole } from "@/lib/user/types";

export async function GET() {
  const profile = getUserProfile();
  if (!profile) {
    return NextResponse.json({ profile: null, needsOnboarding: true });
  }
  return NextResponse.json({ profile, needsOnboarding: false });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { role, displayName } = body as {
    role: string;
    displayName?: string;
  };

  if (!role || !USER_ROLES.includes(role as UserRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${USER_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  const profile = createOrUpdateProfile(role as UserRole, displayName);
  return NextResponse.json({ profile });
}
