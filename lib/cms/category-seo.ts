import type { BlogCategory, MediaRef, PageSeo } from "@/lib/cms/types";
import { withSlash } from "@/lib/cms/redirects";

/** Public path for a category archive (trailing slash). */
export function categoryPublicPath(slug: string) {
  return withSlash(`/category/${slug}/`);
}

/** Tri-state: null = inherit current live default; true/false = explicit override. */
export function readTriStateFlag(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 0) return false;
    if (value === 1) return true;
    return null;
  }
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (!raw) return null;
    if (raw === "0" || raw === "false" || raw === "no") return false;
    if (raw === "1" || raw === "true" || raw === "yes") return true;
  }
  return null;
}

export function effectiveTriState(value: boolean | null, defaultValue = true) {
  return value == null ? defaultValue : value;
}

export function categoryEffectiveRobotsIndex(category: Pick<BlogCategory, "robotsIndex" | "active">) {
  if (!category.active) return false;
  return effectiveTriState(category.robotsIndex, true);
}

export function categoryEffectiveRobotsFollow(category: Pick<BlogCategory, "robotsFollow">) {
  return effectiveTriState(category.robotsFollow, true);
}

/** Sitemap: inactive always excluded; null sitemapInclude keeps pre-SEO inclusion for active categories. */
export function categoryEffectiveSitemapInclude(category: Pick<BlogCategory, "active" | "sitemapInclude">) {
  if (!category.active) return false;
  return effectiveTriState(category.sitemapInclude, true);
}

export function categoryEffectiveTitle(category: Pick<BlogCategory, "name" | "seoTitle">) {
  return category.seoTitle.trim() || category.name;
}

export function categoryEffectiveDescription(category: Pick<BlogCategory, "name" | "description" | "seoDescription">) {
  return category.seoDescription.trim() || category.description.trim() || `Posts in ${category.name}.`;
}

export function categorySeoAsPageSeo(category: BlogCategory): PageSeo {
  return {
    title: category.seoTitle,
    description: category.seoDescription,
    focusKeyword: category.focusKeyword,
    canonicalUrl: category.canonicalUrl,
    robotsIndex: categoryEffectiveRobotsIndex(category),
    robotsFollow: categoryEffectiveRobotsFollow(category),
    ogTitle: category.ogTitle,
    ogDescription: category.ogDescription,
    ogImage: category.ogImage,
    sitemapInclude: categoryEffectiveSitemapInclude(category),
    customJsonLd: "",
  };
}

export function emptyCategorySeoFields(): Pick<
  BlogCategory,
  | "seoTitle"
  | "seoDescription"
  | "focusKeyword"
  | "canonicalUrl"
  | "robotsIndex"
  | "robotsFollow"
  | "ogTitle"
  | "ogDescription"
  | "ogImage"
  | "sitemapInclude"
> {
  return {
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: null,
    robotsFollow: null,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: null,
  };
}

export type CategoryOgImage = MediaRef | null;
