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
    customJsonLd: "",
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

export function brandedSocialTitle(title: string, siteName: string) {
  const t = title.trim();
  const brand = siteName.trim();
  if (!t) return brand;
  if (!brand) return t;
  const suffix = ` | ${brand}`;
  let next = t;
  if (next.endsWith(suffix)) {
    const without = next.slice(0, -suffix.length).trim();
    if (without === brand || without.startsWith(`${brand} | `) || without.includes(brand)) {
      next = without;
    }
  }
  if (!next) return brand;
  if (next === brand) return next;
  if (next.endsWith(suffix) || next.startsWith(`${brand} | `) || next.includes(brand)) return next;
  return `${next}${suffix}`;
}

export function seoToMetadata(
  seo: PageSeo,
  settings: SiteSettings,
  fallbackTitle: string,
  fallbackDescription: string,
  path: string,
): Metadata {
  const title = seo.title.trim() || fallbackTitle;
  const description = seo.description.trim() || fallbackDescription || settings.tagline || siteConfig.description;
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
      title: brandedSocialTitle(ogTitle, settings.siteName),
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