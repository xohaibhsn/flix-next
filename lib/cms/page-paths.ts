import { withSlash } from "@/lib/cms/redirects";
import { blogPostPath, blogPostPathLegacy } from "@/lib/cms/blog-paths";
import type { BlogCategory, BlogPost, CmsPage } from "@/lib/cms/types";
import type { PageSeoKey } from "@/lib/cms/page-seo";

export const SUBSCRIPTION_PAGE_ID = "page-subscriptions";
export const SUBSCRIPTION_SLUG = "/iptv-subscription-uk/";
export const SUBSCRIPTION_SLUG_LEGACY = "/iptv-subscriptions-uk/";

export const LOCKED_PAGE_IDS = new Set(["page-home", "page-contact"]);

const PAGE_SEO_BY_ID: Record<string, PageSeoKey> = {
  "page-home": "home",
  [SUBSCRIPTION_PAGE_ID]: "subscriptions",
  "page-contact": "contact",
  "page-about": "about",
  "page-terms": "terms",
  "page-refund": "refund",
  "page-privacy": "privacy",
  "page-cookie": "cookie",
  "page-copyright": "copyright",
};

const EDITOR_HREF_BY_ID: Record<string, string> = {
  "page-home": "/sidhu/pages/home/",
  [SUBSCRIPTION_PAGE_ID]: "/sidhu/pages/subscriptions/",
  "page-contact": "/sidhu/pages/contact/",
  "page-about": "/sidhu/pages/about-us/",
  "page-terms": "/sidhu/pages/terms-and-conditions/",
  "page-refund": "/sidhu/pages/refund-policy/",
  "page-privacy": "/sidhu/pages/privacy-policy/",
  "page-cookie": "/sidhu/pages/cookie-policy/",
  "page-copyright": "/sidhu/pages/copyright-policy/",
};

export function seoKeyForPageId(id: string): PageSeoKey | null {
  return PAGE_SEO_BY_ID[id] ?? null;
}

export function editorHrefForPageId(id: string) {
  return EDITOR_HREF_BY_ID[id] ?? null;
}

export function isPageSlugEditable(pageId: string) {
  return !LOCKED_PAGE_IDS.has(pageId);
}

export function pathsForSlug(slug: string) {
  const path = withSlash(slug);
  if (path === "/") return ["/", "/welcome", "/welcome/"];
  return [path.replace(/\/$/, "") || "/", path];
}

export function normalizePageSlug(value: unknown): { ok: true; slug: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "Enter a page URL starting with /." };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Enter a page URL starting with /." };
  if (/\s/.test(trimmed)) return { ok: false, error: "Page URL cannot contain spaces." };
  if (trimmed.includes("?") || trimmed.includes("#")) {
    return { ok: false, error: "Page URL cannot include a query string or hash." };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return { ok: false, error: "Use an internal path such as /iptv-subscription-uk/, not a full URL." };
  }
  if (!trimmed.startsWith("/")) return { ok: false, error: "Page URL must start with /." };
  if (trimmed.includes("\\")) return { ok: false, error: "Page URL cannot contain backslashes." };

  const lower = trimmed.toLowerCase().replace(/\/{2,}/g, "/");
  if (!/^\/[a-z0-9/_-]*$/.test(lower)) {
    return { ok: false, error: "Page URL can only use letters, numbers, hyphens, and slashes." };
  }

  const slug = withSlash(lower);
  if (slug !== "/" && !/^\/[a-z0-9][a-z0-9/_-]*\/$/.test(slug)) {
    return { ok: false, error: "Enter a clean path such as /iptv-subscription-uk/." };
  }
  return { ok: true, slug };
}

export function isReservedPageSlug(slug: string) {
  const path = withSlash(slug);
  if (path === "/sidhu/" || path.startsWith("/sidhu/")) return true;
  if (path === "/api/" || path.startsWith("/api/")) return true;
  if (path === "/blog/" || path.startsWith("/blog/")) return true;
  if (path === "/blogs/" || path.startsWith("/blogs/")) return true;
  if (path === "/category/" || path.startsWith("/category/")) return true;
  if (path === "/welcome/" || path === "/welcome") return true;
  if (path === "/_next/" || path.startsWith("/_next/")) return true;
  if (path === "/icon/" || path === "/icon") return true;
  if (path === "/favicon.ico/" || path === "/favicon.ico") return true;
  if (path === "/robots.txt/" || path === "/robots.txt") return true;
  if (path === "/sitemap.xml/" || path === "/sitemap.xml") return true;
  return false;
}

export function lockedSlugForPageId(pageId: string) {
  if (pageId === "page-home") return "/";
  if (pageId === "page-contact") return "/contact/";
  return null;
}

export function validateCmsPageSlug(
  value: unknown,
  page: Pick<CmsPage, "id" | "slug">,
  pages: Array<Pick<CmsPage, "id" | "slug">>,
  posts: Array<Pick<BlogPost, "slug">> = [],
  categories: Array<Pick<BlogCategory, "slug">> = [],
): { ok: true; slug: string } | { ok: false; error: string } {
  const locked = lockedSlugForPageId(page.id);
  const parsed = normalizePageSlug(value);
  if (!parsed.ok) return parsed;
  const slug = parsed.slug;

  if (locked && slug !== locked) {
    return { ok: false, error: `This page URL is fixed at ${locked}.` };
  }
  if (slug === "/" && page.id !== "page-home") {
    return { ok: false, error: "Home already uses the root URL." };
  }
  if (isReservedPageSlug(slug) && slug !== locked) {
    return { ok: false, error: "That URL is reserved by the website." };
  }
  const taken = pages.find((item) => item.id !== page.id && withSlash(item.slug) === slug);
  if (taken) return { ok: false, error: "Another page already uses that URL." };

  const leaf = slug.replace(/^\/|\/$/g, "");
  if (posts.some((post) => post.slug === leaf) && (slug === blogPostPath(leaf) || slug === blogPostPathLegacy(leaf))) {
    return { ok: false, error: "That URL collides with a blog post." };
  }
  if (categories.some((category) => category.slug === leaf) && slug.startsWith("/category/")) {
    return { ok: false, error: "That URL collides with a blog category." };
  }
  return { ok: true, slug };
}

export function knownLocalDestinations(
  pages: Array<Pick<CmsPage, "slug" | "status">>,
  posts: Array<Pick<BlogPost, "slug" | "status">> = [],
  categories: Array<Pick<BlogCategory, "slug" | "active">> = [],
) {
  const known = new Set<string>(["/", "/welcome/", "/contact/", "/blogs/"]);
  for (const page of pages) {
    if (page.status === "draft") continue;
    known.add(withSlash(page.slug));
    if (page.slug === "/") known.add("/welcome/");
  }
  for (const post of posts) {
    if (post.status !== "published") continue;
    known.add(withSlash(blogPostPath(post.slug)));
  }
  for (const category of categories) {
    if (category.active === false) continue;
    known.add(withSlash(`/category/${category.slug}/`));
  }
  return known;
}

export function isKnownLocalDestination(
  destination: string,
  known: Set<string>,
) {
  if (!destination.startsWith("/") || destination.startsWith("//")) return true;
  const path = withSlash(destination.split("?")[0] || "/");
  return known.has(path);
}

export function remapNavHref(href: string, from: string, to: string) {
  const [pathPart, ...hashParts] = href.split("#");
  const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
  const path = (pathPart || "/").split("?")[0] || "/";
  if (withSlash(path) !== withSlash(from)) return href;
  return `${to}${hash}`;
}

export function remapLegacySubscriptionHref(href: string) {
  return remapNavHref(href, SUBSCRIPTION_SLUG_LEGACY, SUBSCRIPTION_SLUG);
}

export function remapStructuredHrefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => remapStructuredHrefs(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && /href/i.test(key)) {
      next[key] = remapLegacySubscriptionHref(item);
    } else {
      next[key] = remapStructuredHrefs(item);
    }
  }
  return next;
}

export function isSelfCanonicalValue(canonical: string, slug: string) {
  const value = canonical.trim();
  if (!value) return true;
  const path = withSlash(slug);
  if (withSlash(value) === path) return true;
  try {
    const url = new URL(value, "https://theflixiptv.com");
    return withSlash(url.pathname) === path;
  } catch {
    return false;
  }
}
