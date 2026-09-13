import { withSlash } from "@/lib/cms/redirects";
import { absoluteUrl, getSiteOrigin } from "@/lib/site-url";

function isSelfCanonicalValue(canonical: string, slug: string) {
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

export const BLOG_POST_PREFIX = "/blogs/";
export const BLOG_POST_PREFIX_LEGACY = "/blog/";

function postLeaf(slug: string) {
  return String(slug || "").replace(/^\/+|\/+$/g, "");
}

export function blogPostPath(slug: string) {
  return `${BLOG_POST_PREFIX}${postLeaf(slug)}/`;
}

export function blogPostPathLegacy(slug: string) {
  return `${BLOG_POST_PREFIX_LEGACY}${postLeaf(slug)}/`;
}

export function blogPostUrl(slug: string) {
  return absoluteUrl(blogPostPath(slug));
}

function pathOnly(value: string) {
  return withSlash((value || "/").split("?")[0]?.split("#")[0] || "/");
}

export function isLegacyBlogIndexPath(pathname: string) {
  return pathOnly(pathname) === BLOG_POST_PREFIX_LEGACY;
}

export function isLegacyBlogPostPath(pathname: string) {
  const path = pathOnly(pathname);
  return path.startsWith(BLOG_POST_PREFIX_LEGACY) && path !== BLOG_POST_PREFIX_LEGACY && !path.startsWith(BLOG_POST_PREFIX);
}

export function blogsPathFromLegacyBlogPath(pathname: string) {
  const path = pathOnly(pathname);
  if (path === BLOG_POST_PREFIX_LEGACY) return BLOG_POST_PREFIX;
  if (isLegacyBlogPostPath(path)) return `${BLOG_POST_PREFIX}${path.slice(BLOG_POST_PREFIX_LEGACY.length)}`;
  return path;
}

export function migratePublicBlogPath(pathname: string) {
  const path = pathOnly(pathname);
  if (path === BLOG_POST_PREFIX_LEGACY || isLegacyBlogPostPath(path)) {
    return blogsPathFromLegacyBlogPath(path);
  }
  return path;
}

export function migratePublicBlogHref(href: string) {
  const trimmed = String(href || "").trim();
  if (!trimmed) return trimmed;

  const splitHash = (value: string) => {
    const hashIndex = value.indexOf("#");
    if (hashIndex === -1) return { path: value, hash: "" };
    return { path: value.slice(0, hashIndex), hash: value.slice(hashIndex) };
  };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const origin = getSiteOrigin();
      const host = url.hostname.replace(/^www\./, "");
      const siteHost = new URL(origin).hostname.replace(/^www\./, "");
      if (host === siteHost || host === "theflixiptv.com") {
        url.pathname = migratePublicBlogPath(url.pathname);
        return url.toString();
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    const { path, hash } = splitHash(trimmed);
    const [pathname, ...queryParts] = path.split("?");
    const query = queryParts.length ? `?${queryParts.join("?")}` : "";
    return `${migratePublicBlogPath(pathname)}${query}${hash}`;
  }

  return trimmed;
}

export function resolveBlogPostCanonical(post: { slug: string; canonicalUrl?: string }) {
  const nextPath = blogPostPath(post.slug);
  const stored = (post.canonicalUrl || "").trim();
  if (!stored) return nextPath;
  if (isSelfCanonicalValue(stored, blogPostPathLegacy(post.slug))) return nextPath;
  if (isSelfCanonicalValue(stored, nextPath)) return nextPath;
  return stored;
}
