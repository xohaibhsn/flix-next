import type { Metadata } from "next";
import type { PageSeo, SiteSettings } from "@/lib/cms/types";
import { siteIconMetadata } from "@/lib/cms/favicon";
import { resolveOpenGraphImageFromSettings, socialImageMeta } from "@/lib/cms/open-graph";
import { siteConfig } from "@/lib/site-config";
import { getSiteOrigin } from "@/lib/site-url";

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
  const image = resolveOpenGraphImageFromSettings(seo.ogImage, settings, ogTitle);
  const social = socialImageMeta(image);
  const canonical = seo.canonicalUrl || path;
  return {
    title,
    description,
    metadataBase: new URL(getSiteOrigin()),
    alternates: { canonical },
    robots: robotsContent(seo.robotsIndex, seo.robotsFollow),
    icons: siteIconMetadata(settings),
    openGraph: {
      title: `${ogTitle} | ${settings.siteName}`,
      description: ogDescription,
      url: canonical,
      siteName: settings.siteName,
      type: "website",
      images: social.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: social.twitter?.images,
    },
  };
}