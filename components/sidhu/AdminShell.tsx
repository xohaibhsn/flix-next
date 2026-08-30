"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  FileText,
  FolderOpen,
  ImageIcon,
  LayoutDashboard,
  Menu,
  Mail,
  Newspaper,
  Redo2,
  Search,
  Settings,
  Shield,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/sidhu/LogoutButton";
import { useAdminSession } from "@/components/sidhu/AdminSessionProvider";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

const NAV: Array<{ href: string; label: string; icon: typeof LayoutDashboard; permission: Permission }> = [
  { href: "/sidhu/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { href: "/sidhu/pages/", label: "Pages", icon: FileText, permission: "pages" },
  { href: "/sidhu/blog/", label: "Blog", icon: Newspaper, permission: "blog" },
  { href: "/sidhu/pricing/", label: "Pricing", icon: Tag, permission: "pricing" },
  { href: "/sidhu/faqs/", label: "FAQs", icon: FolderOpen, permission: "faqs" },
  { href: "/sidhu/seo/", label: "SEO", icon: Search, permission: "seo" },
  { href: "/sidhu/media/", label: "Media", icon: ImageIcon, permission: "media" },
  { href: "/sidhu/redirects/", label: "Redirects", icon: Redo2, permission: "redirects" },
  { href: "/sidhu/settings/", label: "Site Settings", icon: Settings, permission: "site_settings" },
  { href: "/sidhu/messages/", label: "Messages", icon: Mail, permission: "messages" },
  { href: "/sidhu/users/", label: "Users", icon: Shield, permission: "users_security" },
];

function isActive(pathname: string, href: string) {
  if (href === "/sidhu/") return pathname === "/sidhu" || pathname === "/sidhu/";
  return pathname === href || pathname.startsWith(href);
}

export function AdminShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const session = useAdminSession();
  const items = NAV.filter((item) => session && hasPermission(session.role, session.permissions, item.permission));
  const accountActive = isActive(pathname, "/sidhu/account/");

  return (
    <div className="flex min-h-screen bg-[#f3f4f7] text-ink">
      <aside className="hidden w-64 shrink-0 flex-col bg-[#0c0e14] text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">Sidhu</p>
          <p className="mt-1 text-sm font-bold">THE FLIX CMS</p>
          <p className="mt-1 text-[11px] text-white/45">
            {session ? session.displayName || session.username : "Protected admin session"}
          </p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                  active ? "bg-brand text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs text-white/40">
          <Link
            href="/sidhu/account/"
            className={`flex items-center gap-2 ${accountActive ? "text-white" : "hover:text-white"}`}
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            My Account
          </Link>
          <Link href="/" className="mt-3 block hover:text-white">
            View website →
          </Link>
          <div className="mt-3">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:px-8">
          <div>
            <h1 className="text-lg font-bold">{title}</h1>
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Open menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open ? (
          <div className="border-b border-line bg-[#0c0e14] p-3 lg:hidden">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-white/80"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/sidhu/account/" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-white/80">
              My Account
            </Link>
            <div className="px-3 py-2">
              <LogoutButton />
            </div>
          </div>
        ) : null}
        <div className="flex-1 p-4 lg:p-8">{children}</div>
      </div>
    </div>
  );
}

export function ComingSoon({ moduleName }: { moduleName: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-8">
      <p className="text-sm font-semibold text-brand">Coming in the next local phase</p>
      <h2 className="mt-2 text-2xl font-bold">{moduleName}</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        This screen is intentionally empty. No fake data, editors, or placeholders that pretend
        the module works. Home page editing, media, and branding settings are available now.
      </p>
    </div>
  );
}
