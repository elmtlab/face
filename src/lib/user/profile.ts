import { getDb } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { UserProfile, UserRole } from "./types";

const DEFAULT_USER_ID = "default";

export function getUserProfile(): UserProfile | null {
  const db = getDb();
  const row = db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, DEFAULT_USER_ID))
    .get();

  if (!row) return null;

  return {
    id: row.id,
    role: row.role as UserRole,
    displayName: row.displayName,
    onboardedAt: row.onboardedAt,
    updatedAt: row.updatedAt,
    preferences: row.preferences ? JSON.parse(row.preferences) : {},
  };
}

export function createOrUpdateProfile(
  role: UserRole,
  displayName?: string
): UserProfile {
  const db = getDb();
  const now = Date.now();
  const existing = getUserProfile();

  if (existing) {
    db.update(userProfiles)
      .set({
        role,
        displayName: displayName ?? existing.displayName,
        updatedAt: now,
      })
      .where(eq(userProfiles.id, DEFAULT_USER_ID))
      .run();
  } else {
    db.insert(userProfiles)
      .values({
        id: DEFAULT_USER_ID,
        role,
        displayName: displayName ?? null,
        onboardedAt: now,
        updatedAt: now,
        preferences: "{}",
      })
      .run();
  }

  return getUserProfile()!;
}
