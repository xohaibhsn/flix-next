import type { Metadata } from "next";
import type { MediaRef, SiteSettings } from "@/lib/cms/types";

const FALLBACK_ICON = "/favicon.svg";

export function versionedMediaUrl(ref: MediaRef) {
  const url = ref.secureUrl;
  const version = encodeURIComponent(ref.id);
  return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

export function iconTypeFromUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes(".svg") || lower.endsWith("svg+xml")) return "image/svg+xml";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".ico")) return "image/x-icon";
  return "image/png";
}

export function siteIconMetadata(settings: SiteSettings): NonNullable<Metadata["icons"]> {
  const favicon = settings.branding.favicon;
  if (favicon?.secureUrl) {
    const remote = versionedMediaUrl(favicon);
    const local = `/icon/?v=${encodeURIComponent(favicon.id)}`;
    const type = iconTypeFromUrl(favicon.secureUrl);
    return {
      icon: [
        { url: local, type },
        { url: remote, type },
      ],
      shortcut: [{ url: remote, type }],
      apple: [{ url: remote, sizes: "180x180", type }],
    };
  }
  return {
    icon: [{ url: FALLBACK_ICON, type: "image/svg+xml" }],
    shortcut: [{ url: FALLBACK_ICON, type: "image/svg+xml" }],
  };
}
