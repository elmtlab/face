"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PROJECT_VIEWS,
  PROJECT_VIEW_KEYS,
  isProjectViewKey,
  type ProjectViewKey,
} from "@/lib/roles/project-views";
import type { SidebarLink } from "@/lib/roles/types";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { useActiveProject } from "@/components/projects/ProjectSelector";

const STORAGE_KEY = "face-project-view";

/**
 * Dual-view project dashboard.
 *
 * Renders a Product Manager or Project Manager dashboard, switchable via
 * tabs. Each view is powered by the role-based widget system with its own
 * sidebar links and widget grid. Both the active role tab (`?role=`) and
 * sidebar view (`?view=`) are persisted in the URL for deep-linking, with
 * localStorage as a fallback for the role tab across fresh navigations.
 */
export function ProjectDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve initial role from URL → localStorage → default
  const resolveRole = useCallback((): ProjectViewKey => {
    const param = searchParams.get("role");
    if (param && isProjectViewKey(param)) return param;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isProjectViewKey(stored)) return stored;
    }
    return "product";
  }, [searchParams]);

  const [activeRole, setActiveRole] = useState<ProjectViewKey>(resolveRole);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { activeProjectId, projects, setActive: setActiveProject } = useActiveProject();

  const role = PROJECT_VIEWS[activeRole];

  // Resolve sidebar view from URL
  const resolveView = useCallback(
    (param: string | null): string | null => {
      if (!param) return null;
      return role.sidebarLinks.find((l) => l.key === param) ? param : null;
    },
    [role.sidebarLinks],
  );

  const [activeView, setActiveView] = useState<string | null>(() =>
    resolveView(searchParams.get("view")),
  );

  // Sync when search params change externally
  useEffect(() => {
    const paramRole = searchParams.get("role");
    if (paramRole && isProjectViewKey(paramRole) && paramRole !== activeRole) {
      setActiveRole(paramRole);
    }
    setActiveView(resolveView(searchParams.get("view")));
  }, [searchParams, resolveView, activeRole]);

  // Build URL from current state
  const buildUrl = useCallback(
    (r: ProjectViewKey, v: string | null) => {
      const params = new URLSearchParams();
      params.set("role", r);
      if (v) params.set("view", v);
      return `/project?${params.toString()}`;
    },
    [],
  );

  const handleRoleChange = useCallback(
    (key: ProjectViewKey) => {
      setActiveRole(key);
      setActiveView(null);
      setMobileMenuOpen(false);
      localStorage.setItem(STORAGE_KEY, key);
      router.replace(buildUrl(key, null), { scroll: false });
    },
    [router, buildUrl],
  );

  const handleViewChange = useCallback(
    (key: string | null) => {
      setActiveView(key);
      setMobileMenuOpen(false);
      router.replace(buildUrl(activeRole, key), { scroll: false });
    },
    [router, buildUrl, activeRole],
  );

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileMenuOpen]);

  // Determine which widgets to render
  const activeLink = activeView
    ? role.sidebarLinks.find((l) => l.key === activeView)
    : null;
  const widgetsToRender = activeLink ? activeLink.widgets : role.widgets;

  // ── Role tabs ──────────────────────────────────────────────────────

  const roleTabs = (
    <div className="flex gap-1">
      {PROJECT_VIEW_KEYS.map((key) => {
        const view = PROJECT_VIEWS[key];
        const isActive = activeRole === key;
        return (
          <button
            key={key}
            onClick={() => handleRoleChange(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );

  // ── Sidebar content (shared between desktop and mobile) ────────────

  const sidebarNav = (mobile?: boolean) => (
    <nav className={mobile ? "flex-1 overflow-y-auto p-4" : "flex-1 overflow-y-auto p-3"}>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
        {role.label}
      </p>
      <button
        onClick={() => handleViewChange(null)}
        className={`w-full text-left flex items-center rounded-md text-sm transition-colors ${
          mobile ? "gap-2.5 px-3 py-2" : "gap-2 px-2 py-1.5"
        } ${
          activeView === null
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        }`}
      >
        <span className="text-base">⊞</span>
        <span className="truncate">Overview</span>
        {activeView === null && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
        )}
      </button>

      <div className={mobile ? "mt-1 space-y-1" : "mt-1 space-y-0.5"}>
        {role.sidebarLinks.map((link) => (
          <SidebarButton
            key={link.key}
            link={link}
            isActive={activeView === link.key}
            onClick={() => handleViewChange(link.key)}
            mobile={mobile}
          />
        ))}
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors"
          >
            FACE
          </Link>
        </div>

        {/* Project switcher */}
        {projects.length > 1 && (
          <div className="border-b border-zinc-800 px-3 py-2">
            <select
              value={activeProjectId ?? ""}
              onChange={(e) => setActiveProject(e.target.value || null)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Role tabs in sidebar */}
        <div className="border-b border-zinc-800 px-3 py-2">
          {roleTabs}
        </div>

        {sidebarNav()}

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
                d={role.iconPath}
              />
            </svg>
            <p className="text-xs font-medium text-zinc-200 truncate">
              {role.label}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <Link href="/" className="text-sm font-semibold text-zinc-100">
                FACE
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Close menu"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Project switcher (mobile) */}
            {projects.length > 1 && (
              <div className="border-b border-zinc-800 px-4 py-2">
                <select
                  value={activeProjectId ?? ""}
                  onChange={(e) => setActiveProject(e.target.value || null)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Role tabs in mobile sidebar */}
            <div className="border-b border-zinc-800 px-4 py-2">
              {roleTabs}
            </div>

            {sidebarNav(true)}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 md:px-6">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 md:hidden"
            aria-label="Open menu"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
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
              d={role.iconPath}
            />
          </svg>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-100 truncate">
              {role.label}
              {activeLink && (
                <span className="font-normal text-zinc-400">
                  {" "}
                  / {activeLink.label}
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-500 truncate hidden sm:block">
              {role.description}
            </p>
          </div>
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
            {widgetsToRender.map((widget, index) => (
              <WidgetRenderer
                key={`${activeRole}-${activeView ?? "overview"}-${widget.type}-${index}`}
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

/** Sidebar navigation button for a single link. */
function SidebarButton({
  link,
  isActive,
  onClick,
  mobile,
}: {
  link: SidebarLink;
  isActive: boolean;
  onClick: () => void;
  mobile?: boolean;
}) {
  const base = mobile
    ? "w-full text-left flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors"
    : "w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors";
  const active = "bg-zinc-800 text-zinc-100";
  const inactive = "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200";

  return (
    <button onClick={onClick} className={`${base} ${isActive ? active : inactive}`}>
      <span className="text-base">{link.icon}</span>
      <span className="truncate">{link.label}</span>
      {isActive && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
      )}
    </button>
  );
}
