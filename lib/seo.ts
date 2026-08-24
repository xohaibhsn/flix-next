import type { Metadata } from "next";
import type { MediaRef, PageSeo, SiteSettings } from "@/lib/cms/types";
import { siteConfig } from "@/lib/site-config";

export function isSiteIndexable() {
  const raw = process.env.SITE_INDEXABLE?.trim().toLowerCase();
  if (!raw) return true;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function defaultPageSeo(title: string, description: string, path: string): PageSeo {
  return {
    title,
    description,
    focusKeyword: "",
    canonicalUrl: path,
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
  };
}

function robotsContent(index: boolean, follow: boolean) {
  const siteOk = isSiteIndexable();
  return {
    index: siteOk && index,
    follow: siteOk && follow,
    googleBot: {
      index: siteOk && index,
      follow: siteOk && follow,
    },
  };
}

export function seoToMetadata(
  seo: PageSeo,
  settings: SiteSettings,
  fallbackTitle: string,
  fallbackDescription: string,
  path: string,
): Metadata {
  const title = seo.title || fallbackTitle;
  const description = seo.description || fallbackDescription || settings.tagline || siteConfig.description;
  const ogTitle = seo.ogTitle || title;
  const ogDescription = seo.ogDescription || description;
  const image: MediaRef | null = seo.ogImage || settings.branding.defaultOgImage;
  const canonical = seo.canonicalUrl || path;
  const favicon = settings.branding.favicon?.secureUrl;
  return {
    title,
    description,
    alternates: { canonical },
    robots: robotsContent(seo.robotsIndex, seo.robotsFollow),
    icons: favicon ? { icon: [{ url: favicon }] } : { icon: "/favicon.svg" },
    openGraph: {
      title: `${ogTitle} | ${settings.siteName}`,
      description: ogDescription,
      url: canonical,
      siteName: settings.siteName,
      type: "website",
      images: image ? [{ url: image.secureUrl, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: ogTitle,
      description: ogDescription,
      images: image ? [image.secureUrl] : undefined,
    },
  };
}