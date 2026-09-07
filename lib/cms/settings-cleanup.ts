import { rewriteBrandDisplay } from "@/lib/cms/brand";
import { rewriteDemoCopy } from "@/lib/cms/public-copy-cleanup";
import type { PageSeo, SiteSettings } from "@/lib/cms/types";

export const KNOWN_TEST_TAGLINE = "Your Entertainment Testt";
export const PROFESSIONAL_TAGLINE = "Premium UK Streaming Experience";

export function withKnownTestTaglineReplaced(settings: SiteSettings): { settings: SiteSettings; changed: boolean } {
  if (settings.tagline.trim() === KNOWN_TEST_TAGLINE) {
    return { settings: { ...settings, tagline: PROFESSIONAL_TAGLINE }, changed: true };
  }
  return { settings, changed: false };
}

function rewritePageSeo(seo: PageSeo): { seo: PageSeo; changed: boolean } {
  const title = rewriteBrandDisplay(rewriteDemoCopy(seo.title));
  const description = rewriteBrandDisplay(rewriteDemoCopy(seo.description));
  const ogTitle = rewriteBrandDisplay(rewriteDemoCopy(seo.ogTitle));
  const ogDescription = rewriteBrandDisplay(rewriteDemoCopy(seo.ogDescription));
  const changed =
    title !== seo.title ||
    description !== seo.description ||
    ogTitle !== seo.ogTitle ||
    ogDescription !== seo.ogDescription;
  if (!changed) return { seo, changed: false };
  return { seo: { ...seo, title, description, ogTitle, ogDescription }, changed: true };
}

export function applyPublicCopyCleanupToSettings(settings: SiteSettings): { settings: SiteSettings; changed: boolean } {
  const tagged = withKnownTestTaglineReplaced(settings);
  let next = tagged.settings;
  let changed = tagged.changed;

  const siteName = rewriteBrandDisplay(next.siteName);
  const logoAlt = rewriteBrandDisplay(next.branding.logoAlt);
  const whatsappMessage = rewriteBrandDisplay(next.whatsappMessage);
  const footerCopyright = rewriteBrandDisplay(next.footerCopyright);
  if (
    siteName !== next.siteName ||
    logoAlt !== next.branding.logoAlt ||
    whatsappMessage !== next.whatsappMessage ||
    footerCopyright !== next.footerCopyright
  ) {
    next = {
      ...next,
      siteName,
      whatsappMessage,
      footerCopyright,
      branding: { ...next.branding, logoAlt },
    };
    changed = true;
  }

  const footerIntro = rewriteBrandDisplay(rewriteDemoCopy(next.footerIntro));
  const hours = rewriteDemoCopy(next.hours);
  const location = rewriteDemoCopy(next.location);
  if (footerIntro !== next.footerIntro || hours !== next.hours || location !== next.location) {
    next = { ...next, footerIntro, hours, location };
    changed = true;
  }

  const pageSeo = { ...next.pageSeo };
  for (const key of ["home", "subscriptions", "contact", "blog"] as const) {
    const result = rewritePageSeo(pageSeo[key]);
    if (!result.changed) continue;
    pageSeo[key] = result.seo;
    changed = true;
  }

  if (changed) next = { ...next, pageSeo };
  return { settings: next, changed };
}
