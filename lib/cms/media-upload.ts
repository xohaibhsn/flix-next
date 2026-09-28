import type { MediaAsset } from "@/lib/cms/types";

export type NewlyUploadedCloudinaryImage = {
  publicId: string;
  secureUrl: string;
  width: number | null;
  height: number | null;
  format: string;
  bytes: number | null;
  resourceType: string;
};

/**
 * Best-effort destroy for a Cloudinary publicId created by the current upload request.
 * Never throws — cleanup failure is reported via onCleanupFailure so the original error stays primary.
 */
export async function compensateFailedCloudinaryUpload(
  publicId: string | null | undefined,
  destroyCloudinaryImage: (publicId: string) => Promise<unknown>,
  onCleanupFailure?: (error: unknown, publicId: string) => void,
): Promise<void> {
  const id = String(publicId || "").trim();
  if (!id) return;
  try {
    await destroyCloudinaryImage(id);
  } catch (error) {
    onCleanupFailure?.(error, id);
  }
}

/**
 * After Cloudinary upload succeeds: validate, persist Media Library row, or destroy the new publicId on failure.
 */
export async function persistUploadedCloudinaryMedia(options: {
  uploaded: NewlyUploadedCloudinaryImage;
  isAllowed: (uploaded: NewlyUploadedCloudinaryImage) => boolean;
  buildAsset: (uploaded: NewlyUploadedCloudinaryImage) => MediaAsset;
  addMedia: (asset: MediaAsset) => Promise<MediaAsset>;
  destroyCloudinaryImage: (publicId: string) => Promise<unknown>;
  onCleanupFailure?: (error: unknown, publicId: string) => void;
}): Promise<MediaAsset> {
  const { uploaded } = options;
  let persisted = false;
  try {
    if (!options.isAllowed(uploaded)) {
      throw new Error("Cloudinary returned an unsupported image type.");
    }
    const asset = await options.addMedia(options.buildAsset(uploaded));
    persisted = true;
    return asset;
  } catch (error) {
    if (!persisted) {
      await compensateFailedCloudinaryUpload(
        uploaded.publicId,
        options.destroyCloudinaryImage,
        options.onCleanupFailure,
      );
    }
    throw error;
  }
}
