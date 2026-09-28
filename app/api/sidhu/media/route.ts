import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { applyMediaAltUpdate, MEDIA_API_PERMISSIONS } from "@/lib/cms/media-alt";
import { revalidateSidhuCms } from "@/lib/cms/revalidate";
import { createId } from "@/lib/cms/ids";
import { getMediaUsage, getMediaUsageById } from "@/lib/cms/media-refs";
import { persistUploadedCloudinaryMedia } from "@/lib/cms/media-upload";
import { cms } from "@/lib/cms/repository";
import { sanitizeText } from "@/lib/cms/validation";
import {
  destroyCloudinaryImage,
  isCloudinaryConfigured,
  removeMediaAfterCloudinaryDestroy,
  sanitizeFolder,
  uploadImageBuffer,
} from "@/lib/cloudinary";
import { publicErrorMessage, logServerError } from "@/lib/security/errors";
import { assertSafeImageUpload, isAllowedCloudinaryImage } from "@/lib/security/image-upload";
import { isSameOriginMutation } from "@/lib/security/origin";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function revalidateMedia() {
  revalidateSidhuCms();
}

async function loadMediaUsageContent() {
  const [settings, pages, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  return { settings, pages, posts, categories };
}

export async function GET() {
  const unauthorized = await requireAdminApi(MEDIA_API_PERMISSIONS);
  if (unauthorized) return unauthorized;
  const assets = await cms.listMedia();
  const content = await loadMediaUsageContent();
  const usageById = getMediaUsageById(assets, content);
  return NextResponse.json({
    ok: true,
    configured: isCloudinaryConfigured(),
    assets: assets.map((asset) => {
      const usage = usageById.get(asset.id) || { inUse: false, references: [] };
      return {
        ...asset,
        inUse: usage.inUse,
        usageCount: usage.references.length,
        usageReferences: usage.references.slice(0, 8),
      };
    }),
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(MEDIA_API_PERMISSIONS);
  if (unauthorized) return unauthorized;
  if (!isSameOriginMutation(request)) {
    return jsonError("Invalid request origin.", 403);
  }
  if (!isCloudinaryConfigured()) {
    return jsonError("Cloudinary is not configured.", 503);
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Choose an image file to upload.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    assertSafeImageUpload(file, buffer);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "That image is not allowed.");
  }
  const folder = sanitizeFolder(String(form.get("folder") || "theflix/site"));
  const alt = sanitizeText(form.get("alt"), 160);
  const safeName = file.name.replace(/[^\w.\-]+/g, "-").slice(0, 80) || "upload";
  try {
    const uploaded = await uploadImageBuffer({
      buffer,
      filename: safeName,
      folder,
    });
    const asset = await persistUploadedCloudinaryMedia({
      uploaded,
      isAllowed: isAllowedCloudinaryImage,
      destroyCloudinaryImage,
      addMedia: (next) => cms.addMedia(next),
      onCleanupFailure: (cleanupError, publicId) => {
        console.error("[media-upload] compensating Cloudinary destroy failed", {
          publicId,
          message: cleanupError instanceof Error ? cleanupError.message : "cleanup failed",
        });
      },
      buildAsset: (image) => ({
        id: createId("media"),
        publicId: image.publicId,
        secureUrl: image.secureUrl,
        folder,
        originalFilename: safeName,
        format: image.format,
        width: image.width,
        height: image.height,
        bytes: image.bytes,
        resourceType: image.resourceType,
        createdAt: new Date().toISOString(),
        alt,
      }),
    });
    revalidateMedia();
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    if (error instanceof Error && error.message === "Cloudinary returned an unsupported image type.") {
      return jsonError(error.message);
    }
    logServerError("media-upload", error);
    return jsonError(publicErrorMessage(error, "Media upload failed."), 502);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireAdminApi(MEDIA_API_PERMISSIONS);
  if (unauthorized) return unauthorized;
  if (!isSameOriginMutation(request)) {
    return jsonError("Invalid request origin.", 403);
  }
  if (!isCloudinaryConfigured()) {
    return jsonError("Cloudinary is not configured.", 503);
  }
  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return jsonError("Missing media id.");
  }
  const id = sanitizeText(body.id, 80);
  if (!id) return jsonError("Missing media id.");
  const asset = await cms.getMediaById(id);
  if (!asset) return jsonError("That media item is not in the library.", 404);

  const content = await loadMediaUsageContent();
  const usage = getMediaUsage(asset, content);
  if (usage.inUse) {
    const places = usage.references
      .slice(0, 5)
      .map((ref) => ref.entity)
      .join(", ");
    return jsonError(
      `This image is used in ${usage.references.length} place${usage.references.length === 1 ? "" : "s"}${places ? `: ${places}` : ""}. Unassign it first.`,
      409,
      { usageCount: usage.references.length, usageReferences: usage.references.slice(0, 8) },
    );
  }

  try {
    await removeMediaAfterCloudinaryDestroy({
      publicId: asset.publicId,
      mediaId: id,
      destroyCloudinaryImage,
      removeMedia: (mediaId) => cms.removeMedia(mediaId),
    });
    revalidateMedia();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("media-delete", error);
    return jsonError(publicErrorMessage(error, "Media delete failed."), 502);
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireAdminApi(MEDIA_API_PERMISSIONS);
  if (unauthorized) return unauthorized;
  if (!isSameOriginMutation(request)) {
    return jsonError("Invalid request origin.", 403);
  }
  let body: { id?: string; alt?: unknown; publicId?: unknown; secureUrl?: unknown };
  try {
    body = (await request.json()) as { id?: string; alt?: unknown };
  } catch {
    return jsonError("Missing media id.");
  }
  const id = sanitizeText(body.id, 80);
  if (!id) return jsonError("Missing media id.");
  const asset = await cms.getMediaById(id);
  const result = applyMediaAltUpdate(asset, body.alt);
  if (!result.ok) return jsonError(result.error, result.status);
  const saved = await cms.updateMediaAlt(id, result.alt);
  if (!saved) return jsonError("That media item is not in the library.", 404);
  revalidateMedia();
  return NextResponse.json({ ok: true, asset: saved });
}
