import type { SiteSettings } from "@/lib/cms/types";

export const KNOWN_TEST_TAGLINE = "Your Entertainment Testt";
export const PROFESSIONAL_TAGLINE = "Premium UK Streaming Experience";

export function withKnownTestTaglineReplaced(settings: SiteSettings): { settings: SiteSettings; changed: boolean } {
  if (settings.tagline.trim() === KNOWN_TEST_TAGLINE) {
    return { settings: { ...settings, tagline: PROFESSIONAL_TAGLINE }, changed: true };
  }
  return { settings, changed: false };
}
