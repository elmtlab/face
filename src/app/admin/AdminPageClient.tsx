"use client";

import Link from "next/link";
import { SecurityAuditDashboard } from "@/components/admin/SecurityAuditDashboard";

interface RoleSummary {
  slug: string;
  label: string;
  description: string;
  routePath: string;
  iconPath: string;
}

export function AdminPageClient({ roles }: { roles: RoleSummary[] }) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors"
          >
            FACE
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            Role Views
          </p>
          {roles.map((role) => (
            <Link
              key={role.slug}
              href={role.routePath}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors"
            >
              <svg
                className="h-4 w-4 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
              </svg>
              <span className="truncate">{role.label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-blue-400 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              />
            </svg>
            <p className="text-xs font-medium text-zinc-200">Admin</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 md:px-6">
          <svg
            className="h-5 w-5 text-blue-400 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
            />
          </svg>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Administration</h1>
            <p className="text-xs text-zinc-500 hidden sm:block">
              Role navigation and security audit dashboard
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {/* Role links - mobile-friendly grid (sidebar handles desktop) */}
          <section className="md:hidden">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Role Views
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((role) => (
                <Link
                  key={role.slug}
                  href={role.routePath}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100 transition-colors"
                >
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-zinc-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
                  </svg>
                  <span className="truncate">{role.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Role links - desktop card grid */}
          <section className="hidden md:block">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Role Views
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {roles.map((role) => (
                <Link
                  key={role.slug}
                  href={role.routePath}
                  className="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg
                      className="h-4 w-4 text-zinc-500 group-hover:text-blue-400 transition-colors"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
                    </svg>
                    <span className="text-sm font-medium text-zinc-200">{role.label}</span>
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2">{role.description}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* Security Audit Dashboard */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <SecurityAuditDashboard />
          </section>
        </main>
      </div>
    </div>
  );
}
