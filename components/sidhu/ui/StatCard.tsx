import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/components/sidhu/ui/cn";

export function StatCard({
  label,
  value,
  hint,
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-xl border border-line bg-admin-surface p-4 transition-colors hover:border-brand/40 hover:bg-paper",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className={cn("rounded-xl border border-line bg-admin-surface p-4", className)}>{body}</div>
  );
}

export function DashboardSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}
