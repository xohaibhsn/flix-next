import { MEDIA_UPLOAD } from "@/lib/media-specs";

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const RIFF = Buffer.from("RIFF", "ascii");
const WEBP = Buffer.from("WEBP", "ascii");

function extensionOf(filename: string) {
  const name = filename.trim().toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function looksLikeJpeg(buffer: Buffer) {
  return buffer.length > 3 && buffer.subarray(0, 3).equals(JPEG);
}

function looksLikePng(buffer: Buffer) {
  return buffer.length > 8 && buffer.subarray(0, 4).equals(PNG);
}

function looksLikeWebp(buffer: Buffer) {
  return buffer.length > 12 && buffer.subarray(0, 4).equals(RIFF) && buffer.subarray(8, 12).equals(WEBP);
}

export function assertSafeImageUpload(file: File, buffer: Buffer) {
  if (file.size > MEDIA_UPLOAD.maxBytes || buffer.length > MEDIA_UPLOAD.maxBytes) {
    throw new Error(`Image must be ${MEDIA_UPLOAD.maxLabel} or smaller.`);
  }
  const ext = extensionOf(file.name);
  if (!MEDIA_UPLOAD.extensions.includes(ext as (typeof MEDIA_UPLOAD.extensions)[number])) {
    throw new Error("Only JPG, PNG, and WEBP images are allowed.");
  }
  if (!MEDIA_UPLOAD.mimeTypes.includes(file.type as (typeof MEDIA_UPLOAD.mimeTypes)[number])) {
    throw new Error("Only JPG, PNG, and WEBP images are allowed.");
  }

  const jpeg = looksLikeJpeg(buffer);
  const png = looksLikePng(buffer);
  const webp = looksLikeWebp(buffer);
  if (!jpeg && !png && !webp) {
    throw new Error("That file is not a valid JPG, PNG, or WEBP image.");
  }
  if (file.type === "image/jpeg" && !jpeg) throw new Error("JPEG contents do not match the file type.");
  if (file.type === "image/png" && !png) throw new Error("PNG contents do not match the file type.");
  if (file.type === "image/webp" && !webp) throw new Error("WEBP contents do not match the file type.");
}

export function isAllowedCloudinaryImage(result: {
  resourceType?: string;
  format?: string;
  secureUrl?: string;
}) {
  const format = (result.format || "").toLowerCase();
  const url = result.secureUrl || "";
  return (
    (result.resourceType || "image") === "image" &&
    ["jpg", "jpeg", "png", "webp"].includes(format) &&
    url.startsWith("https://res.cloudinary.com/")
  );
}
