import type { MetadataRoute } from "next";
import { seoKeyForPageId } from "@/lib/cms/page-paths";
import type { PageSeoKey } from "@/lib/cms/page-seo";
import { withSlash } from "@/lib/cms/redirects";
import type { SiteSettings } from "@/lib/cms/types";

/** Hourly sitemap revalidation; Sidhu saves also call revalidatePath("/sitemap.xml"). */
export const SITEMAP_REVALIDATE_SECONDS = 3600;

export type SitemapPageRow = {
  id: string;
  slug: string;
  status: "draft" | "published";
};

export type SitemapPostRow = {
  slug: string;
  status: "draft" | "published";
  sitemapInclude: boolean;
  updatedAt: string;
};

export type SitemapCategoryRow = {
  slug: string;
  active: boolean;
  updatedAt: string;
};

export function sitemapPathForPage(id: string, slug: string) {
  if (id === "page-home" || withSlash(slug) === "/") return "/welcome/";
  return withSlash(slug);
}

function frequencyForKey(key: PageSeoKey): MetadataRoute.Sitemap[number]["changeFrequency"] {
  if (key === "home" || key === "subscriptions" || key === "contact" || key === "blog") return "weekly";
  if (key === "about") return "monthly";
  return "yearly";
}

function priorityForKey(key: PageSeoKey) {
  if (key === "home") return 1;
  if (key === "subscriptions" || key === "contact" || key === "blog") return 0.8;
  if (key === "about") return 0.6;
  return 0.4;
}

/**
 * Build sitemap entries from minimal rows.
 * Page lastModified is omitted: CmsPage has no editorial updatedAt in the app model.
 * Posts/categories use stored updatedAt only.
 */
export function buildSitemapEntries(input: {
  origin: string;
  settings: SiteSettings;
  pages: SitemapPageRow[];
  posts: SitemapPostRow[];
  categories: SitemapCategoryRow[];
}): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();

  const add = (
    path: string,
    key: PageSeoKey | null,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: number,
  ) => {
    if (key && !input.settings.pageSeo[key].sitemapInclude) return;
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({
      url: `${input.origin}${path}`,
      changeFrequency,
      priority,
    });
  };

  add("/welcome/", "home", "weekly", 1);
  add("/blogs/", "blog", "weekly", 0.8);

  for (const page of input.pages) {
    if (page.status !== "published") continue;
    const key = seoKeyForPageId(page.id);
    const path = sitemapPathForPage(page.id, page.slug);
    if (!key) continue;
    if (key === "home") continue;
    if (key === "blog") continue;
    add(path, key, frequencyForKey(key), priorityForKey(key));
  }

  for (const post of input.posts) {
    if (post.status !== "published" || !post.sitemapInclude) continue;
    entries.push({
      url: `${input.origin}/blogs/${post.slug}/`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  for (const category of input.categories) {
    if (!category.active) continue;
    entries.push({
      url: `${input.origin}/category/${category.slug}/`,
      lastModified: new Date(category.updatedAt),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  return entries;
}

export function sitemapUrls(entries: MetadataRoute.Sitemap) {
  return entries.map((entry) => entry.url).sort();
}
