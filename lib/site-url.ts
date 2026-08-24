import { siteConfig } from "@/lib/site-config";

export function getSiteOrigin() {
  if (process.env.NODE_ENV === "production") {
    return "https://theflixiptv.com";
  }
  return siteConfig.url.replace(/\/$/, "");
}

export function absoluteUrl(path: string) {
  const origin = getSiteOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export function publicPagePath(slug: string) {
  if (slug === "/") return "/welcome/";
  return slug.endsWith("/") ? slug : `${slug}/`;
}

export function publicPageUrl(slug: string) {
  return absoluteUrl(publicPagePath(slug));
}
