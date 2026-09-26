import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MEDIA_API_PERMISSIONS,
  applyMediaAltUpdate,
  contentImageAlt,
  mediaCloudinaryFields,
  sanitizeMediaAlt,
  withMediaWriteAuth,
} from "../lib/cms/media-alt";
import type { MediaAsset } from "../lib/cms/types";

function sampleAsset(alt = "Firestick home screen"): MediaAsset {
  return {
    id: "media-1",
    publicId: "theflix/site/firestick",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/theflix/site/firestick.jpg",
    folder: "theflix/site",
    originalFilename: "firestick.jpg",
    format: "jpg",
    width: 1200,
    height: 800,
    bytes: 12345,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt,
  };
}

test("authorized media alt update succeeds and keeps Cloudinary fields", () => {
  const asset = sampleAsset("");
  const result = withMediaWriteAuth(null, () => applyMediaAltUpdate(asset, "Amazon Firestick setup"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.alt, "Amazon Firestick setup");
  assert.equal(result.next.alt, "Amazon Firestick setup");
  assert.deepEqual(mediaCloudinaryFields(result.next), mediaCloudinaryFields(asset));
});

test("empty alt is allowed for decorative images", () => {
  const result = applyMediaAltUpdate(sampleAsset("Old alt"), "");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.alt, "");
  assert.equal(result.next.alt, "");
});

test("surrounding whitespace is trimmed", () => {
  assert.equal(sanitizeMediaAlt("  Firestick setup  "), "Firestick setup");
  const result = applyMediaAltUpdate(sampleAsset(""), "  Firestick setup  ");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.alt, "Firestick setup");
});

test("nonexistent media ID is handled safely", () => {
  const result = applyMediaAltUpdate(null, "Firestick");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 404);
  assert.match(result.error, /not in the library/i);
});

test("unauthorized media alt updates are rejected", () => {
  const denied = withMediaWriteAuth({ ok: false, error: "Unauthorized" }, () => applyMediaAltUpdate(sampleAsset(), "x"));
  assert.deepEqual(denied, { ok: false, error: "Unauthorized" });
  const forbidden = withMediaWriteAuth({ ok: false, error: "Access denied." }, () =>
    applyMediaAltUpdate(sampleAsset(), "x"),
  );
  assert.deepEqual(forbidden, { ok: false, error: "Access denied." });
  assert.deepEqual(MEDIA_API_PERMISSIONS, ["media", "pages", "blog", "seo", "site_settings"]);
});

test("Cloudinary identity fields stay unchanged when alt is saved", () => {
  const asset = sampleAsset("before");
  const result = applyMediaAltUpdate(asset, "after");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.next.publicId, asset.publicId);
  assert.equal(result.next.secureUrl, asset.secureUrl);
  assert.equal(result.next.folder, asset.folder);
  assert.equal(result.next.width, asset.width);
  assert.equal(result.next.height, asset.height);
  assert.equal(result.next.format, asset.format);
  assert.equal(result.next.id, asset.id);
});

test("content image alt uses stored media alt and otherwise keeps the fallback", () => {
  assert.equal(contentImageAlt("Firestick home screen", "How to watch IPTV on Firestick"), "Firestick home screen");
  assert.equal(contentImageAlt("  ", "How to watch IPTV on Firestick"), "How to watch IPTV on Firestick");
  assert.equal(contentImageAlt("", "How to watch IPTV on Firestick"), "How to watch IPTV on Firestick");
  assert.equal(contentImageAlt(undefined, "How to watch IPTV on Firestick"), "How to watch IPTV on Firestick");
});
