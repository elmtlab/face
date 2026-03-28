"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import type { RoleDefinition } from "@/lib/roles/types";
import { RoleDashboard } from "@/components/widgets/RoleDashboard";
import Link from "next/link";

interface RolePageProps {
  params: Promise<{ role: string }>;
}

export default function RolePage({ params }: RolePageProps) {
  const { role: slug } = use(params);
  const [roleDef, setRoleDef] = useState<RoleDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/roles/${slug}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.role) {
          setRoleDef(data.role);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-zinc-500"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
            <path d="M8 2a6 6 0 014.24 1.76" />
          </svg>
          <p className="text-sm text-zinc-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (notFound || !roleDef) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">
            Role not found
          </h1>
          <p className="text-sm text-zinc-400 mb-4">
            No role is configured for <code className="text-zinc-300">/{slug}</code>.
          </p>
          <Link
            href="/"
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  return <RoleDashboard role={roleDef} />;
}
