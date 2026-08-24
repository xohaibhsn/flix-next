import type { Metadata } from "next";
import type { MediaRef, SiteSettings } from "@/lib/cms/types";
import { getSiteOrigin } from "@/lib/site-url";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const STATIC_OG_PATH = "/og-default.png";
const CLOUDINARY_OG_TRANSFORM = "w_1200,h_630,c_fill,f_jpg,q_auto:good";

export type ResolvedSocialImage = {
  url: string;
  alt: string;
  width: number;
  height: number;
  type: string;
  source: "page" | "site" | "static";
};

function withAssetVersion(url: string, assetId: string) {
  const version = encodeURIComponent(assetId);
  if (/[?&]v=/.test(url)) return url;
  return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

export function cloudinarySocialDeliveryUrl(secureUrl: string) {
  const marker = "/image/upload/";
  const index = secureUrl.indexOf(marker);
  if (index === -1) return secureUrl;
  const prefix = secureUrl.slice(0, index + marker.length);
  const rest = secureUrl.slice(index + marker.length);
  if (rest.startsWith(`${CLOUDINARY_OG_TRANSFORM}/`) || rest.startsWith("w_1200,h_630,")) {
    return secureUrl;
  }
  return `${prefix}${CLOUDINARY_OG_TRANSFORM}/${rest}`;
}

export function resolveOpenGraphImage(
  pageImage: MediaRef | null | undefined,
  siteDefaultOg: MediaRef | null | undefined,
  alt = "THE FLIX IPTV",
): ResolvedSocialImage {
  const chosen = pageImage?.secureUrl ? pageImage : siteDefaultOg?.secureUrl ? siteDefaultOg : null;
  if (chosen) {
    const delivered = cloudinarySocialDeliveryUrl(chosen.secureUrl);
    return {
      url: withAssetVersion(delivered, chosen.id),
      alt,
      width: OG_WIDTH,
      height: OG_HEIGHT,
      type: delivered.includes("f_jpg") ? "image/jpeg" : "image/png",
      source: pageImage?.secureUrl ? "page" : "site",
    };
  }
  return {
    url: `${getSiteOrigin()}${STATIC_OG_PATH}`,
    alt,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    type: "image/png",
    source: "static",
  };
}

export function resolveOpenGraphImageFromSettings(
  pageImage: MediaRef | null | undefined,
  settings: SiteSettings,
  alt?: string,
) {
  return resolveOpenGraphImage(
    pageImage,
    settings.branding.defaultOgImage,
    alt || settings.branding.logoAlt || settings.siteName,
  );
}

export function socialImageMeta(image: ResolvedSocialImage): Pick<Metadata, "openGraph" | "twitter"> {
  const ogImage = {
    url: image.url,
    secureUrl: image.url,
    width: image.width,
    height: image.height,
    alt: image.alt,
    type: image.type,
  };
  return {
    openGraph: {
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      images: [
        {
          url: image.url,
          width: image.width,
          height: image.height,
          alt: image.alt,
          type: image.type,
        },
      ],
    },
  };
}

export function versionedOgUrl(ref: MediaRef) {
  return withAssetVersion(cloudinarySocialDeliveryUrl(ref.secureUrl), ref.id);
}