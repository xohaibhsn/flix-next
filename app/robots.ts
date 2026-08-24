import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { isSiteIndexable } from "@/lib/seo";
import { getSiteOrigin } from "@/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = getSiteOrigin();
  const indexable = isSiteIndexable();
  return {
    rules: {
      userAgent: "*",
      allow: indexable ? "/" : undefined,
      disallow: indexable ? ["/sidhu/", "/api/"] : "/",
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
