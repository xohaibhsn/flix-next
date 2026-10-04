import type { ReactNode } from "react";
import { cn } from "@/components/sidhu/ui/cn";

export function HelpText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("mt-0.5 block text-xs leading-relaxed text-muted", className)}>{children}</span>;
}
