"use client";

import { useState, useEffect, useCallback } from "react";
import type { RoleDefinition } from "@/lib/roles/types";
import { WidgetRenderer } from "./WidgetRenderer";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface RoleDashboardProps {
  role: RoleDefinition;
}

interface RoleSummary {
  slug: string;
  label: string;
  routePath: string;
  iconPath: string;
  readOnly: boolean;
}

/**
 * Assembles a role-specific dashboard from the role definition's widget list.
 * Includes a sidebar for navigation and role switching (desktop) and a
 * hamburger-driven drawer on mobile.
 */
export function RoleDashboard({ role }: RoleDashboardProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roles, setRoles] = useState<RoleSummary[]>([]);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((data) => {
        if (data.roles) setRoles(data.roles);
      })
      .catch(() => {});
  }, []);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  // Close mobile menu on route change
  useEffect(() => {
    closeMobileMenu();
  }, [pathname, closeMobileMenu]);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileMenuOpen]);

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
          <Link href="/" className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors">
            FACE
          </Link>
        </div>
        <div className="border-b border-zinc-800 p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Roles</p>
          <div className="space-y-0.5">
            {roles.map((r) => (
              <Link
                key={r.slug}
                href={r.routePath}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  pathname === r.routePath
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <svg className={`h-3.5 w-3.5 flex-shrink-0 ${pathname === r.routePath ? "text-blue-400" : "text-zinc-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d={r.iconPath} />
                </svg>
                <span className="truncate">{r.label}</span>
                {pathname === r.routePath && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />}
              </Link>
            ))}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {role.permissions.canViewProject && (
            <div className="mb-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Project</p>
              <Link href="/project" className="block rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200">Board</Link>
              <Link href="/project?view=milestones" className="block rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200">Milestones</Link>
            </div>
          )}
          {role.permissions.canConfigure && (
            <div className="mb-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Settings</p>
              <Link href="/project?view=settings" className="block rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200">Configuration</Link>
            </div>
          )}
        </nav>
        <div className="border-t border-zinc-800 p-3">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{role.label}</p>
              {role.permissions.readOnly && <p className="text-[10px] text-zinc-500">Read-only</p>}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeMobileMenu} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <Link href="/" className="text-sm font-semibold text-zinc-100">FACE</Link>
              <button onClick={closeMobileMenu} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" aria-label="Close menu">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="border-b border-zinc-800 p-4">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Switch Role</p>
              <div className="space-y-1">
                {roles.map((r) => (
                  <Link key={r.slug} href={r.routePath} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${pathname === r.routePath ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}>
                    <svg className={`h-4 w-4 flex-shrink-0 ${pathname === r.routePath ? "text-blue-400" : "text-zinc-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d={r.iconPath} />
                    </svg>
                    <span>{r.label}</span>
                    {pathname === r.routePath && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />}
                  </Link>
                ))}
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              {role.permissions.canViewProject && (
                <Link href="/project" className="block rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200">Project Board</Link>
              )}
              {role.permissions.canConfigure && (
                <Link href="/project?view=settings" className="block rounded-md px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200">Settings</Link>
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 md:px-6">
          <button onClick={() => setMobileMenuOpen(true)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 md:hidden" aria-label="Open menu">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <svg className="h-5 w-5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d={role.iconPath} />
          </svg>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-100 truncate">{role.label}</h1>
            <p className="text-xs text-zinc-500 truncate hidden sm:block">{role.description}</p>
          </div>
          {role.permissions.readOnly && (
            <span className="ml-auto rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs text-zinc-400 flex-shrink-0">Read-only</span>
          )}
        </header>

        {/* AI behavior hint */}
        <div className="border-b border-zinc-800/50 bg-zinc-900/30 px-4 py-2 md:px-6">
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-400 font-medium">AI assistant: </span>
            {role.aiBehavior.description}
          </p>
        </div>

        {/* Widget grid */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {role.widgets.map((widget, index) => (
              <WidgetRenderer
                key={`${widget.type}-${index}`}
                config={widget}
                promptTemplates={role.aiBehavior.promptTemplates}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
