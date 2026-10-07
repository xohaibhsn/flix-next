/**
 * Deterministic Pre-Publish SEO QA for Blog posts.
 * Provider-free, GSC-free, network-free. Server authority at publish boundary.
 */

import "server-only";

import { createHash } from "node:crypto";
import { blogPostPath } from "@/lib/cms/blog-paths";
import {
  isFilenameLikeAlt,
  isPlaceholderAlt,
  isUrlLikeAlt,
} from "@/lib/cms/image-diagnostics";
import {
  editorialDescriptionHint,
  editorialTitleHint,
  normalizeMetadataText,
  parseCanonicalTarget,
} from "@/lib/cms/metadata-diagnostics";
import { withSlash } from "@/lib/cms/redirects";
import type {
  PrePublishIssue,
  PrePublishMode,
  PrePublishQaResult,
} from "@/lib/cms/seo-prepublish-qa-types";
import {
  SIDHU_SEO_PUBLIC_ORIGIN,
  sidhuCanonicalIssue,
  sidhuPlainText,
} from "@/lib/cms/sidhu-seo-preview";
import { slugify } from "@/lib/cms/slug";
import type { BlogPost, MediaAsset, MediaRef } from "@/lib/cms/types";

export type {
  PrePublishIssue,
  PrePublishIssueCode,
  PrePublishMode,
  PrePublishQaResult,
  PrePublishQaStatus,
  PrePublishSeverity,
} from "@/lib/cms/seo-prepublish-qa-types";

export type PrePublishQaInput = {
  previous: BlogPost | null;
  /** Submitted post before sanitize — used for title emptiness. */
  raw: BlogPost;
  /** Sanitized candidate that would be persisted. */
  candidate: BlogPost;
  posts: readonly BlogPost[];
  featuredMedia: MediaAsset | null;
  ogMedia: MediaAsset | null;
  /** When true, warnings may be acknowledged (fingerprint must match separately). */
  confirmationFingerprint?: string | null;
};

const LONG_FORM_PLAIN_TEXT_MIN = 600;
const MEANINGLESS_TITLES = new Set(["untitled", "untitled post", "new post", "post"]);

function trim(value: unknown) {
  return String(value || "").trim();
}

function mediaRefId(ref: MediaRef | null | undefined) {
  return trim(ref?.id);
}

function push(
  list: PrePublishIssue[],
  issue: PrePublishIssue,
) {
  list.push(issue);
}

export function resolvePrePublishMode(
  previous: BlogPost | null,
  candidate: BlogPost,
): PrePublishMode {
  const nextPublished = candidate.status === "published";
  if (!nextPublished) return "skip";
  const prevPublished = previous?.status === "published";
  if (!prevPublished) return "full";
  return "regression";
}

export function isMeaningfulBlogTitle(rawTitle: string, sanitizedTitle: string) {
  const raw = trim(rawTitle);
  if (!raw) return false;
  const sanitized = trim(sanitizedTitle);
  if (!sanitized) return false;
  if (MEANINGLESS_TITLES.has(sanitized.toLowerCase()) && MEANINGLESS_TITLES.has(raw.toLowerCase())) {
    return false;
  }
  if (!raw && MEANINGLESS_TITLES.has(sanitized.toLowerCase())) return false;
  return true;
}

export function isEmptyBlogContent(html: string) {
  // sidhuPlainText collapses tags to spaces but may leave whitespace-only strings.
  const plain = sidhuPlainText(html).trim();
  if (!plain) return true;
  if (/^(n\/?a|todo|tbd|placeholder|test)$/i.test(plain)) return true;
  return false;
}

export function isValidNormalizedSlug(slug: string) {
  const value = trim(slug);
  if (!value) return false;
  if (value === "post" || value === "untitled") return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

/** Stable fingerprint for Publish Anyway — excludes volatile timestamps. */
export function buildPrePublishCandidateFingerprint(candidate: BlogPost) {
  const payload = {
    id: candidate.id,
    title: candidate.title,
    slug: candidate.slug,
    excerpt: candidate.excerpt,
    content: candidate.content,
    categoryId: candidate.categoryId,
    featuredImageId: mediaRefId(candidate.featuredImage),
    featuredImageUrl: trim(candidate.featuredImage?.secureUrl),
    status: candidate.status,
    featured: Boolean(candidate.featured),
    seoTitle: candidate.seoTitle,
    seoDescription: candidate.seoDescription,
    focusKeyword: candidate.focusKeyword,
    canonicalUrl: candidate.canonicalUrl,
    robotsIndex: Boolean(candidate.robotsIndex),
    robotsFollow: Boolean(candidate.robotsFollow),
    ogTitle: candidate.ogTitle,
    ogDescription: candidate.ogDescription,
    ogImageId: mediaRefId(candidate.ogImage),
    ogImageUrl: trim(candidate.ogImage?.secureUrl),
    sitemapInclude: Boolean(candidate.sitemapInclude),
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function extractHrefList(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html || ""))) {
    const href = trim(match[1] || match[2] || match[3]);
    if (href) out.push(href);
  }
  return out;
}

export function classifyInternalHref(
  href: string,
  origin = SIDHU_SEO_PUBLIC_ORIGIN,
): "internal" | "self_candidate" | "external" | "ignore" {
  const value = trim(href);
  if (!value) return "ignore";
  if (value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) return "ignore";
  if (value.startsWith("/")) return "internal";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const originHost = new URL(origin).hostname.toLowerCase();
    if (host === originHost || host === `www.${originHost}` || `www.${host}` === originHost) {
      return "internal";
    }
    return "external";
  } catch {
    return "ignore";
  }
}

export function hrefMatchesBlogPath(href: string, slug: string, origin = SIDHU_SEO_PUBLIC_ORIGIN) {
  const selfPath = withSlash(blogPostPath(slug));
  const value = trim(href);
  if (!value) return false;
  if (value.startsWith("/")) {
    return withSlash(value.split("?")[0]?.split("#")[0] || "") === selfPath;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const originHost = new URL(origin).hostname.toLowerCase();
    if (host !== originHost && host !== `www.${originHost}`) return false;
    return withSlash(url.pathname) === selfPath;
  } catch {
    return false;
  }
}

function countH2(html: string) {
  return (String(html || "").match(/<h2\b/gi) || []).length;
}

function effectiveSeoTitle(post: BlogPost) {
  return trim(post.seoTitle) || trim(post.title);
}

function effectiveSeoDescription(post: BlogPost) {
  return trim(post.seoDescription) || trim(post.excerpt);
}

function evaluateMediaAltWarning(
  asset: MediaAsset | null,
  field: string,
): PrePublishIssue | null {
  if (!asset) return null;
  const alt = trim(asset.alt);
  if (!alt) {
    return {
      code: "PREPUB_MEDIA_ALT",
      severity: "warning",
      field,
      message: "Featured or OG image is missing alt text.",
      evidence: "empty",
    };
  }
  if (isFilenameLikeAlt(alt) || isUrlLikeAlt(alt) || isPlaceholderAlt(alt)) {
    return {
      code: "PREPUB_MEDIA_ALT",
      severity: "warning",
      field,
      message: "Image alt text looks like a filename, URL, or placeholder.",
      evidence: alt.slice(0, 80),
    };
  }
  return null;
}

function buildResult(args: {
  mode: PrePublishMode;
  blockers: PrePublishIssue[];
  warnings: PrePublishIssue[];
  passes: Array<{ code: string; message: string }>;
  fingerprint: string;
  confirmationAcknowledged: boolean;
}): PrePublishQaResult {
  const { mode, blockers, warnings, passes, fingerprint, confirmationAcknowledged } = args;
  if (blockers.length) {
    return {
      status: "blocked",
      blockers,
      warnings,
      passes,
      confirmationRequired: false,
      candidateFingerprint: fingerprint,
      mode,
    };
  }
  if (warnings.length && !confirmationAcknowledged) {
    return {
      status: "warnings",
      blockers,
      warnings,
      passes,
      confirmationRequired: true,
      candidateFingerprint: fingerprint,
      mode,
    };
  }
  return {
    status: "pass",
    blockers,
    warnings,
    passes,
    confirmationRequired: false,
    candidateFingerprint: fingerprint,
    mode,
  };
}

/**
 * Evaluate Pre-Publish QA for a sanitized Blog candidate.
 * Callers must re-run on confirmation and compare fingerprints.
 */
export function evaluatePrePublishQa(input: PrePublishQaInput): PrePublishQaResult {
  const { previous, raw, candidate, posts } = input;
  const mode = resolvePrePublishMode(previous, candidate);
  const fingerprint = buildPrePublishCandidateFingerprint(candidate);
  const confirmationAcknowledged =
    Boolean(input.confirmationFingerprint) &&
    trim(input.confirmationFingerprint) === fingerprint;

  if (mode === "skip") {
    return {
      status: "pass",
      blockers: [],
      warnings: [],
      passes: [{ code: "PREPUB_SKIP", message: "Pre-Publish QA not required for this transition." }],
      confirmationRequired: false,
      candidateFingerprint: fingerprint,
      mode,
    };
  }

  const blockers: PrePublishIssue[] = [];
  const warnings: PrePublishIssue[] = [];
  const passes: Array<{ code: string; message: string }> = [];

  // --- Hard blockers (full + regression) ---
  if (!isMeaningfulBlogTitle(raw.title, candidate.title)) {
    push(blockers, {
      code: "PREPUB_TITLE_MISSING",
      severity: "blocker",
      field: "title",
      message: "Add a real article title before publishing. Placeholder titles are not allowed.",
    });
  } else {
    passes.push({ code: "PREPUB_TITLE_OK", message: "Title is present." });
  }

  if (isEmptyBlogContent(candidate.content)) {
    push(blockers, {
      code: "PREPUB_CONTENT_EMPTY",
      severity: "blocker",
      field: "content",
      message: "Article content is empty. Add meaningful body text before publishing.",
    });
  } else {
    passes.push({ code: "PREPUB_CONTENT_OK", message: "Content is not empty." });
  }

  const rawSlug = slugify(trim(raw.slug) || trim(raw.title));
  if (!isValidNormalizedSlug(candidate.slug) || (!trim(raw.slug) && !trim(raw.title))) {
    push(blockers, {
      code: "PREPUB_SLUG_INVALID",
      severity: "blocker",
      field: "slug",
      message: "Provide a valid public URL slug before publishing.",
      evidence: candidate.slug || rawSlug || "(empty)",
    });
  } else {
    passes.push({ code: "PREPUB_SLUG_OK", message: "Slug is valid." });
  }

  const slugOwner = posts.find(
    (post) => post.slug === candidate.slug && post.id !== candidate.id,
  );
  if (slugOwner) {
    push(blockers, {
      code: "PREPUB_SLUG_DUPLICATE",
      severity: "blocker",
      field: "slug",
      message: "Another blog post already uses this slug.",
      evidence: slugOwner.id,
    });
  }

  if (previous?.status === "published" && previous.slug !== candidate.slug) {
    push(blockers, {
      code: "PREPUB_PUBLISHED_SLUG_CHANGED",
      severity: "blocker",
      field: "slug",
      message:
        "This published article’s slug cannot change through Save. Changing the public URL needs a separate redirect workflow.",
      evidence: `${previous.slug} → ${candidate.slug}`,
    });
  }

  const storedCanonical = trim(candidate.canonicalUrl);
  if (storedCanonical) {
    const issue = sidhuCanonicalIssue(storedCanonical);
    if (issue?.id === "canonical-malformed") {
      push(blockers, {
        code: "PREPUB_CANONICAL_MALFORMED",
        severity: "blocker",
        field: "canonicalUrl",
        message: "Custom canonical URL is malformed. Fix it or leave the field blank.",
        evidence: storedCanonical.slice(0, 120),
      });
    }
  }

  const featuredId = mediaRefId(candidate.featuredImage);
  if (featuredId && !input.featuredMedia) {
    push(blockers, {
      code: "PREPUB_FEATURED_MEDIA_BROKEN",
      severity: "blocker",
      field: "featuredImage",
      message: "Featured image reference points to a missing media asset.",
      evidence: featuredId,
    });
  }

  const ogId = mediaRefId(candidate.ogImage);
  if (ogId && !input.ogMedia) {
    push(blockers, {
      code: "PREPUB_OG_MEDIA_BROKEN",
      severity: "blocker",
      field: "ogImage",
      message: "OG image reference points to a missing media asset.",
      evidence: ogId,
    });
  }

  // Regression mode: only blockers + noindex confirmation transition; skip soft warnings.
  if (mode === "regression") {
    const becomingNoindex =
      candidate.robotsIndex === false && previous?.robotsIndex !== false;
    if (becomingNoindex) {
      push(warnings, {
        code: "PREPUB_PUBLISHED_NOINDEX",
        severity: "warning",
        field: "robotsIndex",
        message:
          "This published article would stop being indexed. Confirm deliberately if that is intended.",
      });
    }
    return buildResult({
      mode,
      blockers,
      warnings,
      passes,
      fingerprint,
      confirmationAcknowledged,
    });
  }

  // --- Full first-publish warnings ---
  if (candidate.robotsIndex === false) {
    push(warnings, {
      code: "PREPUB_PUBLISHED_NOINDEX",
      severity: "warning",
      field: "robotsIndex",
      message: "Publishing with noindex. Search engines will be asked not to index this article.",
    });
  }

  if (candidate.robotsIndex === false && candidate.sitemapInclude) {
    push(warnings, {
      code: "PREPUB_NOINDEX_SITEMAP",
      severity: "warning",
      field: "sitemapInclude",
      message: "noindex is set while the article remains included in the sitemap.",
    });
  }

  if (storedCanonical) {
    const publicPath = blogPostPath(candidate.slug);
    const canon = parseCanonicalTarget(storedCanonical, publicPath);
    const issue = sidhuCanonicalIssue(storedCanonical);
    if (issue?.id === "canonical-http") {
      push(warnings, {
        code: "PREPUB_CANONICAL_HTTP",
        severity: "warning",
        field: "canonicalUrl",
        message: "Custom canonical uses HTTP. Prefer HTTPS.",
      });
    }
    if (issue?.id === "canonical-www") {
      push(warnings, {
        code: "PREPUB_CANONICAL_WWW",
        severity: "warning",
        field: "canonicalUrl",
        message: "Custom canonical uses www. The live site uses the apex host.",
      });
    }
    if (!canon.malformed && canon.path && withSlash(canon.path) !== withSlash(publicPath)) {
      push(warnings, {
        code: "PREPUB_CANONICAL_TO_OTHER",
        severity: "warning",
        field: "canonicalUrl",
        message: "Custom canonical points away from this article’s normal public URL.",
        evidence: canon.path,
      });
    }
  } else {
    passes.push({ code: "PREPUB_CANONICAL_SELF", message: "Blank canonical uses the normal self URL." });
  }

  const effTitle = effectiveSeoTitle(candidate);
  const titleHint = editorialTitleHint(effTitle.length);
  if (titleHint === "SHORT" || titleHint === "LONG") {
    push(warnings, {
      code: "PREPUB_TITLE_LENGTH",
      severity: "warning",
      field: "seoTitle",
      message:
        titleHint === "SHORT"
          ? "Search title is quite short."
          : "Search title is quite long and may be truncated in results.",
      evidence: String(effTitle.length),
    });
  }

  const effDescription = effectiveSeoDescription(candidate);
  if (!effDescription) {
    push(warnings, {
      code: "PREPUB_DESCRIPTION_MISSING",
      severity: "warning",
      field: "seoDescription",
      message: "Add a meta description or excerpt before publishing.",
    });
  } else {
    const descHint = editorialDescriptionHint(effDescription.length);
    if (descHint === "SHORT" || descHint === "LONG") {
      push(warnings, {
        code: "PREPUB_DESCRIPTION_LENGTH",
        severity: "warning",
        field: "seoDescription",
        message:
          descHint === "SHORT"
            ? "Meta description is quite short."
            : "Meta description is quite long and may be truncated.",
        evidence: String(effDescription.length),
      });
    }
  }

  if (!featuredId) {
    push(warnings, {
      code: "PREPUB_FEATURED_MISSING",
      severity: "warning",
      field: "featuredImage",
      message: "No featured image is set.",
    });
  }

  const featuredAlt = evaluateMediaAltWarning(input.featuredMedia, "featuredImage");
  if (featuredAlt) warnings.push(featuredAlt);
  const ogAlt = evaluateMediaAltWarning(input.ogMedia, "ogImage");
  if (ogAlt) warnings.push(ogAlt);

  const hrefs = extractHrefList(candidate.content);
  let internalCount = 0;
  let selfLink = false;
  for (const href of hrefs) {
    const kind = classifyInternalHref(href);
    if (kind === "internal") {
      internalCount += 1;
      if (hrefMatchesBlogPath(href, candidate.slug)) selfLink = true;
    }
  }
  if (internalCount === 0) {
    push(warnings, {
      code: "PREPUB_INTERNAL_LINKS_ZERO",
      severity: "warning",
      field: "content",
      message: "No same-site internal links were found in the article body.",
    });
  } else {
    passes.push({
      code: "PREPUB_INTERNAL_LINKS_OK",
      message: `Found ${internalCount} internal link(s).`,
    });
  }
  if (selfLink) {
    push(warnings, {
      code: "PREPUB_SELF_LINK",
      severity: "warning",
      field: "content",
      message: "The article body links to its own public URL.",
    });
  }

  const titleKey = normalizeMetadataText(candidate.title);
  const seoTitleKey = normalizeMetadataText(effTitle);
  const descKey = normalizeMetadataText(effDescription);
  for (const other of posts) {
    if (other.id === candidate.id) continue;
    if (other.status !== "published") continue;
    if (titleKey && normalizeMetadataText(other.title) === titleKey) {
      push(warnings, {
        code: "PREPUB_DUPLICATE_TITLE",
        severity: "warning",
        field: "title",
        message: "Another published post uses the same title.",
        evidence: other.id,
      });
      break;
    }
  }
  for (const other of posts) {
    if (other.id === candidate.id || other.status !== "published") continue;
    const otherSeo = normalizeMetadataText(effectiveSeoTitle(other));
    if (seoTitleKey && otherSeo === seoTitleKey) {
      push(warnings, {
        code: "PREPUB_DUPLICATE_SEO_TITLE",
        severity: "warning",
        field: "seoTitle",
        message: "Another published post uses the same effective SEO title.",
        evidence: other.id,
      });
      break;
    }
  }
  if (descKey) {
    for (const other of posts) {
      if (other.id === candidate.id || other.status !== "published") continue;
      if (normalizeMetadataText(effectiveSeoDescription(other)) === descKey) {
        push(warnings, {
          code: "PREPUB_DUPLICATE_DESCRIPTION",
          severity: "warning",
          field: "seoDescription",
          message: "Another published post uses the same effective meta description.",
          evidence: other.id,
        });
        break;
      }
    }
  }

  const plainLen = sidhuPlainText(candidate.content).length;
  if (plainLen >= LONG_FORM_PLAIN_TEXT_MIN && countH2(candidate.content) === 0) {
    push(warnings, {
      code: "PREPUB_HEADING_STRUCTURE",
      severity: "warning",
      field: "content",
      message: "Long-form content has no H2 headings. Consider adding section headings.",
    });
  }

  // Explicit: body H1 is not required (template supplies H1 from title).
  passes.push({
    code: "PREPUB_H1_TEMPLATE",
    message: "Public H1 comes from the article title; body H1 is not required.",
  });

  return buildResult({
    mode,
    blockers,
    warnings,
    passes,
    fingerprint,
    confirmationAcknowledged,
  });
}

export function prePublishBlocksPersist(result: PrePublishQaResult) {
  return result.status === "blocked" || result.status === "warnings";
}
