import {
  SUBSCRIPTION_PAGE_ID,
  SUBSCRIPTION_SLUG,
  SUBSCRIPTION_SLUG_LEGACY,
  isSelfCanonicalValue,
  remapLegacySubscriptionHref,
  remapStructuredHrefs,
  seoKeyForPageId,
} from "@/lib/cms/page-paths";
import { isSelfRedirect, withSlash } from "@/lib/cms/redirects";
import { nextCanonicalForSlugChange, remapSettingsHrefs } from "@/lib/cms/slug-change";
import type { CmsPage, RedirectRule, SiteSettings } from "@/lib/cms/types";

export function migrateSubscriptionPageRecord(page: CmsPage): { page: CmsPage; changed: boolean } {
  if (page.id !== SUBSCRIPTION_PAGE_ID) return { page, changed: false };
  if (withSlash(page.slug) === SUBSCRIPTION_SLUG) return { page, changed: false };
  if (withSlash(page.slug) !== SUBSCRIPTION_SLUG_LEGACY) return { page, changed: false };
  return { page: { ...page, slug: SUBSCRIPTION_SLUG }, changed: true };
}

export function remapSettingsForSubscriptionUrl(settings: SiteSettings): { settings: SiteSettings; changed: boolean } {
  let next = remapSettingsHrefs(settings, SUBSCRIPTION_SLUG_LEGACY, SUBSCRIPTION_SLUG);
  const key = seoKeyForPageId(SUBSCRIPTION_PAGE_ID);
  if (key) {
    const seo = next.pageSeo[key];
    if (isSelfCanonicalValue(seo.canonicalUrl, SUBSCRIPTION_SLUG_LEGACY)) {
      const canonicalUrl = nextCanonicalForSlugChange(seo.canonicalUrl, SUBSCRIPTION_SLUG_LEGACY, SUBSCRIPTION_SLUG);
      if (canonicalUrl !== seo.canonicalUrl) {
        next = {
          ...next,
          pageSeo: {
            ...next.pageSeo,
            [key]: { ...seo, canonicalUrl },
          },
        };
      }
    }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(settings);
  return { settings: next, changed };
}

export function applySubscriptionRedirectMigration(rules: RedirectRule[]): { rules: RedirectRule[]; changed: boolean } {
  const now = new Date().toISOString();
  let changed = false;
  const next = rules.map((rule) => {
    let updated = rule;
    const source = withSlash(rule.sourcePath);
    if (rule.active && source === "/blogs/" && isSelfRedirect(rule.sourcePath, rule.destinationPath)) {
      changed = true;
      updated = { ...updated, active: false, updatedAt: now };
    }
    if (
      updated.destinationPath.startsWith("/") &&
      !updated.destinationPath.startsWith("//") &&
      withSlash(updated.destinationPath.split("?")[0] || "/") === SUBSCRIPTION_SLUG_LEGACY &&
      source !== SUBSCRIPTION_SLUG &&
      source !== SUBSCRIPTION_SLUG_LEGACY
    ) {
      changed = true;
      updated = { ...updated, destinationPath: SUBSCRIPTION_SLUG, updatedAt: now };
    }
    if (updated.active && source === SUBSCRIPTION_SLUG) {
      changed = true;
      updated = { ...updated, active: false, updatedAt: now };
    }
    return updated;
  });

  const existing = next.find((rule) => withSlash(rule.sourcePath) === SUBSCRIPTION_SLUG_LEGACY);
  if (existing) {
    if (
      existing.destinationPath !== SUBSCRIPTION_SLUG ||
      existing.statusCode !== 301 ||
      !existing.active ||
      existing.sourcePath !== SUBSCRIPTION_SLUG_LEGACY
    ) {
      const index = next.findIndex((rule) => rule.id === existing.id);
      next[index] = {
        ...existing,
        sourcePath: SUBSCRIPTION_SLUG_LEGACY,
        destinationPath: SUBSCRIPTION_SLUG,
        statusCode: 301,
        active: true,
        updatedAt: now,
      };
      changed = true;
    }
  } else {
    next.push({
      id: "redir-slug-page-subscriptions",
      sourcePath: SUBSCRIPTION_SLUG_LEGACY,
      destinationPath: SUBSCRIPTION_SLUG,
      statusCode: 301,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    changed = true;
  }

  return { rules: next, changed };
}

export function remapPageStructuredHrefs(page: CmsPage): { page: CmsPage; changed: boolean } {
  const sections = page.sections.map((section) => {
    const data = remapStructuredHrefs(section.data);
    return JSON.stringify(data) === JSON.stringify(section.data)
      ? section
      : { ...section, data: data as CmsPage["sections"][number]["data"] };
  });
  const changed = sections.some((section, index) => section !== page.sections[index]);
  if (!changed) return { page, changed: false };
  return { page: { ...page, sections }, changed: true };
}

export function remapAnyLegacySubscriptionHref(href: string) {
  return remapLegacySubscriptionHref(href);
}
