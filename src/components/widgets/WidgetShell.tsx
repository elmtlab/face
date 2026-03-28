"use client";

import type { ReactNode } from "react";
import type { WidgetSize } from "@/lib/roles/types";

const SIZE_CLASSES: Record<WidgetSize, string> = {
  small: "col-span-1",
  medium: "col-span-1 md:col-span-1",
  large: "col-span-1 md:col-span-2",
  full: "col-span-1 md:col-span-2 lg:col-span-3",
};

interface WidgetShellProps {
  title: string;
  size: WidgetSize;
  children: ReactNode;
}

/**
 * Reusable container for all dashboard widgets.
 * Provides consistent card styling and responsive grid sizing.
 */
export function WidgetShell({ title, size, children }: WidgetShellProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-xl border border-zinc-800 bg-zinc-900/50 p-4`}
    >
      <h3 className="mb-3 text-sm font-medium text-zinc-400">{title}</h3>
      <div className="min-h-0">{children}</div>
    </div>
  );
}
