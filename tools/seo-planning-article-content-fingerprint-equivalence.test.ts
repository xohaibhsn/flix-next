/**
 * A2-5A — Approved-article fingerprint canonicalization equivalence.
 * Offline only. Does not import Blog body writers, backfill, or coordinated migration.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { normalizeGeneratedArticle } from "../lib/cms/ai-seo/blog-article-openai";
import {
  A2_BODY_FINGERPRINT_DOMAIN,
  A2_BODY_FINGERPRINT_SPEC,
  A2_CONTENT_FINGERPRINT_HEX_CHARS,
  A2_CONTENT_FINGERPRINT_SPEC,
  A2_CONTENT_FINGERPRINT_VERSION,
  digestCanonicalBodyHtmlV1,
  digestNormalizedArticleContentV1,
  fingerprintArticleContent,
  fingerprintBlogBodyContent,
  isA2ContentFingerprintHex,
} from "../lib/cms/seo-planning/article-content-fingerprint";
import { fingerprintPrivateApplyContent } from "../lib/cms/seo-planning/article-private-apply-local";
import { SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED } from "../lib/cms/seo-planning/article-apply-production-gate";

/** Historical A2-4 inline approved-article digest (independent of wrappers). */
function legacyInlineApprovedDigest(article: {
  title: string;
  excerpt: string;
  html: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([article.title, article.excerpt, article.html]), "utf8")
    .digest("hex");
}

const SYNTHETIC_BASE = {
  title: "Fix UK IPTV buffering without guesswork",
  excerpt: "A practical UK checklist to isolate home-network buffering causes.",
  html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p>",
} as const;

function normalizedBase() {
  const normalized = normalizeGeneratedArticle({ ...SYNTHETIC_BASE });
  assert.ok(normalized, "synthetic base must normalize");
  return normalized;
}

test("parity: legacy inline digest === digestNormalizedArticleContentV1 === fingerprintPrivateApplyContent", () => {
  const article = normalizedBase();
  const legacy = legacyInlineApprovedDigest(article);
  const canonical = digestNormalizedArticleContentV1(article);
  const delegated = fingerprintPrivateApplyContent(article);
  assert.equal(legacy.length, A2_CONTENT_FINGERPRINT_HEX_CHARS);
  assert.equal(canonical, legacy);
  assert.equal(delegated, legacy);
  assert.equal(isA2ContentFingerprintHex(canonical), true);
});

test("equivalent normalized inputs yield identical approved fingerprints", () => {
  const a = normalizeGeneratedArticle({
    title: "  Same Title  ",
    excerpt: "  Same excerpt.  ",
    html: "<p>Same body content for fingerprint parity.</p>",
  });
  const b = normalizeGeneratedArticle({
    title: "Same Title",
    excerpt: "Same excerpt.",
    html: "<p>Same body content for fingerprint parity.</p>",
  });
  assert.ok(a && b);
  assert.deepEqual(a, b);
  assert.equal(digestNormalizedArticleContentV1(a), digestNormalizedArticleContentV1(b));
  assert.equal(fingerprintPrivateApplyContent(a), fingerprintPrivateApplyContent(b));
  assert.equal(legacyInlineApprovedDigest(a), fingerprintPrivateApplyContent(b));
});

test("changed title / excerpt / meaningful HTML each change approved identity", () => {
  const base = normalizedBase();
  const baseFp = fingerprintPrivateApplyContent(base);

  const titleChanged = normalizeGeneratedArticle({
    ...SYNTHETIC_BASE,
    title: "Different approved title for UK IPTV buffering",
  });
  const excerptChanged = normalizeGeneratedArticle({
    ...SYNTHETIC_BASE,
    excerpt: "A different excerpt that must alter approved identity.",
  });
  const htmlChanged = normalizeGeneratedArticle({
    ...SYNTHETIC_BASE,
    html: "<h2>Start with the local network</h2><p>Check ethernet first, then Wi-Fi congestion during peak hours.</p>",
  });
  assert.ok(titleChanged && excerptChanged && htmlChanged);
  assert.notEqual(fingerprintPrivateApplyContent(titleChanged), baseFp);
  assert.notEqual(fingerprintPrivateApplyContent(excerptChanged), baseFp);
  assert.notEqual(fingerprintPrivateApplyContent(htmlChanged), baseFp);
  assert.equal(
    fingerprintPrivateApplyContent(titleChanged),
    legacyInlineApprovedDigest(titleChanged),
  );
});

test("unicode and whitespace/HTML sanitize stay consistent for approved identity", () => {
  const unicodeRaw = {
    title: "Café IPTV buffering — résumé",
    excerpt: "Readers in São Paulo and Zürich need clear steps.",
    html: "<p>Use “smart quotes” and an em-dash — safely.</p>",
  };
  const normalized = normalizeGeneratedArticle(unicodeRaw);
  assert.ok(normalized);
  const viaCanonical = digestNormalizedArticleContentV1(normalized);
  const viaLegacy = legacyInlineApprovedDigest(normalized);
  const viaHelper = fingerprintPrivateApplyContent(normalized);
  assert.equal(viaCanonical, viaLegacy);
  assert.equal(viaHelper, viaLegacy);

  const messy = normalizeGeneratedArticle({
    title: "Title\u0000 with nul",
    excerpt: "Excerpt",
    html: "<p onclick=\"alert(1)\">Safe text</p><script>evil()</script>",
  });
  // Either rejected or sanitized; never trust raw client hash.
  if (messy) {
    assert.equal(fingerprintPrivateApplyContent(messy), legacyInlineApprovedDigest(messy));
    assert.doesNotMatch(messy.html, /script|onclick/i);
  } else {
    const rejected = fingerprintArticleContent({
      title: "Title\u0000 with nul",
      excerpt: "Excerpt",
      html: "<p onclick=\"alert(1)\">Safe text</p><script>evil()</script>",
    });
    assert.equal(rejected.ok, false);
  }
});

test("no raw-client-hash authority: fingerprintArticleContent owns digest after normalize", () => {
  const forgedClientHash = "a".repeat(64);
  // Extra client hash fields are not accepted as article shape (exact 3 keys).
  const withForgedFields = fingerprintArticleContent({
    ...SYNTHETIC_BASE,
    contentFingerprint: forgedClientHash,
    fingerprint: forgedClientHash,
  });
  assert.equal(withForgedFields.ok, false);

  // Authoritative path: only title/excerpt/html; digest is always server-computed.
  const result = fingerprintArticleContent({ ...SYNTHETIC_BASE });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec, A2_CONTENT_FINGERPRINT_SPEC);
  assert.equal(result.version, A2_CONTENT_FINGERPRINT_VERSION);
  assert.notEqual(result.fingerprint, forgedClientHash);
  assert.equal(result.fingerprint, legacyInlineApprovedDigest(result.normalized));
  assert.equal(result.fingerprint, fingerprintPrivateApplyContent(result.normalized));
});

test("approved identity ≠ body-only Blog duplicate identity", () => {
  const article = normalizedBase();
  const approved = digestNormalizedArticleContentV1(article);
  const body = fingerprintBlogBodyContent(article.html);
  assert.equal(body.ok, true);
  if (!(body.ok && body.kind === "fingerprinted")) {
    assert.fail("expected fingerprinted body");
    return;
  }
  assert.equal(body.spec, A2_BODY_FINGERPRINT_SPEC);
  assert.notEqual(approved, body.fingerprint);
  const domainSeparated = digestCanonicalBodyHtmlV1(body.canonicalHtml);
  assert.equal(domainSeparated, body.fingerprint);
  // Domain separator must be present in the hashed payload construction path.
  assert.equal(A2_BODY_FINGERPRINT_DOMAIN, "a2-body-v1");
  const withoutDomain = createHash("sha256").update(body.canonicalHtml, "utf8").digest("hex");
  assert.notEqual(body.fingerprint, withoutDomain);
  assert.notEqual(approved, withoutDomain);
});

test("invalid article payloads remain rejected through fingerprintArticleContent", () => {
  assert.equal(fingerprintArticleContent(null).ok, false);
  assert.equal(fingerprintArticleContent(undefined).ok, false);
  assert.equal(fingerprintArticleContent({ title: "", excerpt: "", html: "" }).ok, false);
  assert.equal(
    fingerprintArticleContent({ title: "Only title", excerpt: "Only excerpt", html: "" }).ok,
    false,
  );
  assert.equal(
    fingerprintArticleContent({
      title: "T",
      excerpt: "E",
      html: "x".repeat(500_000),
    }).ok,
    false,
  );
});

test("private-Apply helper still binds the same approved digest after normalize", () => {
  const normalized = normalizedBase();
  const expected = legacyInlineApprovedDigest(normalized);
  assert.equal(fingerprintPrivateApplyContent(normalized), expected);
  // Idempotent: repeated calls unchanged.
  assert.equal(fingerprintPrivateApplyContent(normalized), fingerprintPrivateApplyContent(normalized));
});

test("no production activation side effects from fingerprint modules", () => {
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
  void fingerprintPrivateApplyContent(normalizedBase());
  void fingerprintArticleContent(SYNTHETIC_BASE);
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
});
