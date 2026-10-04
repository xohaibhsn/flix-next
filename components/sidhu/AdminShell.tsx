"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  FileText,
  FolderOpen,
  ImageIcon,
  LayoutDashboard,
  Mail,
  Menu,
  Newspaper,
  Redo2,
  Search,
  Settings,
  Shield,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/sidhu/LogoutButton";
import { useAdminSession } from "@/components/sidhu/AdminSessionProvider";
import { PageHeader } from "@/components/sidhu/ui/PageHeader";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";
import { cn } from "@/components/sidhu/ui/cn";
import {
  filterSidhuNavGroups,
  isSidhuNavActive,
  type SidhuNavIcon,
  type SidhuNavItem,
} from "@/lib/cms/sidhu-nav";
import type { BreadcrumbItem } from "@/components/sidhu/ui/Breadcrumbs";

const ICONS: Record<SidhuNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  pages: FileText,
  blog: Newspaper,
  media: ImageIcon,
  seo: Search,
  pricing: Tag,
  faqs: FolderOpen,
  redirects: Redo2,
  settings: Settings,
  messages: Mail,
  users: Shield,
};

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: SidhuNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];
  const active = isSidhuNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        active ? "bg-brand text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

function NavGroups({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const session = useAdminSession();
  const groups =
    session != null ? filterSidhuNavGroups(session.role, session.permissions) : [];

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-admin-sidebar-muted uppercase">
            {group.label}
          </p>
          <div className="mt-1.5 space-y-0.5">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountFooter({
  pathname,
  onNavigate,
  compact,
}: {
  pathname: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const session = useAdminSession();
  const accountActive = isSidhuNavActive(pathname, "/sidhu/account/");
  return (
    <div className={cn("border-t border-admin-sidebar-border", compact ? "p-3" : "p-4")}>
      <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-admin-sidebar-muted uppercase">
        Account
      </p>
      <div className="mt-1.5 space-y-0.5">
        <Link
          href="/sidhu/account/"
          onClick={onNavigate}
          aria-current={accountActive ? "page" : undefined}
          className={cn(
            "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
            accountActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
          )}
        >
          <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
          My Account
        </Link>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          View website
        </Link>
        <div className="px-3 py-1">
          <LogoutButton className="min-h-10 w-full justify-start rounded-md px-0 text-sm font-medium text-white/55 hover:text-white" />
        </div>
      </div>
      {session ? (
        <p className="mt-2 truncate px-3 text-[11px] text-admin-sidebar-muted">
          {session.displayName || session.username}
        </p>
      ) : null}
    </div>
  );
}

export function AdminShell({
  children,
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="sidhu-admin flex min-h-screen bg-admin-canvas text-ink">
      <aside className="hidden w-[240px] shrink-0 flex-col bg-admin-sidebar text-white lg:flex">
        <div className="border-b border-admin-sidebar-border px-5 py-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">Sidhu</p>
          <p className="mt-1 text-sm font-bold">Flix IPTV CMS</p>
        </div>
        <nav aria-label="Sidhu modules" className="flex-1 overflow-y-auto p-3">
          <NavGroups pathname={pathname} />
        </nav>
        <AccountFooter pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-admin-surface/95 px-4 py-3 backdrop-blur-sm lg:px-8">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
            </div>
            <button
              type="button"
              className={cn(
                sidhuButtonClass("secondary"),
                "shrink-0 px-0 lg:hidden",
                "h-10 w-10",
              )}
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              aria-controls={panelId}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Sidhu navigation">
            <button
              type="button"
              className="absolute inset-0 bg-ink/45"
              aria-label="Close navigation menu"
              onClick={() => setOpen(false)}
            />
            <div
              id={panelId}
              className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-admin-sidebar text-white shadow-none"
            >
              <div className="flex items-center justify-between border-b border-admin-sidebar-border px-4 py-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">Sidhu</p>
                  <p className="mt-0.5 text-sm font-bold">Flix IPTV CMS</p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white/80 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Sidhu modules" className="flex-1 overflow-y-auto p-3">
                <NavGroups pathname={pathname} onNavigate={() => setOpen(false)} />
              </nav>
              <AccountFooter pathname={pathname} onNavigate={() => setOpen(false)} compact />
            </div>
          </div>
        ) : null}

        <div className="flex-1 px-4 py-5 lg:px-8 lg:py-6">{children}</div>
      </div>
    </div>
  );
}

export function ComingSoon({ moduleName }: { moduleName: string }) {
  return (
    <SectionCard className="p-8">
      <p className="text-sm font-semibold text-brand">Coming in the next local phase</p>
      <h2 className="mt-2 text-2xl font-bold">{moduleName}</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        This screen is intentionally empty. No fake data, editors, or placeholders that pretend the
        module works. Home page editing, media, and branding settings are available now.
      </p>
    </SectionCard>
  );
}
