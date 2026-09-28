import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compensateFailedCloudinaryUpload,
  persistUploadedCloudinaryMedia,
  type NewlyUploadedCloudinaryImage,
} from "../lib/cms/media-upload";
import type { MediaAsset } from "../lib/cms/types";

function uploaded(overrides: Partial<NewlyUploadedCloudinaryImage> = {}): NewlyUploadedCloudinaryImage {
  return {
    publicId: "theflix/site/new-upload",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/new-upload.jpg",
    width: 100,
    height: 100,
    format: "jpg",
    bytes: 10,
    resourceType: "image",
    ...overrides,
  };
}

function assetFrom(image: NewlyUploadedCloudinaryImage): MediaAsset {
  return {
    id: "media_new",
    publicId: image.publicId,
    secureUrl: image.secureUrl,
    folder: "theflix/site",
    originalFilename: "new-upload.jpg",
    format: image.format,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    resourceType: image.resourceType,
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "",
  };
}

test("successful persist does not destroy Cloudinary asset", async () => {
  const destroys: string[] = [];
  const image = uploaded();
  const saved = await persistUploadedCloudinaryMedia({
    uploaded: image,
    isAllowed: () => true,
    buildAsset: assetFrom,
    addMedia: async (asset) => asset,
    destroyCloudinaryImage: async (publicId) => {
      destroys.push(publicId);
    },
  });
  assert.equal(saved.publicId, image.publicId);
  assert.deepEqual(destroys, []);
});

test("validation failure after upload destroys exactly the new publicId", async () => {
  const destroys: string[] = [];
  const image = uploaded({ publicId: "theflix/site/bad-format" });
  await assert.rejects(
    () =>
      persistUploadedCloudinaryMedia({
        uploaded: image,
        isAllowed: () => false,
        buildAsset: assetFrom,
        addMedia: async (asset) => asset,
        destroyCloudinaryImage: async (publicId) => {
          destroys.push(publicId);
        },
      }),
    /unsupported image type/i,
  );
  assert.deepEqual(destroys, ["theflix/site/bad-format"]);
});

test("DB insert failure destroys new publicId and keeps original error primary", async () => {
  const destroys: string[] = [];
  const image = uploaded({ publicId: "theflix/site/db-fail" });
  await assert.rejects(
    () =>
      persistUploadedCloudinaryMedia({
        uploaded: image,
        isAllowed: () => true,
        buildAsset: assetFrom,
        addMedia: async () => {
          throw new Error("DB insert failed: duplicate key");
        },
        destroyCloudinaryImage: async (publicId) => {
          destroys.push(publicId);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DB insert failed/);
      return true;
    },
  );
  assert.deepEqual(destroys, ["theflix/site/db-fail"]);
});

test("cleanup destroy failure does not overwrite the original persist error", async () => {
  const cleanupErrors: Array<{ publicId: string; message: string }> = [];
  await assert.rejects(
    () =>
      persistUploadedCloudinaryMedia({
        uploaded: uploaded({ publicId: "theflix/site/cleanup-fail" }),
        isAllowed: () => true,
        buildAsset: assetFrom,
        addMedia: async () => {
          throw new Error("primary persistence failure");
        },
        destroyCloudinaryImage: async () => {
          throw new Error("Cloudinary destroy exploded");
        },
        onCleanupFailure: (error, publicId) => {
          cleanupErrors.push({
            publicId,
            message: error instanceof Error ? error.message : "unknown",
          });
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "primary persistence failure");
      return true;
    },
  );
  assert.equal(cleanupErrors.length, 1);
  assert.equal(cleanupErrors[0]?.publicId, "theflix/site/cleanup-fail");
  assert.match(cleanupErrors[0]?.message || "", /destroy exploded/);
});

test("compensate helper skips destroy when no publicId exists", async () => {
  const destroys: string[] = [];
  await compensateFailedCloudinaryUpload("", async (publicId) => {
    destroys.push(publicId);
  });
  await compensateFailedCloudinaryUpload(null, async (publicId) => {
    destroys.push(publicId);
  });
  assert.deepEqual(destroys, []);
});

test("compensation never receives an unrelated existing publicId", async () => {
  const destroys: string[] = [];
  const newId = "theflix/site/only-this-request";
  const existingId = "theflix/branding/logo-existing";
  await assert.rejects(() =>
    persistUploadedCloudinaryMedia({
      uploaded: uploaded({ publicId: newId }),
      isAllowed: () => true,
      buildAsset: assetFrom,
      addMedia: async () => {
        throw new Error("persist failed");
      },
      destroyCloudinaryImage: async (publicId) => {
        destroys.push(publicId);
        assert.notEqual(publicId, existingId);
      },
    }),
  );
  assert.deepEqual(destroys, [newId]);
});
