import type { ReactNode } from "react";
import { cn } from "@/components/sidhu/ui/cn";

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "ai";

const TONE: Record<StatusBadgeTone, string> = {
  neutral: "border-line bg-paper text-ink/80",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  ai: "border-violet-200 bg-violet-50 text-violet-900",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusBadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
