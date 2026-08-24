import type { Metadata } from "next";
import { connection } from "next/server";
import { cms } from "@/lib/cms/repository";
import { siteIconMetadata } from "@/lib/cms/favicon";
import { siteConfig } from "@/lib/site-config";
import { seoToMetadata } from "@/lib/seo";
import { getSiteOrigin } from "@/lib/site-url";
import { resolveOpenGraphImageFromSettings, socialImageMeta } from "@/lib/cms/open-graph";
import type { BlogPost, SiteSettings } from "@/lib/cms/types";

export async function getSiteMetadata(): Promise<Metadata> {
  await connection();
  const settings = await cms.getSettings();
  const image = resolveOpenGraphImageFromSettings(null, settings);
  const social = socialImageMeta(image);
  return {
    metadataBase: new URL(getSiteOrigin()),
    title: {
      default: `${settings.siteName} | ${settings.tagline || siteConfig.tagline}`,
      template: `%s | ${settings.siteName}`,
    },
    icons: siteIconMetadata(settings),
    openGraph: {
      siteName: settings.siteName,
      type: "website",
      images: social.openGraph?.images,
    },
    twitter: social.twitter,
  };
}

export async function pageMetadata(
  title: string,
  description: string,
  path: string,
): Promise<Metadata> {
  await connection();
  const settings = await cms.getSettings();
  const resolvedDescription = description || settings.tagline || siteConfig.description;
  const image = resolveOpenGraphImageFromSettings(null, settings, title);
  const social = socialImageMeta(image);
  return {
    metadataBase: new URL(getSiteOrigin()),
    title,
    description: resolvedDescription,
    alternates: { canonical: path },
    icons: siteIconMetadata(settings),
    openGraph: {
      title: `${title} | ${settings.siteName}`,
      description: resolvedDescription,
      url: path,
      siteName: settings.siteName,
      type: "website",
      images: social.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: resolvedDescription,
      images: social.twitter?.images,
    },
  };
}

export async function pageSeoMetadata(
  key: keyof SiteSettings["pageSeo"],
  fallbackTitle: string,
  fallbackDescription: string,
  path: string,
): Promise<Metadata> {
  await connection();
  const settings = await cms.getSettings();
  return seoToMetadata(settings.pageSeo[key], settings, fallbackTitle, fallbackDescription, path);
}

export async function postSeoMetadata(post: BlogPost): Promise<Metadata> {
  await connection();
  const settings = await cms.getSettings();
  return seoToMetadata(
    {
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.excerpt,
      focusKeyword: post.focusKeyword,
      canonicalUrl: post.canonicalUrl || `/blog/${post.slug}/`,
      robotsIndex: post.robotsIndex,
      robotsFollow: post.robotsFollow,
      ogTitle: post.ogTitle,
      ogDescription: post.ogDescription,
      ogImage: post.ogImage || post.featuredImage,
      sitemapInclude: post.sitemapInclude,
      customJsonLd: "",
    },
    settings,
    post.title,
    post.excerpt,
    `/blog/${post.slug}/`,
  );
}
