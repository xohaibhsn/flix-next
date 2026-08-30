import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { revalidateSidhuCms } from "@/lib/cms/revalidate";
import { createId } from "@/lib/cms/ids";
import { referencedMediaIds } from "@/lib/cms/media-refs";
import { cms } from "@/lib/cms/repository";
import { sanitizeText } from "@/lib/cms/validation";
import {
  destroyCloudinaryImage,
  isCloudinaryConfigured,
  sanitizeFolder,
  uploadImageBuffer,
} from "@/lib/cloudinary";
import { publicErrorMessage } from "@/lib/security/errors";
import { assertSafeImageUpload, isAllowedCloudinaryImage } from "@/lib/security/image-upload";
import { isSameOriginMutation } from "@/lib/security/origin";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function revalidateMedia() {
  revalidateSidhuCms();
}

export async function GET() {
  const unauthorized = await requireAdminApi(["media", "pages", "blog", "seo", "site_settings"]);
  if (unauthorized) return unauthorized;
  const assets = await cms.listMedia();
  const [settings, posts] = await Promise.all([cms.getSettings(), cms.listPosts()]);
  const usedIds = referencedMediaIds(settings, posts);
  return NextResponse.json({
    ok: true,
    configured: isCloudinaryConfigured(),
    assets: assets.map((asset) => ({
      ...asset,
      inUse: usedIds.has(asset.id),
    })),
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(["media", "pages", "blog", "seo", "site_settings"]);
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
    if (!isAllowedCloudinaryImage(uploaded)) {
      return jsonError("Cloudinary returned an unsupported image type.");
    }
    const asset = await cms.addMedia({
      id: createId("media"),
      publicId: uploaded.publicId,
      secureUrl: uploaded.secureUrl,
      folder,
      originalFilename: safeName,
      format: uploaded.format,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      resourceType: uploaded.resourceType,
      createdAt: new Date().toISOString(),
      alt,
    });
    revalidateMedia();
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    return jsonError(publicErrorMessage(error, "Cloudinary upload failed."), 502);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireAdminApi(["media", "pages", "blog", "seo", "site_settings"]);
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
  const settings = await cms.getSettings();
  const posts = await cms.listPosts();
  if (referencedMediaIds(settings, posts).has(id)) {
    return jsonError(
      "This image is used as logo, favicon, OG, payment icon, or a blog image. Unassign it first.",
      409,
    );
  }
  try {
    await destroyCloudinaryImage(asset.publicId);
    await cms.removeMedia(id);
    revalidateMedia();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(publicErrorMessage(error, "Cloudinary delete failed."), 502);
  }
}
