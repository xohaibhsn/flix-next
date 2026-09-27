/** Production apex used for host canonicalization only. Destination is never user-controlled. */
export const APEX_ORIGIN = "https://theflixiptv.com";

/** Only this production www hostname is redirected. */
export const PRODUCTION_WWW_HOST = "www.theflixiptv.com";

/**
 * Normalize a Host / hostname value for comparison.
 * Strips an optional port and lowercases (e.g. WWW.TheFlixIPTV.com:443).
 */
export function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) return "";
  const colon = trimmed.indexOf(":");
  if (colon === -1) return trimmed;
  // IPv6 literals are bracketed; production www is never IPv6 — strip simple host:port only.
  if (trimmed.startsWith("[")) return trimmed;
  return trimmed.slice(0, colon);
}

export function isProductionWwwHost(hostname: string): boolean {
  return normalizeHostname(hostname) === PRODUCTION_WWW_HOST;
}

/**
 * Build the apex URL for a www request. Returns null when the host is not production www.
 * Pathname and query are preserved; destination host is always the fixed apex.
 */
export function wwwToApexRedirectUrl(input: {
  hostname: string;
  pathname: string;
  search?: string;
}): string | null {
  if (!isProductionWwwHost(input.hostname)) return null;
  const pathname = input.pathname || "/";
  const search = input.search ?? "";
  return `${APEX_ORIGIN}${pathname}${search}`;
}
