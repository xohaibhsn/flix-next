import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoPostSaveAdvisoryPanel } from "../components/sidhu/SeoPostSaveAdvisoryPanel";
import { emptyCategorySeoFields } from "../lib/cms/category-seo";
import { defaultSettings } from "../lib/cms/defaults";
import {
  buildSeoPostSaveAdvisory,
  classifyEntityScopedMetadataIssues,
  evaluateCategorySeoPostSave,
  evaluateMediaAltPostSave,
  evaluatePageSeoPostSave,
  evaluatePostSeoPostSave,
  safeSeoPostSaveAdvisory,
  unavailableSeoPostSaveAdvisory,
} from "../lib/cms/seo-post-save-guard";
import { METADATA_ISSUE_DEFINITIONS } from "../lib/cms/seo-health";
import type { BlogCategory, BlogPost, MediaAsset, PageSeo } from "../lib/cms/types";

function samplePageSeo(overrides: Partial<PageSeo> = {}): PageSeo {
  return {
    title: "Contact Flix IPTV Support Team",
    description: "Contact Flix IPTV on WhatsApp for plans, payment details, setup help, and UK streaming questions.",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
    customJsonLd: "",
    ...overrides,
  };
}

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-guard",
    title: "How to Watch IPTV on Firestick Successfully",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "A practical guide covering Firestick setup steps, app choices, and playback tips for Flix IPTV.",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "How to Watch IPTV on Firestick Successfully",
    seoDescription: "A practical guide covering Firestick setup steps, app choices, and playback tips for Flix IPTV subscribers.",
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

function sampleCategory(overrides: Partial<BlogCategory> = {}): BlogCategory {
  return {
    id: "cat-guard",
    name: "IPTV Device Setup Guides",
    slug: "setup",
    description: "Practical guides for setting up IPTV apps, devices, and playlists.",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...emptyCategorySeoFields(),
    seoTitle: "IPTV Device Setup Guides",
    seoDescription: "Practical guides for setting up IPTV apps, devices, and playlists, including Firestick installation help.",
    ...overrides,
  };
}

function sampleMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-guard",
    publicId: "theflix/site/sample",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/sample.jpg",
    folder: "theflix/site",
    originalFilename: "sample-image.jpg",
    format: "jpg",
    width: 1200,
    height: 630,
    bytes: 1000,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "Living room TV showing a streaming home screen",
    ...overrides,
  };
}

test("healthy page SEO save returns compact no-problem advisory", () => {
  const findings = evaluatePageSeoPostSave({
    key: "contact",
    seo: samplePageSeo(),
    siteName: "Flix IPTV",
  });
  const advisory = buildSeoPostSaveAdvisory(findings);
  assert.equal(advisory.status, "healthy");
  assert.equal(advisory.findings.length, 0);
  assert.match(advisory.message, /No important SEO problems found/i);
});

test("weak metadata returns same TITLE_SHORT rule as SEO Health", () => {
  const findings = evaluatePageSeoPostSave({
    key: "contact",
    seo: samplePageSeo({ title: "Contact", description: "Contact Flix IPTV on WhatsApp for plans, payment details, and setup help today." }),
    siteName: "Flix IPTV",
    fallbackTitle: "Contact",
  });
  assert.ok(findings.some((f) => f.issueCode === "TITLE_SHORT"));
  assert.equal(findings.find((f) => f.issueCode === "TITLE_SHORT")?.severity, METADATA_ISSUE_DEFINITIONS.TITLE_SHORT.severity);
  assert.equal(findings.find((f) => f.issueCode === "TITLE_SHORT")?.title, METADATA_ISSUE_DEFINITIONS.TITLE_SHORT.title);
});

test("canonical/noindex conflict is needs-attention review-class NOINDEX_SITEMAP when applicable", () => {
  const issues = classifyEntityScopedMetadataIssues({
    effectiveTitle: "Refund Policy Details for Flix IPTV",
    effectiveDescription: "Flix IPTV refund rules, including the 7-day money-back guarantee for annual plans and above.",
    storedCanonical: "",
    publicPath: "/refund-policy/",
    robotsIndex: false,
    sitemapInclude: true,
  });
  assert.ok(issues.includes("NOINDEX_SITEMAP_INCLUDED"));
  assert.equal(METADATA_ISSUE_DEFINITIONS.NOINDEX_SITEMAP_INCLUDED.severity, "review");
});

test("malformed canonical maps to CANONICAL_MALFORMED needs-attention", () => {
  const issues = classifyEntityScopedMetadataIssues({
    effectiveTitle: "About Flix IPTV Streaming Service",
    effectiveDescription: "Learn what Flix IPTV is and how UK streaming subscriptions work for home viewers.",
    storedCanonical: "not a url at all",
    publicPath: "/about-us/",
    robotsIndex: true,
    sitemapInclude: true,
  });
  assert.ok(issues.includes("CANONICAL_MALFORMED"));
  assert.equal(METADATA_ISSUE_DEFINITIONS.CANONICAL_MALFORMED.severity, "needs-attention");
});

test("editorial warning does not imply save failure — advisory stays advisory", () => {
  const findings = evaluatePostSeoPostSave({
    post: samplePost({ seoTitle: "Short", seoDescription: "Short desc" }),
    siteName: "Flix IPTV",
  });
  const advisory = buildSeoPostSaveAdvisory(findings);
  assert.equal(advisory.status, "findings");
  assert.ok(advisory.findings.every((f) => f.severity === "editorial" || f.severity === "review" || f.severity === "needs-attention"));
  // No throw / no mutation API — pure advisory only.
  assert.equal(typeof advisory.message, "string");
});

test("advisory failure helper never throws and leaves a calm unavailable message", () => {
  const advisory = safeSeoPostSaveAdvisory(() => {
    throw new Error("boom");
  });
  assert.equal(advisory.status, "unavailable");
  assert.match(advisory.message, /SEO advisory could not be generated/i);
  assert.deepEqual(unavailableSeoPostSaveAdvisory().findings, []);
});

test("blog-post save evaluator is entity-scoped (no full-scan imports in evaluator path)", () => {
  const findings = evaluatePostSeoPostSave({
    post: samplePost({ seoTitle: "Hi", seoDescription: "Tiny" }),
    siteName: "Flix IPTV",
  });
  assert.ok(findings.some((f) => f.issueCode === "TITLE_SHORT"));
  // Only this post's title/description — no duplicate-title corpus codes.
  assert.equal(findings.some((f) => f.issueCode === "DUPLICATE_TITLE"), false);
  assert.equal(findings.some((f) => f.issueCode === "DUPLICATE_ALT_HINT"), false);
});

test("category save evaluator is entity-scoped", () => {
  const findings = evaluateCategorySeoPostSave({
    category: sampleCategory({ seoTitle: "Setup", seoDescription: "Short" }),
    siteName: "Flix IPTV",
  });
  assert.ok(findings.some((f) => f.issueCode === "TITLE_SHORT"));
  assert.equal(findings.some((f) => f.issueCode === "CANONICAL_COLLISION"), false);
});

test("media alt save evaluator is entity-scoped", () => {
  const blank = evaluateMediaAltPostSave({ asset: sampleMedia({ alt: "" }) });
  assert.ok(blank.some((f) => f.issueCode === "MEDIA_ALT_NOT_SET"));
  const filename = evaluateMediaAltPostSave({ asset: sampleMedia({ alt: "sample-image.jpg" }) });
  assert.ok(filename.some((f) => f.issueCode === "FILENAME_ALT"));
  const healthy = evaluateMediaAltPostSave({
    asset: sampleMedia({ alt: "Living room TV showing a streaming home screen" }),
  });
  assert.equal(healthy.length, 0);
});

test("post-save guard source does not call full SEO Health scanners", () => {
  const src = readFileSync(path.join(process.cwd(), "lib/cms/seo-post-save-guard.ts"), "utf8");
  assert.doesNotMatch(src, /runSeoHealthScan|buildSeoHealthReport|scanMetadataDiagnostics|scanImageDiagnostics|scanInternalLinks/);
  assert.doesNotMatch(src, /fetch\(|http\.|https\.|XMLHttpRequest/);
  assert.doesNotMatch(src, /saveSeoHealthState|acceptSeoHealthFinding|seo_health_state/);
});

test("save actions attach advisory without mutating fields or health state", () => {
  const actions = readFileSync(path.join(process.cwd(), "lib/cms/actions.ts"), "utf8");
  assert.match(actions, /seoAdvisory/);
  assert.match(actions, /evaluatePageSeoPostSave|evaluatePostSeoPostSave|evaluateCategorySeoPostSave/);
  assert.doesNotMatch(actions, /runSeoHealthScan|saveSeoHealthState|acceptSeoHealthFinding/);
  // Advisory is computed after save/revalidate — does not rewrite SEO fields.
  assert.doesNotMatch(actions, /seoTitle\s*=\s*[`'"]/);
});

test("media PATCH returns advisory without rewriting alt beyond the save", () => {
  const route = readFileSync(path.join(process.cwd(), "app/api/sidhu/media/route.ts"), "utf8");
  assert.match(route, /evaluateMediaAltPostSave/);
  assert.match(route, /seoAdvisory/);
  assert.doesNotMatch(route, /runSeoHealthScan|scanImageDiagnostics/);
});

test("advisory UI renders healthy and finding states without a fake score", () => {
  const healthy = renderToStaticMarkup(
    createElement(SeoPostSaveAdvisoryPanel, {
      advisory: buildSeoPostSaveAdvisory([]),
    }),
  );
  assert.match(healthy, /SEO check after save/);
  assert.match(healthy, /No important SEO problems found/);
  assert.doesNotMatch(healthy, /score|Score|\/100/);

  const findings = evaluatePageSeoPostSave({
    key: "contact",
    seo: samplePageSeo({ title: "Contact", description: "Too short" }),
    siteName: "Flix IPTV",
    fallbackTitle: "Contact",
  });
  const withFindings = renderToStaticMarkup(
    createElement(SeoPostSaveAdvisoryPanel, {
      advisory: buildSeoPostSaveAdvisory(findings),
    }),
  );
  assert.match(withFindings, /Open SEO Health/);
  assert.match(withFindings, /Editorial suggestion|Needs attention|Review/);
});

test("auth permission strings on save paths remain unchanged", () => {
  const actions = readFileSync(path.join(process.cwd(), "lib/cms/actions.ts"), "utf8");
  assert.match(actions, /savePageSeoAction[\s\S]*requireAdminAction\("seo"\)/);
  assert.match(actions, /savePostAction[\s\S]*requireAdminAction\("blog"\)/);
  assert.match(actions, /saveCategoryAction[\s\S]*requireAdminAction\("blog"\)/);
  const media = readFileSync(path.join(process.cwd(), "app/api/sidhu/media/route.ts"), "utf8");
  assert.match(media, /requireAdminApi\(MEDIA_API_PERMISSIONS\)/);
});

test("default fixtures remain untouched by this module", () => {
  const settings = defaultSettings();
  assert.ok(settings.siteName);
  assert.equal(typeof settings.pageSeo.contact.title, "string");
});
