import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/cms/sitemap-build";
import { loadSitemapSource } from "@/lib/cms/sitemap-source";
import { getSiteOrigin } from "@/lib/site-url";

/** Sitemap-only ISR (1h); Sidhu CMS saves also revalidatePath("/sitemap.xml"). */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const source = await loadSitemapSource();
  return buildSitemapEntries({
    origin,
    settings: source.settings,
    pages: source.pages,
    posts: source.posts,
    categories: source.categories,
  });
}
