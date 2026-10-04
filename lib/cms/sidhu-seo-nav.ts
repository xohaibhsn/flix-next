export type SidhuSeoNavItem = {
  id: "overview" | "issues" | "content" | "metadata" | "links" | "media" | "advanced";
  label: string;
  href: string;
};

/** Current-feature SEO subsections only — no empty future tabs. */
export const SIDHU_SEO_NAV: readonly SidhuSeoNavItem[] = [
  { id: "overview", label: "Overview", href: "/sidhu/seo/" },
  { id: "issues", label: "Issues", href: "/sidhu/seo/health/" },
  { id: "content", label: "Content", href: "/sidhu/seo/content/" },
  { id: "metadata", label: "Metadata", href: "/sidhu/seo/metadata-diagnostics/" },
  { id: "links", label: "Links", href: "/sidhu/seo/internal-links/" },
  { id: "media", label: "Media", href: "/sidhu/seo/image-diagnostics/" },
  { id: "advanced", label: "Advanced", href: "/sidhu/seo/advanced/" },
] as const;

function normalizeAdminPath(pathname: string) {
  if (!pathname) return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** Overview is exact-match only so nested SEO routes do not light Overview. */
export function isSeoNavActive(pathname: string, href: string) {
  const path = normalizeAdminPath(pathname);
  const target = normalizeAdminPath(href);
  if (target === "/sidhu/seo/") {
    return path === "/sidhu/seo/";
  }
  return path === target || path.startsWith(target);
}
