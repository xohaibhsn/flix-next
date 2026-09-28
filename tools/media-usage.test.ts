import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { defaultSettings } from "../lib/cms/defaults";
import {
  getMediaUsage,
  htmlSrcReferencesAsset,
  referencedMediaIds,
} from "../lib/cms/media-refs";
import type { BlogPost, CmsPage, MediaAsset, SiteSettings } from "../lib/cms/types";

function sampleAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media_hero",
    publicId: "theflix/site/hero-banner",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/hero-banner.jpg",
    folder: "theflix/site",
    originalFilename: "hero-banner.jpg",
    format: "jpg",
    width: 1200,
    height: 630,
    bytes: 1000,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "Hero",
    ...overrides,
  };
}

function emptyContent(overrides: {
  settings?: SiteSettings;
  pages?: CmsPage[];
  posts?: BlogPost[];
} = {}) {
  return {
    settings: overrides.settings || defaultSettings(),
    pages: overrides.pages || [],
    posts: overrides.posts || [],
    categories: [],
  };
}

test("structured MediaRef usage is detected", () => {
  const asset = sampleAsset();
  const settings = defaultSettings();
  settings.branding.logo = {
    id: asset.id,
    publicId: asset.publicId,
    secureUrl: asset.secureUrl,
  };
  const usage = getMediaUsage(asset, emptyContent({ settings }));
  assert.equal(usage.inUse, true);
  assert.ok(usage.references.some((ref) => ref.field === "logo"));
  assert.ok(referencedMediaIds(settings).has(asset.id));
});

test("page rich-content HTML containing asset.secureUrl is detected", () => {
  const asset = sampleAsset();
  const page: CmsPage = {
    id: "page-about",
    name: "About Us",
    slug: "/about-us/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-1",
        type: "rich-content",
        label: "Rich Content",
        order: 1,
        visible: true,
        data: {
          eyebrow: "",
          heading: "",
          html: `<p><img src="${asset.secureUrl}" alt="About" /></p>`,
          buttonLabel: "",
          buttonHref: "",
          width: "narrow",
          scrollable: false,
          scrollHeight: "standard",
          ctaSource: "custom",
        },
      },
    ],
  };
  const usage = getMediaUsage(asset, emptyContent({ pages: [page] }));
  assert.equal(usage.inUse, true);
  assert.ok(usage.references.some((ref) => ref.type === "page-html" && ref.field.includes("rich-content")));
  assert.equal(referencedMediaIds(defaultSettings()).has(asset.id), false);
});

test("transformed Cloudinary URL for the same publicId is detected", () => {
  const asset = sampleAsset();
  const transformed =
    "https://res.cloudinary.com/demo/image/upload/c_fill,w_800,f_auto/v1/theflix/site/hero-banner.jpg";
  assert.equal(htmlSrcReferencesAsset(transformed, asset), true);
  const page: CmsPage = {
    id: "page-home",
    name: "Welcome",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-html",
        type: "rich-content",
        label: "Rich Content",
        order: 1,
        visible: true,
        data: {
          eyebrow: "",
          heading: "",
          html: `<img src="${transformed}" alt="" />`,
          buttonLabel: "",
          buttonHref: "",
          width: "normal",
          scrollable: false,
          scrollHeight: "standard",
          ctaSource: "custom",
        },
      },
    ],
  };
  const usage = getMediaUsage(asset, emptyContent({ pages: [page] }));
  assert.equal(usage.inUse, true);
});

test("blog post content HTML containing asset.secureUrl is detected", () => {
  const asset = sampleAsset();
  const post = {
    id: "post_1",
    title: "Firestick Guide",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "",
    content: `<p><img src="${asset.secureUrl}" alt="Setup" /></p>`,
    categoryId: null,
    featuredImage: null,
    status: "published" as const,
    featured: false,
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
  };
  const usage = getMediaUsage(asset, emptyContent({ posts: [post] }));
  assert.equal(usage.inUse, true);
  assert.ok(usage.references.some((ref) => ref.type === "post-html" && ref.field === "content"));
});

test("completely unused asset returns inUse false and empty references", () => {
  const asset = sampleAsset({ id: "media_unused", publicId: "theflix/site/unused-only" });
  const usage = getMediaUsage(asset, emptyContent());
  assert.equal(usage.inUse, false);
  assert.deepEqual(usage.references, []);
});

test("unrelated Cloudinary asset is not falsely matched", () => {
  const asset = sampleAsset();
  const other =
    "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/hero-banner-extra.jpg";
  assert.equal(htmlSrcReferencesAsset(other, asset), false);
  const sibling = sampleAsset({
    id: "media_other",
    publicId: "theflix/site/hero-banner-extra",
    secureUrl: other,
  });
  const page: CmsPage = {
    id: "page-about",
    name: "About Us",
    slug: "/about-us/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-1",
        type: "rich-content",
        label: "Rich Content",
        order: 1,
        visible: true,
        data: {
          eyebrow: "",
          heading: "",
          html: `<img src="${other}" alt="Other" />`,
          buttonLabel: "",
          buttonHref: "",
          width: "narrow",
          scrollable: false,
          scrollHeight: "standard",
          ctaSource: "custom",
        },
      },
    ],
  };
  assert.equal(getMediaUsage(asset, emptyContent({ pages: [page] })).inUse, false);
  assert.equal(getMediaUsage(sibling, emptyContent({ pages: [page] })).inUse, true);
});

test("structured references remain protected alongside HTML", () => {
  const asset = sampleAsset();
  const settings = defaultSettings();
  settings.pageSeo.subscriptions.ogImage = {
    id: asset.id,
    publicId: asset.publicId,
    secureUrl: asset.secureUrl,
  };
  const usage = getMediaUsage(asset, emptyContent({ settings }));
  assert.equal(usage.inUse, true);
  assert.ok(usage.references.some((ref) => ref.type === "pageSeo" && ref.field === "ogImage"));
});

test("DELETE route evaluates usage before any Cloudinary or DB delete", () => {
  const route = readFileSync(path.join(process.cwd(), "app/api/sidhu/media/route.ts"), "utf8");
  assert.match(route, /loadMediaUsageContent/);
  assert.match(route, /cms\.listPages\(\)/);
  const deleteFn = route.slice(route.indexOf("export async function DELETE"));
  const usageIdx = deleteFn.indexOf("getMediaUsage(asset, content)");
  const rejectIdx = deleteFn.indexOf("usage.inUse");
  const destroyIdx = deleteFn.indexOf("await destroyCloudinaryImage");
  const removeIdx = deleteFn.indexOf("await cms.removeMedia");
  assert.ok(usageIdx > 0);
  assert.ok(rejectIdx > usageIdx);
  assert.ok(destroyIdx > rejectIdx);
  assert.ok(removeIdx > destroyIdx);
  assert.match(deleteFn, /409/);
});
