import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  extractHtmlImages,
  isFilenameLikeAlt,
  isUrlLikeAlt,
  scanImageDiagnostics,
} from "../lib/cms/image-diagnostics";
import { defaultSettings } from "../lib/cms/defaults";
import type { BlogPost, CmsPage, MediaAsset, SiteSettings } from "../lib/cms/types";

function media(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-1",
    publicId: "theflix/site/hero",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/hero.jpg",
    folder: "theflix/site",
    originalFilename: "hero.jpg",
    format: "jpg",
    width: 1200,
    height: 630,
    bytes: 1000,
    resourceType: "image",
    createdAt: "2024-01-01T00:00:00.000Z",
    alt: "Clear descriptive hero alt",
    ...overrides,
  };
}

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-1",
    title: "How to Watch IPTV on Firestick",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "Excerpt",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: {
      id: "media-1",
      publicId: "theflix/site/hero",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/hero.jpg",
    },
    status: "published",
    featured: false,
    publishedAt: "2024-01-01T00:00:00.000Z",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
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
    ...overrides,
  };
}

function scan(partial: {
  settings?: SiteSettings;
  pages?: CmsPage[];
  posts?: BlogPost[];
  media?: MediaAsset[];
}) {
  return scanImageDiagnostics({
    settings: partial.settings || defaultSettings(),
    pages: partial.pages || [],
    posts: partial.posts || [],
    categories: [],
    media: partial.media || [],
  });
}

test("meaningful image with valid alt is VALID", () => {
  const asset = media({ alt: "Install IPTV on Firestick" });
  const report = scan({
    media: [asset],
    posts: [
      post({
        content: `<p><img src="${asset.secureUrl}" alt="Install IPTV on Firestick" /></p>`,
      }),
    ],
  });
  const html = report.findings.find((f) => f.sourceType === "article-html");
  assert.ok(html);
  assert.ok(html?.issues.includes("VALID") || html?.primaryIssue === "VALID");
  assert.equal(html?.issues.includes("HTML_ALT_STALE"), false);
});

test("meaningful image missing alt attribute", () => {
  const asset = media();
  const report = scan({
    media: [asset],
    posts: [post({ content: `<p><img src="${asset.secureUrl}" /></p>` })],
  });
  const html = report.findings.find((f) => f.sourceType === "article-html");
  assert.ok(html?.issues.includes("HTML_ALT_MISSING"));
  assert.ok(html?.issues.includes("MISSING_ALT"));
});

test("content image with empty alt", () => {
  const asset = media();
  const report = scan({
    media: [asset],
    posts: [post({ content: `<p><img src="${asset.secureUrl}" alt="" /></p>` })],
  });
  const html = report.findings.find((f) => f.sourceType === "article-html");
  assert.ok(html?.issues.includes("EMPTY_CONTENT_ALT"));
});

test("blog hero stored alt present is VALID", () => {
  const asset = media({ alt: "Firestick setup photo" });
  const report = scan({ media: [asset], posts: [post()] });
  const hero = report.findings.find((f) => f.sourceType === "blog-hero");
  assert.equal(hero?.renderedAlt, "Firestick setup photo");
  assert.ok(hero?.issues.includes("VALID"));
  assert.equal(hero?.issues.includes("FALLBACK_ALT"), false);
});

test("blog hero fallback to post title", () => {
  const asset = media({ alt: "" });
  const report = scan({ media: [asset], posts: [post()] });
  const hero = report.findings.find((f) => f.sourceType === "blog-hero");
  assert.equal(hero?.renderedAlt, "How to Watch IPTV on Firestick");
  assert.ok(hero?.issues.includes("FALLBACK_ALT"));
  assert.ok(hero?.issues.includes("MEDIA_ALT_NOT_SET"));
});

test("decorative blog listing alt empty is DECORATIVE_OK", () => {
  const asset = media();
  const report = scan({ media: [asset], posts: [post()] });
  const listing = report.findings.find((f) => f.sourceType === "blog-listing");
  assert.ok(listing?.issues.includes("DECORATIVE_OK"));
  assert.equal(listing?.issues.includes("MISSING_ALT"), false);
});

test("media alt blank is MEDIA_ALT_NOT_SET", () => {
  const report = scan({ media: [media({ alt: "" })] });
  const row = report.findings.find((f) => f.sourceType === "media");
  assert.ok(row?.issues.includes("MEDIA_ALT_NOT_SET"));
});

test("inserted HTML alt differs from media alt is HTML_ALT_STALE", () => {
  const asset = media({ alt: "Current library alt" });
  const report = scan({
    media: [asset],
    posts: [post({ content: `<img src="${asset.secureUrl}" alt="Old insertion alt" />` })],
  });
  const html = report.findings.find((f) => f.sourceType === "article-html");
  assert.ok(html?.issues.includes("HTML_ALT_STALE"));
  assert.match(html?.note || "", /Current Media alt/);
});

test("filename-like and URL-like alt helpers", () => {
  assert.equal(isFilenameLikeAlt("IMG_2026.jpg"), true);
  assert.equal(isFilenameLikeAlt("firestick-banner-1200x630.png"), true);
  assert.equal(isFilenameLikeAlt("Firestick on TV cabinet"), false);
  assert.equal(isUrlLikeAlt("https://res.cloudinary.com/demo/image/upload/x.jpg"), true);
});

test("filename-like alt classified on content image", () => {
  const asset = media({ alt: "ok" });
  const report = scan({
    media: [asset],
    posts: [post({ content: `<img src="${asset.secureUrl}" alt="image123.jpg" />` })],
  });
  const html = report.findings.find((f) => f.sourceType === "article-html");
  assert.ok(html?.issues.includes("FILENAME_ALT"));
});

test("brand/logo alt is BRAND_OK and not duplicate-penalized alone", () => {
  const settings = defaultSettings();
  settings.branding.logo = {
    id: "logo-1",
    publicId: "brand/logo",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/brand/logo.png",
  };
  settings.branding.logoAlt = "Flix IPTV";
  const report = scan({
    settings,
    media: [media({ id: "logo-1", publicId: "brand/logo", secureUrl: settings.branding.logo.secureUrl, alt: "Flix IPTV" })],
  });
  const brand = report.findings.find((f) => f.sourceType === "brand");
  assert.ok(brand?.issues.includes("BRAND_OK"));
});

test("decorative payment icons not marked missing", () => {
  const settings = defaultSettings();
  settings.footerPaymentImages = [
    { id: "pay-1", publicId: "pay/visa", secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/pay/visa.png" },
  ];
  const report = scan({
    settings,
    media: [media({ id: "pay-1", publicId: "pay/visa", secureUrl: settings.footerPaymentImages[0].secureUrl, alt: "" })],
  });
  const decor = report.findings.find((f) => f.sourceType === "decorative");
  assert.ok(decor?.issues.includes("DECORATIVE_OK"));
  assert.equal(decor?.issues.includes("MISSING_ALT"), false);
});

test("social-only OG image classification", () => {
  const settings = defaultSettings();
  settings.branding.defaultOgImage = {
    id: "og-1",
    publicId: "og/default",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/og/default.png",
  };
  const report = scan({
    settings,
    media: [media({ id: "og-1", publicId: "og/default", secureUrl: settings.branding.defaultOgImage.secureUrl })],
  });
  const social = report.findings.find((f) => f.sourceType === "social");
  assert.ok(social?.issues.includes("SOCIAL_ONLY"));
  assert.equal(social?.semantic, "SOCIAL_ONLY");
});

test("unmatched external image flagged", () => {
  const report = scan({
    posts: [post({ featuredImage: null, content: '<img src="https://example.com/external.png" alt="Ext" />' })],
  });
  const html = report.findings.find((f) => f.sourceType === "article-html");
  assert.ok(html?.issues.includes("UNMATCHED_EXTERNAL"));
});

test("edit-source and edit-media mapping", () => {
  const asset = media();
  const p = post();
  const report = scan({ media: [asset], posts: [p] });
  const hero = report.findings.find((f) => f.sourceType === "blog-hero");
  assert.equal(hero?.editHref, `/sidhu/blog/${p.id}/`);
  assert.equal(hero?.editMediaHref, "/sidhu/media/");
  const mediaRow = report.findings.find((f) => f.sourceType === "media");
  assert.equal(mediaRow?.editMediaHref, "/sidhu/media/");
});

test("extractHtmlImages distinguishes missing vs empty alt", () => {
  const imgs = extractHtmlImages('<img src="/a.jpg"><img src="/b.jpg" alt="">');
  assert.equal(imgs[0].altAttributeMissing, true);
  assert.equal(imgs[1].altAttributeMissing, false);
  assert.equal(imgs[1].alt, "");
});

test("Sidhu image diagnostics route wired; no auto-fix", () => {
  const root = process.cwd();
  const page = readFileSync(path.join(root, "app/sidhu/(protected)/seo/image-diagnostics/page.tsx"), "utf8");
  const seoNav = readFileSync(path.join(root, "lib/cms/sidhu-seo-nav.ts"), "utf8");
  const report = readFileSync(path.join(root, "components/sidhu/ImageDiagnosticsReport.tsx"), "utf8");
  assert.match(page, /scanImageDiagnostics/);
  assert.match(seoNav, /\/sidhu\/seo\/image-diagnostics\//);
  assert.doesNotMatch(report, /Fix Automatically|auto-fix|Generate alt|bulk fix/i);
  assert.match(report, /Edit media/);
  assert.match(report, /Edit source/);
});
