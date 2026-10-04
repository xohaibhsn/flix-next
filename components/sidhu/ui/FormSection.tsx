import type { ReactNode } from "react";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { HelpText } from "@/components/sidhu/ui/HelpText";
import { cn } from "@/components/sidhu/ui/cn";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard className={cn("space-y-3", className)}>
      {title ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description ? <HelpText className="mt-1">{description}</HelpText> : null}
        </div>
      ) : null}
      {children}
    </SectionCard>
  );
}
