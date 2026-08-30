export const PERMISSIONS = [
  "dashboard",
  "pages",
  "blog",
  "faqs",
  "pricing",
  "seo",
  "redirects",
  "media",
  "messages",
  "site_settings",
  "users_security",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ADMIN_ROLES = ["super_admin", "full_access", "custom"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  dashboard: "Dashboard",
  pages: "Pages",
  blog: "Blog",
  faqs: "FAQs",
  pricing: "Pricing",
  seo: "SEO",
  redirects: "Redirects",
  media: "Media",
  messages: "Messages",
  site_settings: "Site Settings",
  users_security: "Users / Security",
};

export const MODULE_PERMISSIONS: Permission[] = PERMISSIONS.filter((item) => item !== "users_security");

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  full_access: "Full Access",
  custom: "Custom",
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is Permission => typeof item === "string" && isPermission(item)))];
}

export function permissionsForRole(role: AdminRole, custom: Permission[] = []): Permission[] {
  if (role === "super_admin") return [...PERMISSIONS];
  if (role === "full_access") return [...MODULE_PERMISSIONS];
  return parsePermissions(custom).filter((item) => item !== "users_security");
}

export function hasPermission(role: AdminRole, custom: Permission[], permission: Permission) {
  if (role === "super_admin") return true;
  return permissionsForRole(role, custom).includes(permission);
}

export function permissionForSidhuPath(pathname: string): Permission | null {
  const path = pathname.endsWith("/") && pathname !== "/" ? pathname : `${pathname}/`;
  if (path === "/sidhu/login/" || path.startsWith("/sidhu/account/") || path.startsWith("/sidhu/access-denied/")) {
    return null;
  }
  if (path.startsWith("/sidhu/users/") || path.startsWith("/sidhu/security/")) return "users_security";
  if (path.startsWith("/sidhu/pages/")) return "pages";
  if (path.startsWith("/sidhu/blog/")) return "blog";
  if (path.startsWith("/sidhu/faqs/")) return "faqs";
  if (path.startsWith("/sidhu/pricing/")) return "pricing";
  if (path.startsWith("/sidhu/seo/")) return "seo";
  if (path.startsWith("/sidhu/redirects/")) return "redirects";
  if (path.startsWith("/sidhu/media/")) return "media";
  if (path.startsWith("/sidhu/messages/")) return "messages";
  if (path.startsWith("/sidhu/settings/")) return "site_settings";
  if (path === "/sidhu/") return "dashboard";
  if (path.startsWith("/sidhu/")) return "dashboard";
  return null;
}

export function firstAllowedPath(role: AdminRole, custom: Permission[]) {
  const order: Array<[Permission, string]> = [
    ["dashboard", "/sidhu/"],
    ["pages", "/sidhu/pages/"],
    ["blog", "/sidhu/blog/"],
    ["pricing", "/sidhu/pricing/"],
    ["faqs", "/sidhu/faqs/"],
    ["seo", "/sidhu/seo/"],
    ["media", "/sidhu/media/"],
    ["redirects", "/sidhu/redirects/"],
    ["site_settings", "/sidhu/settings/"],
    ["messages", "/sidhu/messages/"],
    ["users_security", "/sidhu/users/"],
  ];
  for (const [permission, href] of order) {
    if (hasPermission(role, custom, permission)) return href;
  }
  return "/sidhu/account/";
}
