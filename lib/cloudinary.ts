import { v2 as cloudinary } from "cloudinary";

const ALLOWED_FOLDERS = [
  "theflix/branding",
  "theflix/og",
  "theflix/site",
] as const;

export type CloudinaryFolder = (typeof ALLOWED_FOLDERS)[number];

export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "dehknghwm";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "";
  return { cloudName, apiKey, apiSecret };
}

export function isCloudinaryConfigured() {
  const { apiKey, apiSecret } = getCloudinaryConfig();
  return Boolean(apiKey && apiSecret);
}

function configuredClient() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Add CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in environment variables.",
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return cloudinary;
}

export function sanitizeFolder(value: string | null | undefined): CloudinaryFolder {
  if (value && ALLOWED_FOLDERS.includes(value as CloudinaryFolder)) {
    return value as CloudinaryFolder;
  }
  return "theflix/site";
}

function assertSafePublicId(publicId: string) {
  const id = publicId.trim();
  if (!id || id.includes("..") || id.includes("\\") || !id.startsWith("theflix/")) {
    throw new Error("Invalid Cloudinary public ID.");
  }
  return id;
}

export async function uploadImageBuffer(options: {
  buffer: Buffer;
  filename: string;
  folder: CloudinaryFolder;
}) {
  const client = configuredClient();
  return new Promise<{
    publicId: string;
    secureUrl: string;
    width: number | null;
    height: number | null;
    format: string;
    bytes: number | null;
    resourceType: string;
  }>((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        filename_override: options.filename.replace(/\.[^.]+$/, "").slice(0, 80),
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed."));
          return;
        }
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          width: result.width ?? null,
          height: result.height ?? null,
          format: result.format ?? "",
          bytes: result.bytes ?? null,
          resourceType: result.resource_type ?? "image",
        });
      },
    );
    stream.end(options.buffer);
  });
}

export type CloudinaryDestroyOutcome = "ok" | "not_found";

export function normalizeCloudinaryDestroyResult(result: unknown): CloudinaryDestroyOutcome {
  const value =
    result && typeof result === "object" && "result" in result
      ? String((result as { result?: unknown }).result ?? "")
          .trim()
          .toLowerCase()
      : "";
  if (value === "ok") return "ok";
  if (value === "not found") return "not_found";
  throw new Error("Cloudinary destroy returned an unexpected result.");
}

export async function destroyCloudinaryImage(publicId: string): Promise<CloudinaryDestroyOutcome> {
  const client = configuredClient();
  const safeId = assertSafePublicId(publicId);
  const raw = await client.uploader.destroy(safeId, { resource_type: "image" });
  return normalizeCloudinaryDestroyResult(raw);
}

/**
 * Cloudinary-first Media Library delete step: destroy remote (ok/not found), then remove DB row.
 * Call only after usage checks have passed.
 */
export async function removeMediaAfterCloudinaryDestroy(options: {
  publicId: string;
  mediaId: string;
  destroyCloudinaryImage: (publicId: string) => Promise<CloudinaryDestroyOutcome>;
  removeMedia: (id: string) => Promise<void>;
}): Promise<CloudinaryDestroyOutcome> {
  const outcome = await options.destroyCloudinaryImage(options.publicId);
  await options.removeMedia(options.mediaId);
  return outcome;
}
