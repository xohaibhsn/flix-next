import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { cms } from "@/lib/cms/repository";
import { getSiteOrigin } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = getSiteOrigin();
  const [settings, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  const staticPages = [
    { key: "home" as const, path: "/welcome/" },
    { key: "subscriptions" as const, path: "/iptv-subscriptions-uk/" },
    { key: "contact" as const, path: "/contact/" },
    { key: "blog" as const, path: "/blog/" },
  ];
  const entries: MetadataRoute.Sitemap = staticPages
    .filter((page) => settings.pageSeo[page.key].sitemapInclude)
    .map((page) => ({
      url: `${origin}${page.path}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: page.path === "/welcome/" ? 1 : 0.8,
    }));

  for (const post of posts) {
    if (post.status !== "published" || !post.sitemapInclude) continue;
    entries.push({
      url: `${origin}/blog/${post.slug}/`,
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
