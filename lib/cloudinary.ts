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
  if (
    !id ||
    id.includes("..") ||
    id.includes("\\") ||
    (!id.startsWith("theflix/") && !id.startsWith("theflix/"))
  ) {
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

export async function destroyCloudinaryImage(publicId: string) {
  const client = configuredClient();
  const safeId = assertSafePublicId(publicId);
  return client.uploader.destroy(safeId, { resource_type: "image" });
}
