"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/sidhu/ui/Button";
import { cn } from "@/components/sidhu/ui/cn";

export function StickyEditorBar({
  title,
  dirty,
  saving,
  saveLabel,
  onSave,
  secondary,
  className,
}: {
  title: string;
  dirty: boolean;
  saving: boolean;
  saveLabel: string;
  onSave: () => void;
  secondary?: ReactNode;
  className?: string;
}) {
  const status = saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved";

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 border-t border-line bg-admin-surface/95 py-3 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          <p
            className={cn(
              "mt-0.5 text-xs font-medium",
              dirty && !saving ? "text-amber-800" : "text-muted",
            )}
            aria-live="polite"
          >
            {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondary}
          <Button type="button" variant="primary" disabled={saving} className="min-h-10" onClick={onSave}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
