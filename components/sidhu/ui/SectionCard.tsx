import type { ReactNode } from "react";
import { cn } from "@/components/sidhu/ui/cn";

export function SectionCard({
  children,
  className,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
}) {
  const pad = padding === "none" ? "" : padding === "sm" ? "p-4" : "p-5";
  return (
    <section className={cn("rounded-xl border border-line bg-admin-surface", pad, className)}>
      {children}
    </section>
  );
}
