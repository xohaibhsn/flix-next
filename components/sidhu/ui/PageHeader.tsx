import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/sidhu/ui/Breadcrumbs";
import { cn } from "@/components/sidhu/ui/cn";

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
        <h1 className="text-xl font-bold tracking-tight text-ink lg:text-[1.35rem]">{title}</h1>
        {subtitle ? <p className="max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
