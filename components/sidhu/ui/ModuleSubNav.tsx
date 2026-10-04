"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/sidhu/ui/cn";

export type ModuleSubNavItem = {
  id: string;
  label: string;
  href: string;
};

export function ModuleSubNav({
  items,
  ariaLabel = "Section",
  isActive,
}: {
  items: readonly ModuleSubNavItem[];
  ariaLabel?: string;
  isActive?: (pathname: string, href: string) => boolean;
}) {
  const pathname = usePathname() || "";

  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-line">
      {items.map((item) => {
        const active = isActive
          ? isActive(pathname, item.href)
          : pathname === item.href || pathname.startsWith(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
              active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
