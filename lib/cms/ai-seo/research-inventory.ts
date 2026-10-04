import { blogPostPath } from "@/lib/cms/blog-paths";
import { PAGE_SEO_KEYS, PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";
import type { BlogCategory, BlogPost, SiteSettings } from "@/lib/cms/types";
import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";

const TITLE_CAP = 120;
const DESC_CAP = 180;
const EXCERPT_CAP = 180;
const MAX_POSTS = 40;
const MAX_CATEGORIES = 30;

function trim(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type SeoResearchInventoryItem = {
  kind: "page" | "post" | "category";
  label: string;
  publicUrl: string;
  seoTitle?: string;
  description?: string;
  status?: string;
  categoryName?: string;
};

export type SeoResearchInventory = {
  siteName: string;
  items: SeoResearchInventoryItem[];
  allowlistedPublicUrls: string[];
};

function primaryPublicPath(key: PageSeoKey) {
  const paths = PAGE_SEO_META[key].publicPaths;
  const withSlash = paths.find((path) => path.endsWith("/")) || paths[0] || "/";
  return normalizePublicPath(withSlash) || withSlash;
}

/**
 * Bounded CMS inventory for UK opportunity research.
 * Never includes full article bodies, admin users, messages, or credentials.
 */
export function buildSeoResearchInventory(args: {
  settings: SiteSettings;
  posts: BlogPost[];
  categories: BlogCategory[];
}): SeoResearchInventory {
  const items: SeoResearchInventoryItem[] = [];
  const allowlisted = new Set<string>();

  for (const key of PAGE_SEO_KEYS) {
    const meta = PAGE_SEO_META[key];
    const seo = args.settings.pageSeo[key];
    const publicUrl = primaryPublicPath(key);
    allowlisted.add(publicUrl);
    items.push({
      kind: "page",
      label: trim(meta.label, TITLE_CAP),
      publicUrl,
      seoTitle: trim(seo?.title, TITLE_CAP) || undefined,
      description: trim(seo?.description, DESC_CAP) || undefined,
    });
  }

  const categoryNameById = new Map(args.categories.map((category) => [category.id, category.name]));

  const posts = [...args.posts]
    .sort((a, b) => String(b.updatedAt || b.publishedAt || "").localeCompare(String(a.updatedAt || a.publishedAt || "")))
    .slice(0, MAX_POSTS);

  for (const post of posts) {
    const publicUrl = normalizePublicPath(blogPostPath(post.slug));
    if (!publicUrl) continue;
    allowlisted.add(publicUrl);
    items.push({
      kind: "post",
      label: trim(post.title, TITLE_CAP),
      publicUrl,
      seoTitle: trim(post.seoTitle, TITLE_CAP) || undefined,
      description: trim(post.seoDescription || post.excerpt, DESC_CAP) || undefined,
      status: post.status,
      categoryName: post.categoryId ? trim(categoryNameById.get(post.categoryId), 80) || undefined : undefined,
    });
  }

  for (const category of args.categories.slice(0, MAX_CATEGORIES)) {
    const publicUrl = normalizePublicPath(`/category/${category.slug}/`);
    if (!publicUrl) continue;
    allowlisted.add(publicUrl);
    items.push({
      kind: "category",
      label: trim(category.name, TITLE_CAP),
      publicUrl,
      seoTitle: trim(category.seoTitle, TITLE_CAP) || undefined,
      description: trim(category.seoDescription || category.description, DESC_CAP) || undefined,
      status: category.active ? "active" : "inactive",
    });
  }

  return {
    siteName: trim(args.settings.siteName, 80) || "Flix IPTV",
    items,
    allowlistedPublicUrls: [...allowlisted],
  };
}

export const SEO_RESEARCH_INVENTORY_LIMITS = {
  titleCap: TITLE_CAP,
  descCap: DESC_CAP,
  excerptCap: EXCERPT_CAP,
  maxPosts: MAX_POSTS,
  maxCategories: MAX_CATEGORIES,
} as const;
