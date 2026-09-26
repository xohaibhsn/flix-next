import { BLOG_INDEX_SLUG } from "@/lib/cms/blog-index";
import { blogPostPath } from "@/lib/cms/blog-paths";
import { STATIC_OG_PATH } from "@/lib/cms/open-graph";
import { PAGE_SEO_KEYS, PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";
import { SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "@/lib/cms/page-paths";
import type { BlogCategory, BlogPost, CmsSection, MediaRef, PageSeo, SiteSettings } from "@/lib/cms/types";
import { brandedSocialTitle } from "@/lib/seo";
import { siteConfig } from "@/lib/site-config";

export const SIDHU_SEO_PUBLIC_ORIGIN = "https://theflixiptv.com";
export const SIDHU_SEO_TITLE_GUIDE = 70;
export const SIDHU_SEO_DESCRIPTION_GUIDE = 160;

export type SidhuKeywordHint = {
  label: string;
  found: boolean;
};

export type SidhuSeoWarning = {
  id: string;
  text: string;
};

export type SidhuSeoPreviewModel = {
  seoTitle: string;
  fallbackTitle: string;
  effectiveTitle: string;
  metaDescription: string;
  fallbackDescription: string;
  effectiveDescription: string;
  canonicalInput: string;
  publicPath: string;
  displayUrl: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  sitemapInclude: boolean;
  ogTitleInput: string;
  effectiveOgTitle: string;
  ogDescriptionInput: string;
  effectiveOgDescription: string;
  ogImageUrl: string;
  usingDefaultOg: boolean;
  ogImageNote: string;
  siteName: string;
  focusKeyword: string;
  titleLength: number;
  descriptionLength: number;
  warnings: SidhuSeoWarning[];
  keywordHints: SidhuKeywordHint[];
};

function trim(value: string | undefined) {
  return String(value || "").trim();
}

function normalizeForMatch(value: string) {
  return trim(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

export function sidhuKeywordFound(haystack: string, keyword: string) {
  const needle = normalizeForMatch(keyword);
  if (!needle) return false;
  const hay = normalizeForMatch(haystack);
  if (hay.includes(needle)) return true;
  const slugForm = trim(keyword).toLowerCase().replace(/\s+/g, "-");
  return slugForm.length > 0 && haystack.toLowerCase().includes(slugForm);
}

export function sidhuPlainText(html: string) {
  return trim(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

export function sidhuHeadingFromSections(sections: CmsSection[] | undefined) {
  if (!Array.isArray(sections)) return "";
  for (const section of sections) {
    const data = (section.data || {}) as Record<string, unknown>;
    for (const key of ["heading", "title", "highlight"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

export function sidhuBodyFromSections(sections: CmsSection[] | undefined) {
  if (!Array.isArray(sections)) return "";
  return sections
    .filter((section) => section.type === "rich-content" || section.type === "rich-text")
    .map((section) => String((section.data as { html?: string } | undefined)?.html || ""))
    .join("\n");
}

export function sidhuPagePreviewPath(key: PageSeoKey) {
  if (key === "home") return "/welcome/";
  if (key === "subscriptions") return SUBSCRIPTION_SLUG;
  if (key === "blog") return BLOG_INDEX_SLUG;
  const paths = PAGE_SEO_META[key].publicPaths.filter((path) => {
    if (!path.startsWith("/") || path === "/") return false;
    if (path === SUBSCRIPTION_SLUG_LEGACY || path === "/blog" || path === "/blog/") return false;
    return path.endsWith("/");
  });
  return paths[0] || PAGE_SEO_META[key].publicPaths[0] || "/";
}

export function sidhuCategoryPreviewUrl(slug: string, origin = SIDHU_SEO_PUBLIC_ORIGIN) {
  const leaf = String(slug || "").replace(/^\/+|\/+$/g, "");
  return `${origin}/category/${leaf}/`;
}

export function sidhuDisplayUrl(canonicalInput: string, publicPath: string, origin = SIDHU_SEO_PUBLIC_ORIGIN) {
  const value = trim(canonicalInput);
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  if (!value) return `${origin}${path}`;
  if (value.startsWith("/")) return `${origin}${value}`;
  return value;
}

export function sidhuCanonicalIssue(canonicalInput: string): SidhuSeoWarning | null {
  const value = trim(canonicalInput);
  if (!value) return null;
  if (value.startsWith("/")) {
    if (/\s/.test(value) || value.startsWith("//")) {
      return { id: "canonical-malformed", text: "Canonical looks malformed. Use a path like /welcome/ or a full https URL." };
    }
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { id: "canonical-malformed", text: "Canonical looks malformed. Use a path like /welcome/ or a full https URL." };
  }
  if (parsed.protocol === "http:") {
    return { id: "canonical-http", text: "Canonical uses HTTP. Public pages should use HTTPS." };
  }
  if (parsed.protocol !== "https:") {
    return { id: "canonical-malformed", text: "Canonical looks malformed. Use a path like /welcome/ or a full https URL." };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "www.theflixiptv.com") {
    return { id: "canonical-www", text: "Canonical uses www.theflixiptv.com. The live site uses the apex host theflixiptv.com." };
  }
  return null;
}

function firstArticleSlice(html: string) {
  return sidhuPlainText(html).slice(0, 400);
}

export function buildSidhuSeoPreview(input: {
  seoTitle: string;
  metaDescription: string;
  fallbackTitle: string;
  fallbackDescription: string;
  canonical: string;
  publicPath: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  sitemapInclude: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: MediaRef | null;
  defaultOgImage?: MediaRef | null;
  siteName: string;
  siteTagline?: string;
  focusKeyword: string;
  contentTitle?: string;
  bodyHtml?: string;
  slug?: string;
}): SidhuSeoPreviewModel {
  const seoTitle = input.seoTitle;
  const metaDescription = input.metaDescription;
  const fallbackTitle = trim(input.fallbackTitle) || "Title";
  const fallbackDescription = trim(input.fallbackDescription);
  const effectiveTitle = trim(seoTitle) || fallbackTitle;
  const effectiveDescription =
    trim(metaDescription) || fallbackDescription || trim(input.siteTagline) || siteConfig.description;
  const ogTitleInput = input.ogTitle;
  const ogDescriptionInput = input.ogDescription;
  const rawOgTitle = trim(ogTitleInput) || effectiveTitle;
  const effectiveOgTitle = brandedSocialTitle(rawOgTitle, input.siteName);
  const effectiveOgDescription = trim(ogDescriptionInput) || effectiveDescription;
  const ownImage = input.ogImage?.secureUrl || "";
  const defaultImage = input.defaultOgImage?.secureUrl || "";
  const staticImage = `${SIDHU_SEO_PUBLIC_ORIGIN}${STATIC_OG_PATH}`;
  const ogImageUrl = ownImage || defaultImage || staticImage;
  const usingDefaultOg = !ownImage && Boolean(defaultImage);
  const ogImageNote = ownImage
    ? ""
    : usingDefaultOg
      ? "Using the site default OG image."
      : "Using the built-in default OG image.";
  const displayUrl = sidhuDisplayUrl(input.canonical, input.publicPath);
  const keyword = trim(input.focusKeyword);
  const warnings: SidhuSeoWarning[] = [];

  if (!trim(seoTitle)) warnings.push({ id: "title-empty", text: "SEO title is empty. The preview is using the current fallback title." });
  if (!trim(metaDescription)) {
    warnings.push({
      id: "description-empty",
      text: effectiveDescription
        ? "Meta description is empty. The preview is using the current fallback description."
        : "Meta description is empty.",
    });
  }
  const canonicalIssue = sidhuCanonicalIssue(input.canonical);
  if (canonicalIssue) warnings.push(canonicalIssue);
  if (!input.robotsIndex) warnings.push({ id: "noindex", text: "Noindex is enabled. Search engines are asked not to index this URL." });
  if (!input.robotsFollow) warnings.push({ id: "nofollow", text: "Nofollow is enabled. Search engines are asked not to follow links on this URL." });
  if (!input.sitemapInclude) warnings.push({ id: "sitemap-off", text: "This URL is excluded from the sitemap." });
  if (!ownImage) {
    warnings.push({
      id: "og-missing",
      text: usingDefaultOg
        ? "No OG image is set for this item. The preview is using the site default."
        : "No OG image is set for this item. The preview is using the built-in default.",
    });
  }

  const keywordHints: SidhuKeywordHint[] = keyword
    ? [
        { label: "SEO title", found: sidhuKeywordFound(effectiveTitle, keyword) },
        { label: "H1 / title", found: sidhuKeywordFound(input.contentTitle || "", keyword) },
        { label: "Meta description", found: sidhuKeywordFound(effectiveDescription, keyword) },
        { label: "Slug", found: sidhuKeywordFound(input.slug || input.publicPath, keyword) },
        ...(input.bodyHtml !== undefined
          ? [{ label: "Start of article", found: sidhuKeywordFound(firstArticleSlice(input.bodyHtml), keyword) }]
          : []),
      ]
    : [];

  return {
    seoTitle,
    fallbackTitle,
    effectiveTitle,
    metaDescription,
    fallbackDescription,
    effectiveDescription,
    canonicalInput: input.canonical,
    publicPath: input.publicPath,
    displayUrl,
    robotsIndex: input.robotsIndex,
    robotsFollow: input.robotsFollow,
    sitemapInclude: input.sitemapInclude,
    ogTitleInput,
    effectiveOgTitle,
    ogDescriptionInput,
    effectiveOgDescription,
    ogImageUrl,
    usingDefaultOg,
    ogImageNote,
    siteName: input.siteName,
    focusKeyword: keyword,
    titleLength: seoTitle.length,
    descriptionLength: metaDescription.length,
    warnings,
    keywordHints,
  };
}

export function sidhuPreviewFromPageSeo(
  seo: PageSeo,
  options: {
    key: PageSeoKey;
    fallbackTitle: string;
    fallbackDescription: string;
    siteName: string;
    siteTagline?: string;
    defaultOgImage?: MediaRef | null;
    contentTitle?: string;
    bodyHtml?: string;
  },
) {
  return buildSidhuSeoPreview({
    seoTitle: seo.title,
    metaDescription: seo.description,
    fallbackTitle: options.fallbackTitle,
    fallbackDescription: options.fallbackDescription,
    canonical: seo.canonicalUrl,
    publicPath: sidhuPagePreviewPath(options.key),
    robotsIndex: seo.robotsIndex,
    robotsFollow: seo.robotsFollow,
    sitemapInclude: seo.sitemapInclude,
    ogTitle: seo.ogTitle,
    ogDescription: seo.ogDescription,
    ogImage: seo.ogImage,
    defaultOgImage: options.defaultOgImage,
    siteName: options.siteName,
    siteTagline: options.siteTagline,
    focusKeyword: seo.focusKeyword,
    contentTitle: options.contentTitle,
    bodyHtml: options.bodyHtml,
    slug: sidhuPagePreviewPath(options.key),
  });
}

export function sidhuPreviewFromPost(
  post: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    seoTitle: string;
    seoDescription: string;
    focusKeyword: string;
    canonicalUrl: string;
    robotsIndex: boolean;
    robotsFollow: boolean;
    sitemapInclude: boolean;
    ogTitle: string;
    ogDescription: string;
    ogImage: MediaRef | null;
    featuredImage: MediaRef | null;
  },
  options: { siteName: string; siteTagline?: string; defaultOgImage?: MediaRef | null },
) {
  return buildSidhuSeoPreview({
    seoTitle: post.seoTitle,
    metaDescription: post.seoDescription,
    fallbackTitle: post.title || "Untitled",
    fallbackDescription: post.excerpt,
    canonical: post.canonicalUrl,
    publicPath: blogPostPath(post.slug),
    robotsIndex: post.robotsIndex,
    robotsFollow: post.robotsFollow,
    sitemapInclude: post.sitemapInclude,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImage: post.ogImage || post.featuredImage,
    defaultOgImage: options.defaultOgImage,
    siteName: options.siteName,
    siteTagline: options.siteTagline,
    focusKeyword: post.focusKeyword,
    contentTitle: post.title,
    bodyHtml: post.content,
    slug: post.slug,
  });
}

export type SidhuSeoOverviewRow = {
  id: string;
  kind: "Page" | "Blog Post" | "Category";
  label: string;
  publicUrl: string;
  seoTitle: string;
  descriptionLength: number;
  indexLabel: string;
  sitemapLabel: string;
  canonicalLabel: string;
  ogLabel: "Yes" | "No" | "Default";
  updated: string;
  editHref: string | null;
  note?: string;
  flags: string[];
};

function formatDay(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function ogLabel(own: boolean, hasDefault: boolean): SidhuSeoOverviewRow["ogLabel"] {
  if (own) return "Yes";
  if (hasDefault) return "Default";
  return "No";
}

function canonicalLabel(canonical: string) {
  if (!trim(canonical)) return "Default URL";
  return sidhuCanonicalIssue(canonical) ? "Check" : "Custom";
}

export function sidhuSeoOverviewRows(
  settings: SiteSettings,
  posts: BlogPost[],
  categories: BlogCategory[],
): SidhuSeoOverviewRow[] {
  const hasDefaultOg = Boolean(settings.branding.defaultOgImage?.secureUrl);
  const pages: SidhuSeoOverviewRow[] = PAGE_SEO_KEYS.map((key) => {
    const seo = settings.pageSeo[key];
    const meta = PAGE_SEO_META[key];
    const flags: string[] = [];
    if (!seo.robotsIndex) flags.push("Noindex");
    if (!seo.sitemapInclude) flags.push("Sitemap excluded");
    if (!trim(seo.title)) flags.push("Missing title");
    if (!trim(seo.description)) flags.push("Missing description");
    if (!seo.ogImage?.secureUrl) flags.push("Missing OG");
    return {
      id: `page-${key}`,
      kind: "Page",
      label: meta.label,
      publicUrl: sidhuDisplayUrl(seo.canonicalUrl, sidhuPagePreviewPath(key)),
      seoTitle: trim(seo.title) || "—",
      descriptionLength: seo.description.length,
      indexLabel: seo.robotsIndex ? "Index" : "Noindex",
      sitemapLabel: seo.sitemapInclude ? "Included" : "Excluded",
      canonicalLabel: canonicalLabel(seo.canonicalUrl),
      ogLabel: ogLabel(Boolean(seo.ogImage?.secureUrl), hasDefaultOg),
      updated: "—",
      editHref: meta.editorHref,
      flags,
    };
  });

  const postRows: SidhuSeoOverviewRow[] = posts.map((post) => {
    const flags: string[] = [];
    if (!post.robotsIndex) flags.push("Noindex");
    if (!post.sitemapInclude) flags.push("Sitemap excluded");
    if (!trim(post.seoTitle) && !trim(post.title)) flags.push("Missing title");
    if (!trim(post.seoDescription) && !trim(post.excerpt)) flags.push("Missing description");
    if (!post.ogImage?.secureUrl && !post.featuredImage?.secureUrl) flags.push("Missing OG");
    if (post.status === "draft") flags.push("Draft");
    return {
      id: post.id,
      kind: "Blog Post",
      label: post.title || post.slug || "Untitled",
      publicUrl: sidhuDisplayUrl(post.canonicalUrl, blogPostPath(post.slug)),
      seoTitle: trim(post.seoTitle) || trim(post.title) || "—",
      descriptionLength: (post.seoDescription || post.excerpt).length,
      indexLabel: post.robotsIndex ? "Index" : "Noindex",
      sitemapLabel: post.sitemapInclude ? "Included" : "Excluded",
      canonicalLabel: canonicalLabel(post.canonicalUrl),
      ogLabel: ogLabel(Boolean(post.ogImage?.secureUrl || post.featuredImage?.secureUrl), hasDefaultOg),
      updated: formatDay(post.updatedAt),
      editHref: `/sidhu/blog/${post.id}/`,
      flags,
    };
  });

  const categoryRows: SidhuSeoOverviewRow[] = categories.map((category) => {
    const flags: string[] = [];
    if (!trim(category.name)) flags.push("Missing title");
    if (!trim(category.description)) flags.push("Missing description");
    flags.push("Missing OG");
    return {
      id: category.id,
      kind: "Category",
      label: category.name || category.slug,
      publicUrl: sidhuCategoryPreviewUrl(category.slug),
      seoTitle: category.name || "—",
      descriptionLength: category.description.length,
      indexLabel: category.active ? "Index (default)" : "Not public",
      sitemapLabel: category.active ? "Included" : "Excluded",
      canonicalLabel: "Default URL",
      ogLabel: ogLabel(false, hasDefaultOg),
      updated: formatDay(category.updatedAt),
      editHref: null,
      note: "Advanced Category SEO controls coming in dedicated phase.",
      flags,
    };
  });

  return [...pages, ...postRows, ...categoryRows];
}
