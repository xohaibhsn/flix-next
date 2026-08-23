import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/guards";
import { createId } from "@/lib/cms/ids";
import { cms } from "@/lib/cms/repository";
import {
  destroyCloudinaryImage,
  isCloudinaryConfigured,
  sanitizeFolder,
  uploadImageBuffer,
} from "@/lib/cloudinary";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function revalidateMedia() {
  revalidatePath("/", "layout");
  revalidatePath("/sidhu/media");
  revalidatePath("/sidhu/settings");
}

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const assets = await cms.listMedia();
  const settings = await cms.getSettings();
  const usedIds = [
    settings.branding.logo?.id,
    settings.branding.favicon?.id,
    settings.branding.defaultOgImage?.id,
  ].filter(Boolean) as string[];
  return NextResponse.json({
    ok: true,
    configured: isCloudinaryConfigured(),
    assets: assets.map((asset) => ({
      ...asset,
      inUse: usedIds.includes(asset.id),
    })),
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  if (!isCloudinaryConfigured()) {
    return jsonError(
      "Cloudinary is not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the server environment.",
      503,
    );
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Choose an image file to upload.");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonError("Only JPG, PNG, and WEBP images are allowed.");
  }
  if (file.size > MAX_BYTES) {
    return jsonError("Image must be 5MB or smaller.");
  }
  const folder = sanitizeFolder(String(form.get("folder") || "theflix/site"));
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, "-").slice(0, 80) || "upload";
  try {
    const uploaded = await uploadImageBuffer({
      buffer,
      filename: safeName,
      folder,
    });
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
      alt: "",
    });
    revalidateMedia();
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Cloudinary upload failed.",
      502,
    );
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  if (!isCloudinaryConfigured()) {
    return jsonError(
      "Cloudinary is not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the server environment.",
      503,
    );
  }
  const body = (await request.json()) as { id?: string };
  const id = body.id?.trim();
  if (!id) return jsonError("Missing media id.");
  const asset = await cms.getMediaById(id);
  if (!asset) return jsonError("That media item is not in the library.", 404);
  const settings = await cms.getSettings();
  const used =
    settings.branding.logo?.id === id ||
    settings.branding.favicon?.id === id ||
    settings.branding.defaultOgImage?.id === id;
  if (used) {
    return jsonError(
      "This image is assigned in Site Settings. Remove it from Logo, Favicon, or OG Image first.",
      409,
    );
  }
  try {
    await destroyCloudinaryImage(asset.publicId);
    await cms.removeMedia(id);
    revalidateMedia();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Cloudinary delete failed.",
      502,
    );
  }
}
