/**
 * Pure GSC page URL normalization for matching (GSC-3).
 * Preserves the original Google row URL separately. No network I/O.
 */

import { withSlash } from "@/lib/cms/redirects";
import { APEX_ORIGIN, PRODUCTION_WWW_HOST, normalizeHostname } from "@/lib/www-host-canonical";

export const GSC_SITE_APEX_HOST = "theflixiptv.com";
export const GSC_SITE_APEX_ORIGIN = APEX_ORIGIN;

export type GscNormalizedUrl = {
  /** Exact original input from the Google row (or test fixture). */
  rawUrl: string;
  /** True when the input could not be parsed into a usable site path. */
  malformed: boolean;
  /** True when the URL is absolute and points at a non-site host. */
  foreignHost: boolean;
  /** Always https://theflixiptv.com when same-site; null if unusable. */
  normalizedOrigin: string | null;
  /** Trailing-slash path used for matching; null if unusable. */
  normalizedPath: string | null;
  /** Absolute https apex matching key; null if unusable. */
  matchingKey: string | null;
};

function isSiteHost(hostname: string) {
  const host = normalizeHostname(hostname);
  return host === GSC_SITE_APEX_HOST || host === PRODUCTION_WWW_HOST;
}

/**
 * Normalize a GSC page URL for deterministic matching.
 *
 * - strips query + hash from the matching key
 * - www → apex
 * - http → https for the production host
 * - trailing slash via project `withSlash`
 * - does NOT lowercase path segments
 * - preserves `rawUrl` unchanged
 */
export function normalizeGscPageUrl(rawUrl: string): GscNormalizedUrl {
  const raw = String(rawUrl ?? "");
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      rawUrl: raw,
      malformed: true,
      foreignHost: false,
      normalizedOrigin: null,
      normalizedPath: null,
      matchingKey: null,
    };
  }

  // Path-only inputs (common in fixtures) — treat as same-site.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    const pathOnly = trimmed.split("?")[0]?.split("#")[0] || "/";
    const normalizedPath = withSlash(pathOnly.replace(/\/{2,}/g, "/") || "/");
    return {
      rawUrl: raw,
      malformed: false,
      foreignHost: false,
      normalizedOrigin: GSC_SITE_APEX_ORIGIN,
      normalizedPath,
      matchingKey: `${GSC_SITE_APEX_ORIGIN}${normalizedPath === "/" ? "/" : normalizedPath}`,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        rawUrl: raw,
        malformed: true,
        foreignHost: false,
        normalizedOrigin: null,
        normalizedPath: null,
        matchingKey: null,
      };
    }

    if (!isSiteHost(url.hostname)) {
      return {
        rawUrl: raw,
        malformed: false,
        foreignHost: true,
        normalizedOrigin: null,
        normalizedPath: null,
        matchingKey: null,
      };
    }

    const normalizedPath = withSlash(url.pathname.replace(/\/{2,}/g, "/") || "/");
    return {
      rawUrl: raw,
      malformed: false,
      foreignHost: false,
      normalizedOrigin: GSC_SITE_APEX_ORIGIN,
      normalizedPath,
      matchingKey: `${GSC_SITE_APEX_ORIGIN}${normalizedPath === "/" ? "/" : normalizedPath}`,
    };
  } catch {
    return {
      rawUrl: raw,
      malformed: true,
      foreignHost: false,
      normalizedOrigin: null,
      normalizedPath: null,
      matchingKey: null,
    };
  }
}
