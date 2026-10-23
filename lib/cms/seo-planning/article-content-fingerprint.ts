/**
 * A2 fingerprint contracts — two differentiated identities.
 *
 * A. Approved article identity (Apply preview/approval/audit)
 *    SHA-256 of JSON.stringify([title, excerpt, html]) after normalizeGeneratedArticle.
 *    Binds reviewed title + excerpt + HTML. Never used as Blog duplicate-body evidence.
 *
 * B. Duplicate-body identity (blog_posts.content_fingerprint column)
 *    Domain-separated SHA-256 of CMS-sanitized article HTML only.
 *    Title/excerpt changes do not change body identity.
 *    Exact-body after sanitizeHtml — not semantic similarity.
 *
 * Client-supplied hashes are never authoritative. Digests are server-owned.
 * sanitizeHtml is used for hash-only canonicalization; backfill must not rewrite stored content.
 */

import { createHash } from "node:crypto";
import {
  normalizeGeneratedArticle,
  type GeneratedArticle,
} from "@/lib/cms/ai-seo/blog-article-openai";
import { GENERATED_ARTICLE_HTML_MAX_CHARS } from "@/lib/cms/ai-seo/config";
import { sanitizeHtml } from "@/lib/cms/html";

/** Approved article identity (Apply trust / audit). */
export const A2_CONTENT_FINGERPRINT_SPEC = "a2-content-fingerprint-v1" as const;
export const A2_APPROVED_ARTICLE_IDENTITY_SPEC = A2_CONTENT_FINGERPRINT_SPEC;
export const A2_CONTENT_FINGERPRINT_VERSION = 1 as const;
export const A2_CONTENT_FINGERPRINT_HEX_CHARS = 64 as const;

/** Duplicate-body identity (Blog column + indexed uniqueness). */
export const A2_BODY_FINGERPRINT_SPEC = "a2-body-fingerprint-v1" as const;
export const A2_BODY_FINGERPRINT_VERSION = 1 as const;
export const A2_BODY_FINGERPRINT_DOMAIN = "a2-body-v1" as const;
/** Max raw HTML length supported for body fingerprinting (matches generation bound). */
export const A2_BODY_FINGERPRINT_MAX_RAW_CHARS = GENERATED_ARTICLE_HTML_MAX_CHARS;

const EMPTY_SHELL_SET = new Set(["", "<p></p>", "<p><br></p>", "<p><br/></p>", "<p>&nbsp;</p>"]);

/** Canonical digest of already-normalized title/excerpt/html (Apply-compatible). */
export function digestNormalizedArticleContentV1(article: {
  title: string;
  excerpt: string;
  html: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([article.title, article.excerpt, article.html]), "utf8")
    .digest("hex");
}

/** Domain-separated body digest over already-canonical HTML. */
export function digestCanonicalBodyHtmlV1(canonicalHtml: string): string {
  return createHash("sha256")
    .update(`${A2_BODY_FINGERPRINT_DOMAIN}\0${canonicalHtml}`, "utf8")
    .digest("hex");
}

export type A2ContentFingerprintSuccess = {
  ok: true;
  spec: typeof A2_CONTENT_FINGERPRINT_SPEC;
  version: typeof A2_CONTENT_FINGERPRINT_VERSION;
  fingerprint: string;
  normalized: GeneratedArticle;
};

export type A2ContentFingerprintFailure = {
  ok: false;
  spec: typeof A2_CONTENT_FINGERPRINT_SPEC;
  code: "invalid_content" | "empty_content" | "oversized_content";
  error: string;
};

export type A2ContentFingerprintResult = A2ContentFingerprintSuccess | A2ContentFingerprintFailure;

/**
 * Approved article identity from raw article shape (title+excerpt+html).
 * Empty / unsafe / oversized → fail closed (no digest invented).
 */
export function fingerprintArticleContent(raw: unknown): A2ContentFingerprintResult {
  if (raw == null || typeof raw !== "object") {
    return {
      ok: false,
      spec: A2_CONTENT_FINGERPRINT_SPEC,
      code: "invalid_content",
      error: "Article content is missing or not an object.",
    };
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.html === "string" && row.html.length > GENERATED_ARTICLE_HTML_MAX_CHARS) {
    return {
      ok: false,
      spec: A2_CONTENT_FINGERPRINT_SPEC,
      code: "oversized_content",
      error: "Article HTML exceeds CMS generation bounds.",
    };
  }
  const normalized = normalizeGeneratedArticle(raw);
  if (!normalized) {
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
    const html = typeof row.html === "string" ? row.html.trim() : "";
    if (!title || !excerpt || !html) {
      return {
        ok: false,
        spec: A2_CONTENT_FINGERPRINT_SPEC,
        code: "empty_content",
        error: "Article title, excerpt, or HTML is empty after normalize.",
      };
    }
    return {
      ok: false,
      spec: A2_CONTENT_FINGERPRINT_SPEC,
      code: "invalid_content",
      error: "Article failed CMS sanitize/bounds checks.",
    };
  }
  const fingerprint = digestNormalizedArticleContentV1(normalized);
  if (fingerprint.length !== A2_CONTENT_FINGERPRINT_HEX_CHARS) {
    return {
      ok: false,
      spec: A2_CONTENT_FINGERPRINT_SPEC,
      code: "invalid_content",
      error: "Fingerprint digest length is unexpected.",
    };
  }
  return {
    ok: true,
    spec: A2_CONTENT_FINGERPRINT_SPEC,
    version: A2_CONTENT_FINGERPRINT_VERSION,
    fingerprint,
    normalized,
  };
}

/**
 * @deprecated Prefer fingerprintApprovedArticleFromStoredFields for approval identity,
 * or fingerprintBlogBodyContent for Blog duplicate-body identity.
 * Kept as approved-article identity over stored title/excerpt/content (not body-only).
 */
export function fingerprintStoredBlogFields(args: {
  title: string;
  excerpt: string;
  content: string;
}): A2ContentFingerprintResult {
  return fingerprintArticleContent({
    title: args.title,
    excerpt: args.excerpt,
    html: args.content,
  });
}

export function fingerprintApprovedArticleFromStoredFields(args: {
  title: string;
  excerpt: string;
  content: string;
}): A2ContentFingerprintResult {
  return fingerprintArticleContent({
    title: args.title,
    excerpt: args.excerpt,
    html: args.content,
  });
}

export type A2BodyFingerprintSuccess = {
  ok: true;
  kind: "fingerprinted";
  spec: typeof A2_BODY_FINGERPRINT_SPEC;
  version: typeof A2_BODY_FINGERPRINT_VERSION;
  fingerprint: string;
  /** Hash-only canonical HTML — must not be written back as a content rewrite. */
  canonicalHtml: string;
};

export type A2BodyFingerprintBlank = {
  ok: true;
  kind: "blank_shell";
  spec: typeof A2_BODY_FINGERPRINT_SPEC;
  version: typeof A2_BODY_FINGERPRINT_VERSION;
  fingerprint: null;
};

export type A2BodyFingerprintFailure = {
  ok: false;
  kind: "unsupported";
  spec: typeof A2_BODY_FINGERPRINT_SPEC;
  code: "invalid_content" | "empty_content" | "oversized_content" | "ambiguous_canonicalization";
  error: string;
};

export type A2BodyFingerprintResult =
  | A2BodyFingerprintSuccess
  | A2BodyFingerprintBlank
  | A2BodyFingerprintFailure;

function isRawEmptyShell(raw: string): boolean {
  return EMPTY_SHELL_SET.has(raw.replace(/\s+/g, "").toLowerCase());
}

/**
 * Duplicate-body identity from Blog/article HTML.
 * Does not require title/excerpt. Does not use AI article normalizer shape checks.
 * Uses sanitizeHtml for deterministic hash-only canonicalization (same sanitizer as Blog saves).
 */
export function fingerprintBlogBodyContent(rawHtml: unknown): A2BodyFingerprintResult {
  if (typeof rawHtml !== "string") {
    return {
      ok: false,
      kind: "unsupported",
      spec: A2_BODY_FINGERPRINT_SPEC,
      code: "invalid_content",
      error: "Blog body HTML is missing or not a string.",
    };
  }
  const stripped = rawHtml.replace(/\0/g, "");
  if (isRawEmptyShell(stripped)) {
    return {
      ok: true,
      kind: "blank_shell",
      spec: A2_BODY_FINGERPRINT_SPEC,
      version: A2_BODY_FINGERPRINT_VERSION,
      fingerprint: null,
    };
  }
  if (stripped.length > A2_BODY_FINGERPRINT_MAX_RAW_CHARS) {
    return {
      ok: false,
      kind: "unsupported",
      spec: A2_BODY_FINGERPRINT_SPEC,
      code: "oversized_content",
      error: "Blog body HTML exceeds supported fingerprint bounds.",
    };
  }
  // Hash-only view — callers must not persist canonicalHtml as a content rewrite.
  const canonicalHtml = sanitizeHtml(stripped);
  if (isRawEmptyShell(canonicalHtml)) {
    // Non-empty raw that sanitizes to a shell is ambiguous for exact-body identity.
    if (!isRawEmptyShell(stripped)) {
      return {
        ok: false,
        kind: "unsupported",
        spec: A2_BODY_FINGERPRINT_SPEC,
        code: "ambiguous_canonicalization",
        error: "Body sanitizes to an empty shell; fingerprint refused.",
      };
    }
    return {
      ok: true,
      kind: "blank_shell",
      spec: A2_BODY_FINGERPRINT_SPEC,
      version: A2_BODY_FINGERPRINT_VERSION,
      fingerprint: null,
    };
  }
  if (!canonicalHtml.trim()) {
    return {
      ok: false,
      kind: "unsupported",
      spec: A2_BODY_FINGERPRINT_SPEC,
      code: "empty_content",
      error: "Body is empty after sanitize.",
    };
  }
  if (canonicalHtml.length > A2_BODY_FINGERPRINT_MAX_RAW_CHARS) {
    return {
      ok: false,
      kind: "unsupported",
      spec: A2_BODY_FINGERPRINT_SPEC,
      code: "oversized_content",
      error: "Canonical body exceeds supported fingerprint bounds.",
    };
  }
  const fingerprint = digestCanonicalBodyHtmlV1(canonicalHtml);
  if (fingerprint.length !== A2_CONTENT_FINGERPRINT_HEX_CHARS) {
    return {
      ok: false,
      kind: "unsupported",
      spec: A2_BODY_FINGERPRINT_SPEC,
      code: "invalid_content",
      error: "Body fingerprint digest length is unexpected.",
    };
  }
  return {
    ok: true,
    kind: "fingerprinted",
    spec: A2_BODY_FINGERPRINT_SPEC,
    version: A2_BODY_FINGERPRINT_VERSION,
    fingerprint,
    canonicalHtml,
  };
}

export function isA2ContentFingerprintHex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
