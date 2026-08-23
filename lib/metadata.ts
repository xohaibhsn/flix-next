import type { Metadata } from "next";
import { cms } from "@/lib/cms/repository";
import { siteConfig } from "@/lib/site-config";

export async function getSiteMetadata(): Promise<Metadata> {
  const settings = await cms.getSettings();
  const favicon = settings.branding.favicon?.secureUrl;
  const og = settings.branding.defaultOgImage?.secureUrl;
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: `${settings.siteName} | ${settings.tagline || siteConfig.tagline}`,
      template: `%s | ${settings.siteName}`,
    },
    description: siteConfig.description,
    icons: favicon ? { icon: [{ url: favicon }] } : { icon: "/favicon.svg" },
    openGraph: {
      siteName: settings.siteName,
      type: "website",
      images: og ? [{ url: og, width: 1200, height: 630 }] : undefined,
    },
    twitter: og
      ? { card: "summary_large_image", images: [og] }
      : { card: "summary" },
  };
}

export async function pageMetadata(
  title: string,
  description: string,
  path: string,
): Promise<Metadata> {
  const settings = await cms.getSettings();
  const og = settings.branding.defaultOgImage?.secureUrl;
  const favicon = settings.branding.favicon?.secureUrl;
  return {
    title,
    description,
    alternates: { canonical: path },
    icons: favicon ? { icon: [{ url: favicon }] } : { icon: "/favicon.svg" },
    openGraph: {
      title: `${title} | ${settings.siteName}`,
      description,
      url: path,
      siteName: settings.siteName,
      type: "website",
      images: og ? [{ url: og, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: og ? "summary_large_image" : "summary",
      images: og ? [og] : undefined,
    },
  };
}
