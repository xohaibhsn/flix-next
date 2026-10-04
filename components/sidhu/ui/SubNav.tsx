"use client";

import { cn } from "@/components/sidhu/ui/cn";

export type SubNavItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

export function SubNav<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = "Section",
}: {
  items: SubNavItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 border-b border-line"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            id={`sidhu-subnav-${item.id}`}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
              active
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className="rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
