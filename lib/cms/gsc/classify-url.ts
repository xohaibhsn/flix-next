/**
 * Deterministic GSC page URL classifier (GSC-3).
 *
 * Precedence (incoming normalized path):
 * 1. CURRENT_CMS
 * 2. CURRENT_PUBLIC_NON_CMS
 * 3. built-in legacy redirect source OR active CMS redirect source → REDIRECTED_HISTORICAL
 * 4. known removed/historical registry → REMOVED_OR_404
 * 5. UNKNOWN
 *
 * Foreign / malformed inputs → UNKNOWN (never REMOVED_OR_404).
 * No network HEAD/GET. No Google/OpenAI.
 */

import { builtInRedirectDestination } from "@/lib/cms/internal-links";
import type { GscUrlClassification } from "@/lib/cms/gsc/url-classes";
import { normalizeGscPageUrl } from "@/lib/cms/gsc/url-normalize";
import type { GscSiteUrlIndex } from "@/lib/cms/gsc/site-url-index";
import { withSlash } from "@/lib/cms/redirects";

function classifyNormalizedPath(
  rawUrl: string,
  normalizedPath: string,
  matchingKey: string,
  index: GscSiteUrlIndex,
): GscUrlClassification {
  const path = withSlash(normalizedPath);

  const cms = index.currentCmsByPath.get(path);
  if (cms) {
    return {
      rawUrl,
      normalizedUrl: matchingKey,
      normalizedPath: path,
      classification: "CURRENT_CMS",
      matchedCurrentUrl: cms.path,
      sourceKind: cms.kind,
      reason: `Current published ${cms.kind} public URL.`,
    };
  }

  const pub = index.currentPublicNonCmsByPath.get(path);
  if (pub) {
    return {
      rawUrl,
      normalizedUrl: matchingKey,
      normalizedPath: path,
      classification: "CURRENT_PUBLIC_NON_CMS",
      matchedCurrentUrl: pub.path,
      sourceKind: "public_route",
      reason: `Current generated public route (${pub.label}).`,
    };
  }

  const builtInDest = builtInRedirectDestination(path);
  if (builtInDest && withSlash(builtInDest) !== path) {
    return {
      rawUrl,
      normalizedUrl: matchingKey,
      normalizedPath: path,
      classification: "REDIRECTED_HISTORICAL",
      redirectDestination: withSlash(builtInDest),
      sourceKind: "built_in_redirect",
      reason: "Built-in legacy/public redirect source.",
    };
  }

  const active = index.activeRedirectsBySource.get(path);
  if (active) {
    return {
      rawUrl,
      normalizedUrl: matchingKey,
      normalizedPath: path,
      classification: "REDIRECTED_HISTORICAL",
      redirectDestination: active.destinationPath,
      redirectStatusCode: active.statusCode,
      sourceKind: "cms_redirect",
      reason: "Active CMS redirect source.",
    };
  }

  const historical = index.knownHistoricalByPath.get(path);
  if (historical) {
    return {
      rawUrl,
      normalizedUrl: matchingKey,
      normalizedPath: path,
      classification: "REMOVED_OR_404",
      historicalKey: historical.key,
      sourceKind: "known_removed",
      reason: historical.reason,
    };
  }

  return {
    rawUrl,
    normalizedUrl: matchingKey,
    normalizedPath: path,
    classification: "UNKNOWN",
    sourceKind: "unmatched",
    reason:
      "Not present in this bounded site index as current, redirected, or known-removed. UNKNOWN is not a 404 claim.",
  };
}

/**
 * Classify one GSC page URL against a prebuilt site index.
 */
export function classifyGscPageUrl(
  rawUrl: string,
  index: GscSiteUrlIndex,
): GscUrlClassification {
  const normalized = normalizeGscPageUrl(rawUrl);

  if (normalized.malformed) {
    return {
      rawUrl: normalized.rawUrl,
      normalizedUrl: null,
      normalizedPath: null,
      classification: "UNKNOWN",
      sourceKind: "malformed",
      reason: "Malformed URL; cannot classify against the site index.",
    };
  }

  if (normalized.foreignHost) {
    return {
      rawUrl: normalized.rawUrl,
      normalizedUrl: null,
      normalizedPath: null,
      classification: "UNKNOWN",
      sourceKind: "foreign_host",
      reason: "URL host is outside theflixiptv.com / www.theflixiptv.com.",
    };
  }

  if (!normalized.normalizedPath || !normalized.matchingKey) {
    return {
      rawUrl: normalized.rawUrl,
      normalizedUrl: null,
      normalizedPath: null,
      classification: "UNKNOWN",
      sourceKind: "malformed",
      reason: "URL could not be normalized to a matching key.",
    };
  }

  return classifyNormalizedPath(
    normalized.rawUrl,
    normalized.normalizedPath,
    normalized.matchingKey,
    index,
  );
}

/**
 * Classify many GSC page URLs in memory against one prebuilt index.
 * Does not reload CMS/redirect data per URL.
 */
export function classifyGscPageUrls(
  rawUrls: readonly string[],
  index: GscSiteUrlIndex,
): GscUrlClassification[] {
  return rawUrls.map((rawUrl) => classifyGscPageUrl(rawUrl, index));
}
