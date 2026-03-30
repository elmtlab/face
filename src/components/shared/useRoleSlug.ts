"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/user/UserContext";

interface RoleInfo {
  slug: string;
  label: string;
  userRole: string;
}

/**
 * Returns the current user's role slug (e.g. "dev", "pm") and a list
 * of all available role slugs for use in tag selectors / filters.
 */
export function useRoleSlug() {
  const { role } = useUser();
  const [roles, setRoles] = useState<RoleInfo[]>([]);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []))
      .catch(() => {});
  }, []);

  const currentSlug = roles.find((r) => r.userRole === role)?.slug ?? null;

  return { currentSlug, roles };
}
