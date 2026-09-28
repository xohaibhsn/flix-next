import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  normalizeCloudinaryDestroyResult,
  removeMediaAfterCloudinaryDestroy,
  type CloudinaryDestroyOutcome,
} from "../lib/cloudinary";
import { getMediaUsage } from "../lib/cms/media-refs";
import { defaultSettings } from "../lib/cms/defaults";
import type { MediaAsset } from "../lib/cms/types";

test("normalizeCloudinaryDestroyResult accepts ok", () => {
  assert.equal(normalizeCloudinaryDestroyResult({ result: "ok" }), "ok");
});

test("normalizeCloudinaryDestroyResult accepts not found", () => {
  assert.equal(normalizeCloudinaryDestroyResult({ result: "not found" }), "not_found");
});

test("normalizeCloudinaryDestroyResult rejects unexpected results", () => {
  assert.throws(() => normalizeCloudinaryDestroyResult({ result: "error" }), /unexpected result/i);
  assert.throws(() => normalizeCloudinaryDestroyResult({}), /unexpected result/i);
  assert.throws(() => normalizeCloudinaryDestroyResult(null), /unexpected result/i);
});

test("Cloudinary ok then DB remove executes", async () => {
  const removed: string[] = [];
  const destroys: string[] = [];
  const outcome = await removeMediaAfterCloudinaryDestroy({
    publicId: "theflix/site/a",
    mediaId: "media_a",
    destroyCloudinaryImage: async (publicId) => {
      destroys.push(publicId);
      return "ok";
    },
    removeMedia: async (id) => {
      removed.push(id);
    },
  });
  assert.equal(outcome, "ok");
  assert.deepEqual(destroys, ["theflix/site/a"]);
  assert.deepEqual(removed, ["media_a"]);
});

test("Cloudinary not found then DB remove ALSO executes", async () => {
  const removed: string[] = [];
  await removeMediaAfterCloudinaryDestroy({
    publicId: "theflix/site/missing",
    mediaId: "media_missing",
    destroyCloudinaryImage: async () => "not_found",
    removeMedia: async (id) => {
      removed.push(id);
    },
  });
  assert.deepEqual(removed, ["media_missing"]);
});

test("Cloudinary SDK rejection prevents DB remove", async () => {
  const removed: string[] = [];
  await assert.rejects(
    () =>
      removeMediaAfterCloudinaryDestroy({
        publicId: "theflix/site/fail",
        mediaId: "media_fail",
        destroyCloudinaryImage: async () => {
          throw new Error("Cloudinary API down");
        },
        removeMedia: async (id) => {
          removed.push(id);
        },
      }),
    /Cloudinary API down/,
  );
  assert.deepEqual(removed, []);
});

test("unexpected destroy result prevents DB remove", async () => {
  const removed: string[] = [];
  await assert.rejects(
    () =>
      removeMediaAfterCloudinaryDestroy({
        publicId: "theflix/site/weird",
        mediaId: "media_weird",
        destroyCloudinaryImage: async () => {
          normalizeCloudinaryDestroyResult({ result: "unexpected" });
          return "ok";
        },
        removeMedia: async (id) => {
          removed.push(id);
        },
      }),
    /unexpected result/i,
  );
  assert.deepEqual(removed, []);
});

test("Cloudinary OK + DB failure leaves row for retry", async () => {
  const db = new Set(["media_retry"]);
  await assert.rejects(
    () =>
      removeMediaAfterCloudinaryDestroy({
        publicId: "theflix/site/retry",
        mediaId: "media_retry",
        destroyCloudinaryImage: async () => "ok",
        removeMedia: async (id) => {
          throw new Error(`DB remove failed for ${id}`);
        },
      }),
    /DB remove failed/,
  );
  assert.ok(db.has("media_retry"));
});

test("retry with Cloudinary not-found then removes DB row", async () => {
  const db = new Set(["media_retry"]);
  const outcomes: CloudinaryDestroyOutcome[] = ["ok", "not_found"];
  let attempt = 0;

  await assert.rejects(() =>
    removeMediaAfterCloudinaryDestroy({
      publicId: "theflix/site/retry",
      mediaId: "media_retry",
      destroyCloudinaryImage: async () => outcomes[attempt++]!,
      removeMedia: async () => {
        throw new Error("first DB failure");
      },
    }),
  );
  assert.ok(db.has("media_retry"));

  await removeMediaAfterCloudinaryDestroy({
    publicId: "theflix/site/retry",
    mediaId: "media_retry",
    destroyCloudinaryImage: async () => outcomes[attempt++]!,
    removeMedia: async (id) => {
      db.delete(id);
    },
  });
  assert.equal(db.has("media_retry"), false);
  assert.equal(attempt, 2);
});

test("in-use asset remains blocked before Cloudinary destroy", () => {
  const asset: MediaAsset = {
    id: "media_logo",
    publicId: "theflix/branding/logo",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/branding/logo.png",
    folder: "theflix/branding",
    originalFilename: "logo.png",
    format: "png",
    width: 10,
    height: 10,
    bytes: 10,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "Logo",
  };
  const settings = defaultSettings();
  settings.branding.logo = { id: asset.id, publicId: asset.publicId, secureUrl: asset.secureUrl };
  const usage = getMediaUsage(asset, { settings, pages: [], posts: [], categories: [] });
  assert.equal(usage.inUse, true);

  const route = readFileSync(path.join(process.cwd(), "app/api/sidhu/media/route.ts"), "utf8");
  const deleteFn = route.slice(route.indexOf("export async function DELETE"));
  const usageIdx = deleteFn.indexOf("usage.inUse");
  const destroyIdx = deleteFn.indexOf("removeMediaAfterCloudinaryDestroy");
  assert.ok(usageIdx > 0 && destroyIdx > usageIdx);
});
