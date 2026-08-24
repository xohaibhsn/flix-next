import { normalizePath } from "@/lib/cms/contact";
import type { RedirectRule } from "@/lib/cms/types";

const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;

function clip(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").slice(0, max).trim();
}

export function withSlash(path: string) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

export function isDangerousUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return true;
  if (trimmed.includes("\\")) return true;
  return DANGEROUS_SCHEME.test(trimmed);
}

export function isProtectedCmsPath(path: string) {
  const source = withSlash(path);
  return source === "/sidhu/" || source.startsWith("/sidhu/") || source === "/api/" || source.startsWith("/api/");
}

export function isReservedRedirectSource(sourcePath: string) {
  return isProtectedCmsPath(sourcePath);
}

export function normalizeRedirectSource(value: unknown) {
  const path = normalizePath(clip(value, 200));
  if (!path) return "";
  return withSlash(path);
}

export function sanitizeRedirectDestination(value: unknown) {
  const raw = clip(value);
  if (!raw || isDangerousUrl(raw)) return "/";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "/";
      if (url.username || url.password) return "/";
      return url.toString();
    } catch {
      return "/";
    }
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const path = withSlash(raw.replace(/\/{2,}/g, "/") || "/");
    if (isProtectedCmsPath(path)) return "/";
    return path;
  }

  return "/";
}

export function isSelfRedirect(sourcePath: string, destination: string, origin?: string) {
  const source = withSlash(sourcePath);
  if (!destination || isDangerousUrl(destination)) return true;
  if (destination.startsWith("/")) {
    return withSlash(destination.split("?")[0] || "/") === source;
  }
  try {
    const url = new URL(destination, origin || "https://theflixiptv.com");
    if (origin) {
      const from = new URL(origin);
      if (url.origin === from.origin && withSlash(url.pathname) === source) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function wouldCreateRedirectLoop(
  candidate: Pick<RedirectRule, "id" | "sourcePath" | "destinationPath" | "active">,
  existing: Array<Pick<RedirectRule, "id" | "sourcePath" | "destinationPath" | "active">>,
) {
  if (!candidate.active) return false;
  const map = new Map<string, string>();
  for (const rule of existing) {
    if (!rule.active || rule.id === candidate.id) continue;
    map.set(withSlash(rule.sourcePath), rule.destinationPath);
  }
  map.set(withSlash(candidate.sourcePath), candidate.destinationPath);

  let current = withSlash(candidate.sourcePath);
  const seen = new Set<string>();
  for (let i = 0; i < 12; i += 1) {
    if (seen.has(current)) return true;
    seen.add(current);
    const next = map.get(current);
    if (!next) return false;
    if (/^https?:\/\//i.test(next)) return false;
    current = withSlash(next.split("?")[0] || "/");
  }
  return true;
}

export function resolveSafeRedirectUrl(destination: string, requestUrl: string) {
  if (!destination || isDangerousUrl(destination) || isProtectedCmsPath(destination)) return null;
  try {
    const url = new URL(destination, requestUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (isProtectedCmsPath(url.pathname)) return null;
    const source = withSlash(new URL(requestUrl).pathname);
    if (url.origin === new URL(requestUrl).origin && withSlash(url.pathname) === source) return null;
    return url;
  } catch {
    return null;
  }
}
