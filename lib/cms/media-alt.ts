import type { Permission } from "@/lib/auth/permissions";
import type { MediaAsset } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";

export const MEDIA_ALT_MAX = 160;

export const MEDIA_API_PERMISSIONS: Permission[] = ["media", "pages", "blog", "seo", "site_settings"];

export function sanitizeMediaAlt(value: unknown) {
  return sanitizeText(value, MEDIA_ALT_MAX).trim();
}

export function contentImageAlt(storedAlt: string | undefined | null, fallback: string) {
  const alt = String(storedAlt || "").trim();
  const safeFallback = String(fallback || "").trim();
  return alt || safeFallback;
}

export type MediaAltUpdateResult =
  | { ok: true; alt: string; next: MediaAsset }
  | { ok: false; error: string; status: number };

export function applyMediaAltUpdate(asset: MediaAsset | null, altInput: unknown): MediaAltUpdateResult {
  if (!asset) {
    return { ok: false, error: "That media item is not in the library.", status: 404 };
  }
  const alt = sanitizeMediaAlt(altInput);
  return {
    ok: true,
    alt,
    next: { ...asset, alt },
  };
}

export function withMediaWriteAuth<T>(unauthorized: { ok: false; error: string } | null, next: () => T): T | { ok: false; error: string } {
  if (unauthorized) return unauthorized;
  return next();
}

export function mediaCloudinaryFields(asset: Pick<MediaAsset, "id" | "publicId" | "secureUrl" | "folder" | "width" | "height" | "format" | "resourceType" | "bytes" | "originalFilename">) {
  return {
    id: asset.id,
    publicId: asset.publicId,
    secureUrl: asset.secureUrl,
    folder: asset.folder,
    width: asset.width,
    height: asset.height,
    format: asset.format,
    resourceType: asset.resourceType,
    bytes: asset.bytes,
    originalFilename: asset.originalFilename,
  };
}
