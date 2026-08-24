import type { Metadata } from "next";
import { connection } from "next/server";
import { cms } from "@/lib/cms/repository";
import { siteConfig } from "@/lib/site-config";

export async function getSiteMetadata(): Promise<Metadata> {
  await connection();
  const settings = await cms.getSettings();
  const favicon = settings.branding.favicon?.secureUrl;
  const og = settings.branding.defaultOgImage?.secureUrl;
  const description = settings.tagline || siteConfig.description;
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: `${settings.siteName} | ${settings.tagline || siteConfig.tagline}`,
      template: `%s | ${settings.siteName}`,
    },
    description,
    icons: favicon ? { icon: [{ url: favicon }] } : { icon: "/favicon.svg" },
    openGraph: {
      siteName: settings.siteName,
      description,
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
  await connection();
  const settings = await cms.getSettings();
  const og = settings.branding.defaultOgImage?.secureUrl;
  const favicon = settings.branding.favicon?.secureUrl;
  const resolvedDescription = description || settings.tagline || siteConfig.description;
  return {
    title,
    description: resolvedDescription,
    alternates: { canonical: path },
    icons: favicon ? { icon: [{ url: favicon }] } : { icon: "/favicon.svg" },
    openGraph: {
      title: `${title} | ${settings.siteName}`,
      description: resolvedDescription,
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
