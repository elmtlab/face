"use client";

import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  /** Controlled mode: externally managed expanded state */
  expanded?: boolean;
  /** Controlled mode: toggle callback */
  onToggle?: () => void;
  /** Uncontrolled mode: initial open state (ignored if expanded/onToggle provided) */
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  count,
  children,
  expanded,
  onToggle,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = expanded !== undefined && onToggle !== undefined;
  const isOpen = isControlled ? expanded : internalOpen;
  const toggle = isControlled ? onToggle : () => setInternalOpen((o) => !o);

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full px-4 py-2 flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
        <span className="font-medium">{title}</span>
        {count !== undefined && (
          <span className="text-zinc-600">({count})</span>
        )}
      </button>
      {isOpen && children}
    </div>
  );
}
