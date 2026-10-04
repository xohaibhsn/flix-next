/**
 * Server-owned known historical / removed public surfaces for GSC-3.
 *
 * Evidence/classification metadata only — does not create redirects or pages.
 * Current CMS / active redirect state always wins over this registry.
 *
 * Verified against current source (2026-10): none of these paths are current
 * CMS public routes or active managed redirect sources.
 */

import { withSlash } from "@/lib/cms/redirects";

export type GscKnownHistoricalEntry = {
  path: string;
  key: string;
  reason: string;
};

/**
 * Affirmative project-side knowledge of removed/historical surfaces.
 * Arbitrary unmatched GSC URLs must NOT be inferred from this list.
 */
export const GSC_KNOWN_HISTORICAL_URLS: readonly GscKnownHistoricalEntry[] = [
  {
    path: "/how-to-fix-buffering-issues-on-iptv/",
    key: "hist-fix-buffering-iptv",
    reason: "Known removed historical article surface; not a current CMS public route.",
  },
  {
    path: "/become-an-iptv-reseller-in-uk/",
    key: "hist-become-iptv-reseller-uk",
    reason: "Known removed historical article surface; not a current CMS public route.",
  },
  {
    path: "/install-b1g-player-on-firestick/",
    key: "hist-install-b1g-player-firestick",
    reason: "Known removed historical article surface; not a current CMS public route.",
  },
  {
    path: "/downloads/",
    key: "hist-downloads",
    reason: "Known removed historical downloads surface; not a current CMS public route.",
  },
] as const;

export function gscKnownHistoricalPathSet(
  entries: readonly GscKnownHistoricalEntry[] = GSC_KNOWN_HISTORICAL_URLS,
): Map<string, GscKnownHistoricalEntry> {
  const map = new Map<string, GscKnownHistoricalEntry>();
  for (const entry of entries) {
    map.set(withSlash(entry.path), entry);
  }
  return map;
}
