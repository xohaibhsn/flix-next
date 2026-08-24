const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;

function clip(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").slice(0, max).trim();
}

function withSlash(path: string) {
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

export function sanitizeRedirectDestination(value: unknown) {
  const raw = clip(value);
  if (!raw || isDangerousUrl(raw)) return "/";

  if (raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") return "/";
      return url.toString();
    } catch {
      return "/";
    }
  }

  if (raw.startsWith("http://localhost") || raw.startsWith("http://127.0.0.1")) {
    try {
      return new URL(raw).toString();
    } catch {
      return "/";
    }
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const path = raw.replace(/\/{2,}/g, "/");
    return path || "/";
  }

  return "/";
}

export function isReservedRedirectSource(sourcePath: string) {
  const source = withSlash(sourcePath);
  return source === "/" || source === "/welcome/";
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

export function resolveSafeRedirectUrl(destination: string, requestUrl: string) {
  if (!destination || isDangerousUrl(destination)) return null;
  try {
    const url = new URL(destination, requestUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const source = withSlash(new URL(requestUrl).pathname);
    if (url.origin === new URL(requestUrl).origin && withSlash(url.pathname) === source) return null;
    return url;
  } catch {
    return null;
  }
}
