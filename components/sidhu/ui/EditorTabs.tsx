"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/sidhu/ui/cn";

export type EditorTabItem<T extends string> = {
  id: T;
  label: string;
};

/**
 * Client-local editor tabs. Does not save, fetch, or remount panel children —
 * parents should keep panels mounted and toggle visibility.
 */
export function EditorTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = "Editor sections",
}: {
  items: readonly EditorTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-line">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`sidhu-editor-tab-${item.id}`}
            aria-selected={active}
            aria-controls={`sidhu-editor-panel-${item.id}`}
            className={cn(
              "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
              active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function EditorTabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`sidhu-editor-panel-${id}`}
      aria-labelledby={`sidhu-editor-tab-${id}`}
      hidden={!active}
      className={active ? "space-y-4" : undefined}
    >
      {children}
    </div>
  );
}
