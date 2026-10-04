import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/components/sidhu/ui/cn";

export type RelatedWorkspaceItem = {
  href: string;
  title: string;
  description?: string;
};

/**
 * Compact related-destination tiles for CMS operational navigation.
 * Dark charcoal tiles echo the Sidhu sidebar; kept quieter than primary brand actions.
 * Uses real anchors (not clickable divs).
 */
export function RelatedWorkspaces({
  title = "Related workspaces",
  items,
  className,
}: {
  title?: string;
  items: readonly RelatedWorkspaceItem[];
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <div className={cn("mt-4", className)} data-sidhu-related-workspaces="">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</p>
      <ul className="mt-2 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "group relative block h-full overflow-hidden rounded-lg border border-white/10",
                "bg-admin-sidebar px-3 py-2.5 transition-colors",
                "hover:border-white/20 hover:bg-ink-soft",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-admin-canvas",
              )}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5 bg-brand/0 transition-colors group-hover:bg-brand group-focus-visible:bg-brand"
              />
              <span className="block text-sm font-semibold text-white">{item.title}</span>
              {item.description ? (
                <span className="mt-0.5 block text-xs leading-snug text-admin-sidebar-muted">
                  {item.description}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Optional compact toolbar of quiet/secondary action controls under a section header. */
export function SectionActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-3 flex flex-wrap items-center gap-2", className)} data-sidhu-section-actions="">
      {children}
    </div>
  );
}
