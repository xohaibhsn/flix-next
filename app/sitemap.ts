import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { COMPANY_PAGES } from "@/lib/cms/company-pages";
import { cms } from "@/lib/cms/repository";
import { getSiteOrigin } from "@/lib/site-url";
import type { PageSeoKey } from "@/lib/cms/page-seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = getSiteOrigin();
  const [settings, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  const staticPages: Array<{
    key: PageSeoKey;
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }> = [
    { key: "home", path: "/welcome/", changeFrequency: "weekly", priority: 1 },
    { key: "subscriptions", path: "/iptv-subscriptions-uk/", changeFrequency: "weekly", priority: 0.8 },
    { key: "contact", path: "/contact/", changeFrequency: "weekly", priority: 0.8 },
    { key: "blog", path: "/blog/", changeFrequency: "weekly", priority: 0.8 },
    ...COMPANY_PAGES.map((page) => ({
      key: page.seoKey,
      path: page.slug,
      changeFrequency: page.seoKey === "about" ? ("monthly" as const) : ("yearly" as const),
      priority: page.seoKey === "about" ? 0.6 : 0.4,
    })),
  ];
  const entries: MetadataRoute.Sitemap = staticPages
    .filter((page) => settings.pageSeo[page.key].sitemapInclude)
    .map((page) => ({
      url: `${origin}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
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
