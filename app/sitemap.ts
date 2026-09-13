import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { seoKeyForPageId } from "@/lib/cms/page-paths";
import { withSlash } from "@/lib/cms/redirects";
import { cms } from "@/lib/cms/repository";
import { getSiteOrigin } from "@/lib/site-url";
import type { PageSeoKey } from "@/lib/cms/page-seo";

function sitemapPathForPage(id: string, slug: string) {
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = getSiteOrigin();
  const [settings, pages, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();

  const add = (
    path: string,
    key: PageSeoKey | null,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: number,
  ) => {
    if (key && !settings.pageSeo[key].sitemapInclude) return;
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({
      url: `${origin}${path}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
    });
  };

  add("/welcome/", "home", "weekly", 1);
  add("/blogs/", "blog", "weekly", 0.8);

  for (const page of pages) {
    if (page.status !== "published") continue;
    const key = seoKeyForPageId(page.id);
    const path = sitemapPathForPage(page.id, page.slug);
    if (!key) continue;
    if (key === "home") continue;
    if (key === "blog") continue;
    add(path, key, frequencyForKey(key), priorityForKey(key));
  }

  for (const post of posts) {
    if (post.status !== "published" || !post.sitemapInclude) continue;
    entries.push({
      url: `${origin}/blogs/${post.slug}/`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }
  for (const category of categories) {
    if (!category.active) continue;
    entries.push({
      url: `${origin}/category/${category.slug}/`,
      lastModified: new Date(category.updatedAt),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }
  return entries;
}
