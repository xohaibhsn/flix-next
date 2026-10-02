import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoHealthReport } from "../components/sidhu/SeoHealthReport";
import { defaultSettings } from "../lib/cms/defaults";
import {
  buildSeoHealthReport,
  runSeoHealthScan,
  seoHealthStatusMessage,
  summarizeSeoHealthFindings,
  type SeoHealthInput,
  type SeoHealthReader,
} from "../lib/cms/seo-health";
import type { BlogPost, MediaAsset } from "../lib/cms/types";

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-health",
    title: "SEO Health Test Article",
    slug: "seo-health-test-article",
    excerpt: "A sufficiently descriptive excerpt for the unified SEO health test article.",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "SEO Health Test Article | Flix IPTV",
    seoDescription: "A sufficiently descriptive search summary for the unified SEO health test article and its checks.",
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

function sampleMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-health",
    publicId: "theflix/health/image",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/health/image.jpg",
    folder: "theflix/health",
    originalFilename: "health-image.jpg",
    format: "jpg",
    width: 1200,
    height: 630,
    bytes: 1000,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "",
    ...overrides,
  };
}

function issueInput(): SeoHealthInput {
  const settings = defaultSettings();
  settings.pageSeo.contact.canonicalUrl = "not a url at all";
  const media = sampleMedia();
  const post = samplePost({
    content: `<p><a href="/missing-health-target/">Missing destination</a><img src="${media.secureUrl}"></p>`,
  });
  return {
    settings,
    pages: [],
    posts: [post],
    categories: [],
    redirects: [],
    media: [media],
  };
}

test("unified health result represents all three authoritative scanners with correct links", () => {
  const report = buildSeoHealthReport(issueInput());
  const malformed = report.findings.find((finding) => finding.issueCode === "CANONICAL_MALFORMED");
  const broken = report.findings.find((finding) => finding.issueCode === "BROKEN");
  const missingAlt = report.findings.find((finding) => finding.issueCode === "HTML_ALT_MISSING");

  assert.ok(malformed);
  assert.equal(malformed.source, "metadata");
  assert.equal(malformed.severity, "needs-attention");
  assert.equal(malformed.category, "canonical-indexing");
  assert.equal(malformed.reviewHref, "/sidhu/pages/contact/");
  assert.equal(malformed.detailHref, "/sidhu/seo/metadata-diagnostics/");

  assert.ok(broken);
  assert.equal(broken.source, "internal-link");
  assert.equal(broken.severity, "needs-attention");
  assert.equal(broken.reviewHref, "/sidhu/blog/post-health/");
  assert.equal(broken.detailHref, "/sidhu/seo/internal-links/");

  assert.ok(missingAlt);
  assert.equal(missingAlt.source, "image");
  assert.equal(missingAlt.severity, "needs-attention");
  assert.equal(missingAlt.reviewHref, "/sidhu/blog/post-health/");
  assert.equal(missingAlt.detailHref, "/sidhu/seo/image-diagnostics/");
});

test("normalization is deterministic, conservative, and does not mutate scanner input", () => {
  const input = issueInput();
  const before = structuredClone(input);
  const first = buildSeoHealthReport(input);
  const second = buildSeoHealthReport(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.findings.some((finding) => finding.issueCode === "MISSING_ALT"), false);
  assert.equal(first.findings.some((finding) => finding.issueCode === "EXTERNAL"), false);
  assert.equal(first.findings.some((finding) => finding.severity === "healthy"), false);

  const mediaAlt = first.findings.find((finding) => finding.issueCode === "MEDIA_ALT_NOT_SET");
  assert.equal(mediaAlt?.severity, "editorial");
  assert.equal(mediaAlt?.action, "suggested");
});

test("one manual run loads each CMS dataset exactly once through a read-only contract", async () => {
  const input = issueInput();
  const calls = {
    getSettings: 0,
    listPages: 0,
    listPosts: 0,
    listCategories: 0,
    listRedirects: 0,
    listMedia: 0,
  };
  const reader: SeoHealthReader = {
    async getSettings() {
      calls.getSettings += 1;
      return input.settings;
    },
    async listPages() {
      calls.listPages += 1;
      return input.pages;
    },
    async listPosts() {
      calls.listPosts += 1;
      return input.posts;
    },
    async listCategories() {
      calls.listCategories += 1;
      return input.categories;
    },
    async listRedirects() {
      calls.listRedirects += 1;
      return input.redirects;
    },
    async listMedia() {
      calls.listMedia += 1;
      return input.media;
    },
  };

  const report = await runSeoHealthScan(reader);
  assert.ok(report.findings.length > 0);
  assert.deepEqual(calls, {
    getSettings: 1,
    listPages: 1,
    listPosts: 1,
    listCategories: 1,
    listRedirects: 1,
    listMedia: 1,
  });
});

test("healthy/no-issue summary is calm, compact, and is not a score", () => {
  const summary = summarizeSeoHealthFindings([], {
    metadata: 3,
    "internal-link": 7,
    image: 5,
  });
  assert.equal(summary.noActionNeeded, true);
  assert.equal(summary.healthy, 15);
  assert.equal(summary.total, 15);
  assert.equal(seoHealthStatusMessage(summary), "No SEO issues needing action were found in this scan.");

  const idleHtml = renderToStaticMarkup(createElement(SeoHealthReport, { report: null }));
  assert.match(idleHtml, /No scan has run yet/);
  assert.doesNotMatch(idleHtml, /Scan summary/);

  const healthyHtml = renderToStaticMarkup(
    createElement(SeoHealthReport, { report: { findings: [], summary } }),
  );
  assert.match(healthyHtml, /No SEO issues needing action were found/);
  assert.match(healthyHtml, /Healthy \/ No Action Needed/);
  assert.match(healthyHtml, />15</);
  assert.doesNotMatch(healthyHtml, /\b\d{1,3}\s*\/\s*100\b/);
});

test("health route is manual-only and the service reuses scanners without write paths", () => {
  const root = process.cwd();
  const service = readFileSync(path.join(root, "lib/cms/seo-health.ts"), "utf8");
  const page = readFileSync(path.join(root, "app/sidhu/(protected)/seo/health/page.tsx"), "utf8");
  const report = readFileSync(path.join(root, "components/sidhu/SeoHealthReport.tsx"), "utf8");
  const form = readFileSync(path.join(root, "components/sidhu/SeoForm.tsx"), "utf8");

  assert.match(service, /metadata: scanMetadataDiagnostics\(/);
  assert.match(service, /internalLinks: scanInternalLinks\(/);
  assert.match(service, /images: scanImageDiagnostics\(/);
  assert.doesNotMatch(service, /from ["']@\/lib\/cms\/(?:actions|repository)["']/);
  assert.doesNotMatch(service, /\bfetch\s*\(/);
  assert.doesNotMatch(service, /\b(?:create|update|delete|save|upsert)[A-Z]\w*\s*\(/);

  assert.match(page, /const runRequested =/);
  assert.match(page, /runRequested \? await runSeoHealthScan\(cms\) : null/);
  assert.match(report, /<form action="\/sidhu\/seo\/health\/" method="get">/);
  assert.match(report, /name="run"/);
  assert.match(report, /value="1"/);
  assert.match(report, /No scan has run yet/);
  assert.match(form, /\/sidhu\/seo\/health\//);

  for (const href of [
    "/sidhu/seo/metadata-diagnostics/",
    "/sidhu/seo/internal-links/",
    "/sidhu/seo/image-diagnostics/",
  ]) {
    assert.match(report, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(report, /\b\d{1,3}\s*\/\s*100\b/);
});
