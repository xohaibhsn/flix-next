import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { sanitizePost } from "../lib/cms/validation";
import {
  buildPrePublishCandidateFingerprint,
  classifyInternalHref,
  evaluatePrePublishQa,
  hrefMatchesBlogPath,
  isEmptyBlogContent,
  isMeaningfulBlogTitle,
  isValidNormalizedSlug,
  prePublishBlocksPersist,
  resolvePrePublishMode,
} from "../lib/cms/seo-prepublish-qa";
import type { BlogPost, MediaAsset } from "../lib/cms/types";

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-qa-1",
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "Learn how to set up IPTV on Firestick, add your subscription details, and fix common playback problems.",
    content:
      "<p>Setup steps for Firestick IPTV.</p><p>See also <a href=\"/blogs/getting-started/\">Getting Started</a>.</p><h2>Requirements</h2><p>More detail for readers.</p>",
    categoryId: "cat-setup",
    featuredImage: {
      id: "media-featured",
      publicId: "theflix/site/firestick",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/firestick.jpg",
    },
    status: "draft",
    featured: false,
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "How to Watch IPTV on Firestick: Complete Setup Guide",
    seoDescription:
      "Learn how to watch IPTV on Firestick, install a compatible IPTV player, set up your subscription, and fix common issues.",
    focusKeyword: "firestick iptv",
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
    id: "media-featured",
    publicId: "theflix/site/firestick",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/site/firestick.jpg",
    folder: "theflix/site",
    originalFilename: "firestick.jpg",
    format: "jpg",
    width: 1200,
    height: 630,
    bytes: 1000,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "Amazon Firestick on a TV stand",
    ...overrides,
  };
}

function runQa(args: {
  raw: BlogPost;
  previous?: BlogPost | null;
  posts?: BlogPost[];
  featuredMedia?: MediaAsset | null;
  ogMedia?: MediaAsset | null;
  confirmationFingerprint?: string | null;
}) {
  const candidate = sanitizePost(args.raw);
  return evaluatePrePublishQa({
    previous: args.previous === undefined ? null : args.previous,
    raw: args.raw,
    candidate,
    posts: args.posts || [],
    featuredMedia:
      args.featuredMedia === undefined
        ? candidate.featuredImage?.id
          ? sampleMedia({ id: candidate.featuredImage.id })
          : null
        : args.featuredMedia,
    ogMedia:
      args.ogMedia === undefined
        ? candidate.ogImage?.id
          ? sampleMedia({ id: candidate.ogImage.id })
          : null
        : args.ogMedia,
    confirmationFingerprint: args.confirmationFingerprint,
  });
}

test("resolvePrePublishMode covers transitions", () => {
  const draft = samplePost({ status: "draft" });
  const published = samplePost({ status: "published" });
  assert.equal(resolvePrePublishMode(null, { ...draft, status: "published" }), "full");
  assert.equal(resolvePrePublishMode(draft, { ...draft, status: "published" }), "full");
  assert.equal(resolvePrePublishMode(published, published), "regression");
  assert.equal(resolvePrePublishMode(published, draft), "skip");
  assert.equal(resolvePrePublishMode(draft, draft), "skip");
});

test("clean draft→published passes without confirmation", () => {
  const raw = samplePost({ status: "published", publishedAt: "2026-08-30T00:00:00.000Z" });
  const result = runQa({ raw, previous: samplePost({ status: "draft" }) });
  assert.equal(result.mode, "full");
  assert.equal(result.status, "pass");
  assert.equal(result.confirmationRequired, false);
  assert.equal(prePublishBlocksPersist(result), false);
  assert.ok(result.passes.some((p) => p.code === "PREPUB_H1_TEMPLATE"));
});

test("blank and placeholder content blocks", () => {
  for (const content of ["", "<p></p>", "<p>   </p>", "<div></div>"]) {
    const result = runQa({
      raw: samplePost({ status: "published", content }),
    });
    assert.equal(result.status, "blocked");
    assert.ok(result.blockers.some((b) => b.code === "PREPUB_CONTENT_EMPTY"));
  }
  assert.equal(isEmptyBlogContent("<p></p>"), true);
  assert.equal(isEmptyBlogContent("<p>Real text</p>"), false);
});

test("meaningless title blocks even if sanitize would invent Untitled", () => {
  assert.equal(isMeaningfulBlogTitle("", "Untitled"), false);
  const result = runQa({
    raw: samplePost({ status: "published", title: "", slug: "something-ok" }),
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((b) => b.code === "PREPUB_TITLE_MISSING"));
});

test("duplicate and invalid slug block", () => {
  const other = samplePost({ id: "post-other", slug: "taken-slug", status: "published" });
  const dup = runQa({
    raw: samplePost({ status: "published", slug: "taken-slug" }),
    posts: [other],
  });
  assert.ok(dup.blockers.some((b) => b.code === "PREPUB_SLUG_DUPLICATE"));

  assert.equal(isValidNormalizedSlug(""), false);
  assert.equal(isValidNormalizedSlug("untitled"), false);
  assert.equal(isValidNormalizedSlug("how-to-watch-iptv-on-firestick"), true);
});

test("published slug change blocks", () => {
  const previous = samplePost({ status: "published", slug: "how-to-watch-iptv-on-firestick" });
  const result = runQa({
    previous,
    raw: samplePost({
      status: "published",
      slug: "firestick-iptv-new-slug",
      publishedAt: "2026-08-30T00:00:00.000Z",
    }),
  });
  assert.equal(result.mode, "regression");
  assert.ok(result.blockers.some((b) => b.code === "PREPUB_PUBLISHED_SLUG_CHANGED"));
});

test("canonical blank passes; malformed blocks; other-path warns", () => {
  const blank = runQa({
    raw: samplePost({ status: "published", canonicalUrl: "" }),
  });
  assert.equal(blank.status, "pass");
  assert.ok(blank.passes.some((p) => p.code === "PREPUB_CANONICAL_SELF"));

  const malformed = runQa({
    raw: samplePost({ status: "published", canonicalUrl: "not a url ::" }),
  });
  assert.ok(malformed.blockers.some((b) => b.code === "PREPUB_CANONICAL_MALFORMED"));

  const other = runQa({
    raw: samplePost({ status: "published", canonicalUrl: "/welcome/" }),
  });
  assert.equal(other.status, "warnings");
  assert.ok(other.warnings.some((w) => w.code === "PREPUB_CANONICAL_TO_OTHER"));
  assert.equal(other.confirmationRequired, true);
});

test("robots noindex and sitemap warnings require confirmation; confirm publishes", () => {
  const raw = samplePost({
    status: "published",
    robotsIndex: false,
    sitemapInclude: true,
  });
  const first = runQa({ raw });
  assert.equal(first.status, "warnings");
  assert.ok(first.warnings.some((w) => w.code === "PREPUB_PUBLISHED_NOINDEX"));
  assert.ok(first.warnings.some((w) => w.code === "PREPUB_NOINDEX_SITEMAP"));
  assert.equal(prePublishBlocksPersist(first), true);

  const confirmed = runQa({
    raw,
    confirmationFingerprint: first.candidateFingerprint,
  });
  assert.equal(confirmed.status, "pass");
  assert.equal(confirmed.confirmationRequired, false);
  assert.equal(prePublishBlocksPersist(confirmed), false);

  const edited = runQa({
    raw: { ...raw, title: `${raw.title} Edited` },
    confirmationFingerprint: first.candidateFingerprint,
  });
  assert.equal(edited.status, "warnings");
  assert.notEqual(edited.candidateFingerprint, first.candidateFingerprint);
});

test("fingerprint ignores volatile timestamps", () => {
  const a = sanitizePost(samplePost({ status: "published" }));
  const b = sanitizePost(
    samplePost({
      status: "published",
      updatedAt: "2099-01-01T00:00:00.000Z",
      createdAt: "2099-01-01T00:00:00.000Z",
      publishedAt: "2099-01-01T00:00:00.000Z",
    }),
  );
  // sanitize overwrites updatedAt; compare fingerprint builder stability on shared editorial fields
  const fa = buildPrePublishCandidateFingerprint({ ...a, updatedAt: "2020-01-01T00:00:00.000Z", publishedAt: null });
  const fb = buildPrePublishCandidateFingerprint({ ...b, updatedAt: "2099-01-01T00:00:00.000Z", publishedAt: "2099-01-01T00:00:00.000Z" });
  assert.equal(fa, fb);
  const fc = buildPrePublishCandidateFingerprint({ ...a, title: "Changed Title For Fingerprint" });
  assert.notEqual(fa, fc);
});

test("broken featured/OG refs block; missing featured warns", () => {
  const brokenFeatured = runQa({
    raw: samplePost({ status: "published" }),
    featuredMedia: null,
  });
  assert.ok(brokenFeatured.blockers.some((b) => b.code === "PREPUB_FEATURED_MEDIA_BROKEN"));

  const brokenOg = runQa({
    raw: samplePost({
      status: "published",
      ogImage: {
        id: "media-og-missing",
        publicId: "x",
        secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/x.jpg",
      },
    }),
    ogMedia: null,
  });
  assert.ok(brokenOg.blockers.some((b) => b.code === "PREPUB_OG_MEDIA_BROKEN"));

  const missingFeatured = runQa({
    raw: samplePost({ status: "published", featuredImage: null }),
    featuredMedia: null,
  });
  assert.equal(missingFeatured.status, "warnings");
  assert.ok(missingFeatured.warnings.some((w) => w.code === "PREPUB_FEATURED_MISSING"));
});

test("media alt quality warning", () => {
  const result = runQa({
    raw: samplePost({ status: "published" }),
    featuredMedia: sampleMedia({ alt: "IMG_1234.jpg" }),
  });
  assert.ok(result.warnings.some((w) => w.code === "PREPUB_MEDIA_ALT"));
});

test("description missing and length warnings; duplicate metadata", () => {
  const missingDesc = runQa({
    raw: samplePost({ status: "published", seoDescription: "", excerpt: "" }),
  });
  assert.ok(missingDesc.warnings.some((w) => w.code === "PREPUB_DESCRIPTION_MISSING"));

  const other = samplePost({
    id: "post-other",
    status: "published",
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    seoTitle: "How to Watch IPTV on Firestick: Complete Setup Guide",
    seoDescription:
      "Learn how to watch IPTV on Firestick, install a compatible IPTV player, set up your subscription, and fix common issues.",
  });
  const dup = runQa({
    raw: samplePost({ status: "published", id: "post-qa-1" }),
    posts: [other],
  });
  assert.ok(dup.warnings.some((w) => w.code === "PREPUB_DUPLICATE_TITLE"));
  assert.ok(dup.warnings.some((w) => w.code === "PREPUB_DUPLICATE_SEO_TITLE"));
  assert.ok(dup.warnings.some((w) => w.code === "PREPUB_DUPLICATE_DESCRIPTION"));
});

test("internal links: relative and absolute same-origin count; external does not; self-link warns", () => {
  assert.equal(classifyInternalHref("/blogs/getting-started/"), "internal");
  assert.equal(classifyInternalHref("https://theflixiptv.com/welcome/"), "internal");
  assert.equal(classifyInternalHref("https://example.com/x"), "external");
  assert.equal(classifyInternalHref("mailto:a@b.com"), "ignore");
  assert.equal(hrefMatchesBlogPath("/blogs/how-to-watch-iptv-on-firestick/", "how-to-watch-iptv-on-firestick"), true);
  assert.equal(
    hrefMatchesBlogPath("https://theflixiptv.com/blogs/how-to-watch-iptv-on-firestick/", "how-to-watch-iptv-on-firestick"),
    true,
  );

  const absoluteOnly = runQa({
    raw: samplePost({
      status: "published",
      content:
        '<p>Read more on <a href="https://theflixiptv.com/welcome/">Welcome</a>.</p><h2>More</h2><p>Body text for length.</p>',
    }),
  });
  assert.ok(!absoluteOnly.warnings.some((w) => w.code === "PREPUB_INTERNAL_LINKS_ZERO"));

  const externalOnly = runQa({
    raw: samplePost({
      status: "published",
      content: '<p>See <a href="https://example.com/guide">external</a>.</p><h2>More</h2><p>Body text for length.</p>',
    }),
  });
  assert.ok(externalOnly.warnings.some((w) => w.code === "PREPUB_INTERNAL_LINKS_ZERO"));

  const self = runQa({
    raw: samplePost({
      status: "published",
      content:
        '<p><a href="https://theflixiptv.com/blogs/how-to-watch-iptv-on-firestick/">Self</a></p><h2>More</h2><p>Body</p>',
    }),
  });
  assert.ok(self.warnings.some((w) => w.code === "PREPUB_SELF_LINK"));
});

test("no body H1 required — healthy Firestick-like article not falsely blocked", () => {
  const firestickLike = runQa({
    previous: samplePost({ status: "published", publishedAt: "2026-08-30T00:00:00.000Z" }),
    raw: samplePost({
      status: "published",
      publishedAt: "2026-08-30T00:00:00.000Z",
      content: `<p>Setup guide body without any h1 tags.</p>
<p>Internal <a href="https://theflixiptv.com/iptv-subscription-uk/">subscription</a> link.</p>
<h2>What You Need</h2><p>Detail</p>
<h2>Step by Step</h2><p>Detail</p>`,
      canonicalUrl: "",
    }),
  });
  assert.equal(firestickLike.mode, "regression");
  assert.equal(firestickLike.status, "pass");
  assert.equal(firestickLike.blockers.length, 0);
});

test("draft→draft and published→draft skip blocking QA", () => {
  const draftSave = runQa({
    previous: samplePost({ status: "draft" }),
    raw: samplePost({ status: "draft", title: "", content: "<p></p>" }),
  });
  assert.equal(draftSave.mode, "skip");
  assert.equal(draftSave.status, "pass");
  assert.equal(prePublishBlocksPersist(draftSave), false);

  const unpublish = runQa({
    previous: samplePost({ status: "published" }),
    raw: samplePost({ status: "draft" }),
  });
  assert.equal(unpublish.mode, "skip");
  assert.equal(prePublishBlocksPersist(unpublish), false);
});

test("published→published soft warnings do not require confirmation; noindex regression does", () => {
  const previous = samplePost({ status: "published", robotsIndex: true, publishedAt: "2026-08-30T00:00:00.000Z" });
  const soft = runQa({
    previous,
    raw: samplePost({
      status: "published",
      publishedAt: "2026-08-30T00:00:00.000Z",
      seoDescription: "short",
      featuredImage: null,
    }),
    featuredMedia: null,
  });
  assert.equal(soft.mode, "regression");
  assert.equal(soft.status, "pass");
  assert.equal(soft.confirmationRequired, false);

  const noindex = runQa({
    previous,
    raw: samplePost({
      status: "published",
      publishedAt: "2026-08-30T00:00:00.000Z",
      robotsIndex: false,
    }),
  });
  assert.equal(noindex.status, "warnings");
  assert.ok(noindex.warnings.some((w) => w.code === "PREPUB_PUBLISHED_NOINDEX"));
});

test("confirmation cannot bypass a new blocker on re-run", () => {
  const raw = samplePost({ status: "published", robotsIndex: false });
  const first = runQa({ raw });
  assert.equal(first.status, "warnings");
  const blockedOnConfirm = runQa({
    raw: { ...raw, content: "<p></p>" },
    confirmationFingerprint: first.candidateFingerprint,
  });
  // fingerprint mismatch → warnings path first; even with matching fp empty content blocks
  const matchFp = runQa({
    raw: { ...raw, content: "<p></p>" },
  });
  const withConfirm = runQa({
    raw: { ...raw, content: "<p></p>" },
    confirmationFingerprint: matchFp.candidateFingerprint,
  });
  assert.equal(withConfirm.status, "blocked");
  assert.ok(withConfirm.blockers.some((b) => b.code === "PREPUB_CONTENT_EMPTY"));
  void blockedOnConfirm;
});

test("source wiring: savePostAction gates before savePost and preserves post-save advisory", () => {
  const actions = readFileSync(path.join(process.cwd(), "lib/cms/actions.ts"), "utf8");
  const start = actions.indexOf("export async function savePostAction");
  const end = actions.indexOf("export async function deletePostAction");
  const body = actions.slice(start, end);
  assert.match(body, /getPostById/);
  assert.match(body, /sanitizePost/);
  assert.match(body, /evaluatePrePublishQa/);
  assert.match(body, /prePublishBlocksPersist/);
  assert.match(body, /prePublishConfirmationFingerprint/);
  assert.match(body, /cms\.savePost/);
  assert.match(body, /evaluatePostSeoPostSave/);
  const qaAt = body.indexOf("evaluatePrePublishQa");
  const saveAt = body.indexOf("cms.savePost");
  assert.ok(qaAt > -1 && saveAt > qaAt);

  const editor = readFileSync(path.join(process.cwd(), "components/sidhu/BlogEditor.tsx"), "utf8");
  assert.match(editor, /SeoPrePublishQaPanel/);
  assert.match(editor, /prePublishConfirmationFingerprint/);
  assert.match(editor, /pendingConfirmFingerprint/);

  const panel = readFileSync(path.join(process.cwd(), "components/sidhu/SeoPrePublishQaPanel.tsx"), "utf8");
  assert.match(panel, /Publish Anyway/);
  assert.match(panel, /Pre-Publish SEO QA/);

  const helper = readFileSync(path.join(process.cwd(), "lib/cms/seo-prepublish-qa.ts"), "utf8");
  assert.doesNotMatch(helper, /requestOpenAi|requestGemini|buildUkGscEvidencePack|web_search|cloudinary\.uploader/);
  assert.match(helper, /server-only/);
});

test("title length warning uses editorial helpers", () => {
  const short = runQa({
    raw: samplePost({
      status: "published",
      title: "Short title here",
      seoTitle: "Short title here",
    }),
  });
  assert.ok(short.warnings.some((w) => w.code === "PREPUB_TITLE_LENGTH"));
});
