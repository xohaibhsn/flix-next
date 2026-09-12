import { createId } from "@/lib/cms/ids";
import {
  isSelfCanonicalValue,
  remapNavHref,
  seoKeyForPageId,
} from "@/lib/cms/page-paths";
import { withSlash } from "@/lib/cms/redirects";
import { ClientError } from "@/lib/security/errors";
import { absoluteUrl } from "@/lib/site-url";
import type { CmsPage, NavLink, RedirectRule, SiteSettings } from "@/lib/cms/types";

type SlugChangeCms = {
  listRedirects(): Promise<RedirectRule[]>;
  saveRedirect(rule: RedirectRule): Promise<RedirectRule>;
  getSettings(): Promise<SiteSettings>;
  saveSettings(settings: SiteSettings): Promise<SiteSettings>;
};

function samePath(left: string, right: string) {
  return withSlash((left || "/").split("?")[0] || "/") === withSlash((right || "/").split("?")[0] || "/");
}

function mapNav(list: NavLink[], from: string, to: string) {
  return list.map((link) => ({ ...link, href: remapNavHref(link.href, from, to) }));
}

export function remapSettingsHrefs(settings: SiteSettings, from: string, to: string): SiteSettings {
  return {
    ...settings,
    headerNav: mapNav(settings.headerNav, from, to),
    footerQuickLinks: mapNav(settings.footerQuickLinks, from, to),
    footerSupportLinks: mapNav(settings.footerSupportLinks, from, to),
    footerLegalLinks: mapNav(settings.footerLegalLinks, from, to),
    headerCtaHref: remapNavHref(settings.headerCtaHref, from, to),
  };
}

export function nextCanonicalForSlugChange(previous: string, oldSlug: string, newSlug: string) {
  if (!isSelfCanonicalValue(previous, oldSlug)) return previous;
  const trimmed = previous.trim();
  if (/^https?:\/\//i.test(trimmed)) return absoluteUrl(newSlug);
  return newSlug;
}

async function upsertSlugRedirect(cms: SlugChangeCms, oldSlug: string, newSlug: string) {
  const rules = await cms.listRedirects();
  const existing = rules.find((rule) => samePath(rule.sourcePath, oldSlug));
  const now = new Date().toISOString();
  const next: RedirectRule = existing
    ? {
        ...existing,
        sourcePath: withSlash(oldSlug),
        destinationPath: withSlash(newSlug),
        statusCode: 301,
        active: true,
        updatedAt: now,
      }
    : {
        id: createId("redir"),
        sourcePath: withSlash(oldSlug),
        destinationPath: withSlash(newSlug),
        statusCode: 301,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
  if (samePath(next.sourcePath, next.destinationPath)) return;
  await cms.saveRedirect(next);
}

async function retargetRedirects(cms: SlugChangeCms, oldSlug: string, newSlug: string) {
  const rules = await cms.listRedirects();
  for (const rule of rules) {
    if (!rule.destinationPath.startsWith("/") || rule.destinationPath.startsWith("//")) continue;
    if (!samePath(rule.destinationPath, oldSlug)) continue;
    if (samePath(rule.sourcePath, newSlug) || samePath(rule.sourcePath, oldSlug)) continue;
    const destinationPath = withSlash(newSlug);
    if (samePath(rule.sourcePath, destinationPath)) continue;
    await cms.saveRedirect({
      ...rule,
      destinationPath,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function disableRedirectsFromNewSlug(cms: SlugChangeCms, newSlug: string) {
  const rules = await cms.listRedirects();
  for (const rule of rules) {
    if (!rule.active || !samePath(rule.sourcePath, newSlug)) continue;
    await cms.saveRedirect({
      ...rule,
      active: false,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function applyPageSlugChange(cms: SlugChangeCms, previous: CmsPage, next: CmsPage) {
  const oldSlug = withSlash(previous.slug);
  const newSlug = withSlash(next.slug);
  if (oldSlug === newSlug) return;

  await disableRedirectsFromNewSlug(cms, newSlug);
  await upsertSlugRedirect(cms, oldSlug, newSlug);
  await retargetRedirects(cms, oldSlug, newSlug);

  const settings = await cms.getSettings();
  let updated = remapSettingsHrefs(settings, oldSlug, newSlug);
  const seoKey = seoKeyForPageId(next.id);
  if (seoKey) {
    const seo = updated.pageSeo[seoKey];
    const canonicalUrl = nextCanonicalForSlugChange(seo.canonicalUrl, oldSlug, newSlug);
    if (canonicalUrl !== seo.canonicalUrl) {
      updated = {
        ...updated,
        pageSeo: {
          ...updated.pageSeo,
          [seoKey]: { ...seo, canonicalUrl },
        },
      };
    }
  }
  await cms.saveSettings(updated);
}

export function mysqlDuplicateError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const errno = "errno" in error ? Number(error.errno) : 0;
  return code === "ER_DUP_ENTRY" || errno === 1062;
}

export function duplicateSlugError() {
  return new ClientError("Another page already uses that URL.");
}
