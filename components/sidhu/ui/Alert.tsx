import type { ReactNode } from "react";
import { cn } from "@/components/sidhu/ui/cn";

export type AlertTone = "ok" | "success" | "error" | "warning" | "info";

const TONE: Record<AlertTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

export function Alert({
  tone = "info",
  children,
  className,
  role = "status",
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className={cn("rounded-md border px-3 py-2 text-sm", TONE[tone], className)}>
      {children}
    </div>
  );
}
