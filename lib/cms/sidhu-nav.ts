import { hasPermission, type AdminRole, type Permission } from "@/lib/auth/permissions";

export type SidhuNavIcon =
  | "dashboard"
  | "pages"
  | "blog"
  | "media"
  | "seo"
  | "pricing"
  | "faqs"
  | "redirects"
  | "settings"
  | "messages"
  | "users";

export type SidhuNavItem = {
  href: string;
  label: string;
  icon: SidhuNavIcon;
  permission: Permission;
};

export type SidhuNavGroup = {
  id: string;
  label: string;
  items: SidhuNavItem[];
};

/** Canonical Sidhu sidebar destinations (permission-filtered at render time). */
export const SIDHU_NAV_GROUPS: SidhuNavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/sidhu/", label: "Dashboard", icon: "dashboard", permission: "dashboard" }],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { href: "/sidhu/pages/", label: "Pages", icon: "pages", permission: "pages" },
      { href: "/sidhu/blog/", label: "Blog", icon: "blog", permission: "blog" },
      { href: "/sidhu/media/", label: "Media", icon: "media", permission: "media" },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    items: [{ href: "/sidhu/seo/", label: "SEO", icon: "seo", permission: "seo" }],
  },
  {
    id: "site",
    label: "Site",
    items: [
      { href: "/sidhu/pricing/", label: "Pricing", icon: "pricing", permission: "pricing" },
      { href: "/sidhu/faqs/", label: "FAQs", icon: "faqs", permission: "faqs" },
      { href: "/sidhu/redirects/", label: "Redirects", icon: "redirects", permission: "redirects" },
      { href: "/sidhu/settings/", label: "Site Settings", icon: "settings", permission: "site_settings" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/sidhu/messages/", label: "Messages", icon: "messages", permission: "messages" },
      { href: "/sidhu/users/", label: "Users", icon: "users", permission: "users_security" },
    ],
  },
];

/** Flat list of every permission-gated destination (same set as pre–Phase 1 nav). */
export const SIDHU_NAV_ITEMS: SidhuNavItem[] = SIDHU_NAV_GROUPS.flatMap((group) => group.items);

export function isSidhuNavActive(pathname: string, href: string) {
  if (href === "/sidhu/") return pathname === "/sidhu" || pathname === "/sidhu/";
  return pathname === href || pathname.startsWith(href);
}

export function filterSidhuNavGroups(
  role: AdminRole,
  permissions: Permission[],
  groups: SidhuNavGroup[] = SIDHU_NAV_GROUPS,
): SidhuNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(role, permissions, item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

export function filterSidhuNavItems(role: AdminRole, permissions: Permission[]): SidhuNavItem[] {
  return SIDHU_NAV_ITEMS.filter((item) => hasPermission(role, permissions, item.permission));
}
