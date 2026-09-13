import { isSelfCanonicalValue } from "@/lib/cms/page-paths";
import { migratePublicBlogHref } from "@/lib/cms/blog-paths";
import { isSelfRedirect, withSlash } from "@/lib/cms/redirects";
import { nextCanonicalForSlugChange, remapSettingsHrefs } from "@/lib/cms/slug-change";
import type { RedirectRule, SiteSettings } from "@/lib/cms/types";

export const BLOG_INDEX_SLUG = "/blogs/";
export const BLOG_INDEX_SLUG_LEGACY = "/blog/";
export const BLOG_INDEX_REDIRECT_ID = "redir-blog-index";

export function remapSettingsForBlogIndex(settings: SiteSettings): { settings: SiteSettings; changed: boolean } {
  let next = remapSettingsHrefs(settings, BLOG_INDEX_SLUG_LEGACY, BLOG_INDEX_SLUG);
  next = {
    ...next,
    headerNav: next.headerNav.map((link) => ({ ...link, href: migratePublicBlogHref(link.href) })),
    footerQuickLinks: next.footerQuickLinks.map((link) => ({ ...link, href: migratePublicBlogHref(link.href) })),
    footerSupportLinks: next.footerSupportLinks.map((link) => ({ ...link, href: migratePublicBlogHref(link.href) })),
    footerLegalLinks: next.footerLegalLinks.map((link) => ({ ...link, href: migratePublicBlogHref(link.href) })),
    headerCtaHref: migratePublicBlogHref(next.headerCtaHref),
  };
  const seo = next.pageSeo.blog;
  if (seo && isSelfCanonicalValue(seo.canonicalUrl, BLOG_INDEX_SLUG_LEGACY)) {
    const canonicalUrl = nextCanonicalForSlugChange(seo.canonicalUrl, BLOG_INDEX_SLUG_LEGACY, BLOG_INDEX_SLUG);
    if (canonicalUrl !== seo.canonicalUrl) {
      next = {
        ...next,
        pageSeo: {
          ...next.pageSeo,
          blog: { ...seo, canonicalUrl },
        },
      };
    }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(settings);
  return { settings: next, changed };
}

function destPath(destination: string) {
  if (!destination.startsWith("/") || destination.startsWith("//")) return "";
  return withSlash(destination.split("?")[0] || "/");
}

export function applyBlogIndexRedirectUpsert(rules: RedirectRule[]): { rules: RedirectRule[]; changed: boolean } {
  const now = new Date().toISOString();
  let changed = false;
  const next = rules.map((rule) => {
    let updated = rule;
    const source = withSlash(rule.sourcePath);
    const dest = destPath(updated.destinationPath);

    if (updated.active && source === BLOG_INDEX_SLUG) {
      changed = true;
      updated = { ...updated, active: false, updatedAt: now };
    }
    if (dest === BLOG_INDEX_SLUG_LEGACY && source !== BLOG_INDEX_SLUG && source !== BLOG_INDEX_SLUG_LEGACY) {
      changed = true;
      updated = { ...updated, destinationPath: BLOG_INDEX_SLUG, updatedAt: now };
    }
    if (updated.active && source === BLOG_INDEX_SLUG && isSelfRedirect(updated.sourcePath, updated.destinationPath)) {
      changed = true;
      updated = { ...updated, active: false, updatedAt: now };
    }
    return updated;
  });

  const existing = next.find((rule) => withSlash(rule.sourcePath) === BLOG_INDEX_SLUG_LEGACY);
  if (existing) {
    if (
      existing.destinationPath !== BLOG_INDEX_SLUG ||
      existing.statusCode !== 301 ||
      !existing.active ||
      existing.sourcePath !== BLOG_INDEX_SLUG_LEGACY
    ) {
      const index = next.findIndex((rule) => rule.id === existing.id);
      next[index] = {
        ...existing,
        sourcePath: BLOG_INDEX_SLUG_LEGACY,
        destinationPath: BLOG_INDEX_SLUG,
        statusCode: 301,
        active: true,
        updatedAt: now,
      };
      changed = true;
    }
  } else {
    next.push({
      id: BLOG_INDEX_REDIRECT_ID,
      sourcePath: BLOG_INDEX_SLUG_LEGACY,
      destinationPath: BLOG_INDEX_SLUG,
      statusCode: 301,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    changed = true;
  }

  return { rules: next, changed };
}
