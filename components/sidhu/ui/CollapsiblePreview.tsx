"use client";

import { useState, type ReactNode, type SyntheticEvent } from "react";

export function CollapsiblePreview({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="rounded-xl border border-line bg-admin-surface open:pb-0"
      open={open}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          {title}
          <span className="text-xs font-medium text-muted">(toggle)</span>
        </span>
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}
