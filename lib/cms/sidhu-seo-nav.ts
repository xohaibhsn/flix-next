import { isModuleSubNavItemActive, type ModuleSubNavItem } from "@/lib/cms/module-subnav";

export type SidhuSeoNavItem = ModuleSubNavItem & {
  id:
    | "overview"
    | "issues"
    | "opportunities"
    | "planning"
    | "content"
    | "metadata"
    | "links"
    | "media"
    | "advanced";
};

/** Current-feature SEO subsections only — no empty future tabs. Serializable data only. */
export const SIDHU_SEO_NAV: readonly SidhuSeoNavItem[] = [
  { id: "overview", label: "Overview", href: "/sidhu/seo/", exact: true },
  { id: "issues", label: "Issues", href: "/sidhu/seo/health/" },
  { id: "opportunities", label: "Opportunities", href: "/sidhu/seo/opportunities/" },
  { id: "planning", label: "Planning", href: "/sidhu/seo/planning/" },
  { id: "content", label: "Content", href: "/sidhu/seo/content/" },
  { id: "metadata", label: "Metadata", href: "/sidhu/seo/metadata-diagnostics/" },
  { id: "links", label: "Links", href: "/sidhu/seo/internal-links/" },
  { id: "media", label: "Media", href: "/sidhu/seo/image-diagnostics/" },
  { id: "advanced", label: "Advanced", href: "/sidhu/seo/advanced/" },
] as const;

/** Convenience wrapper for href-based checks in existing tests. */
export function isSeoNavActive(pathname: string, href: string) {
  const item = SIDHU_SEO_NAV.find(
    (entry) => entry.href === href || entry.href === (href.endsWith("/") ? href : `${href}/`),
  );
  if (item) return isModuleSubNavItemActive(pathname, item);
  return isModuleSubNavItemActive(pathname, {
    href,
    exact: href === "/sidhu/seo/" || href === "/sidhu/seo",
  });
}
