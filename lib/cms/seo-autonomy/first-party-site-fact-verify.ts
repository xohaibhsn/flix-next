/**
 * A2-4A — Server-authoritative first-party site_fact verification (pure core + DI).
 *
 * Derives trusted SeoEvidencePackGroundedEvidence (kind: site_fact) only from
 * published CMS Blog content that demonstrably contains the editorial claim.
 * Editorial payloads remain EDITORIAL_UNVERIFIED and never self-declare trust.
 *
 * No network fetch. No GSC or AI provider calls. No CMS writes.
 */

import { createHash } from "node:crypto";
import { blogPostPath, blogPostPathLegacy } from "@/lib/cms/blog-paths";
import { plainTextFromHtml } from "@/lib/cms/seo-longform";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS,
  SEO_PLANNING_EDITORIAL_TRUST,
  type SeoPlanningEditorialEvidenceEntry,
  type SeoPlanningEditorialEvidenceV1,
} from "@/lib/cms/seo-planning/editorial-evidence";
import type { SeoEvidencePackGroundedEvidence } from "@/lib/cms/seo-autonomy/evidence-pack";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";

export const FIRST_PARTY_SITE_FACT_VERIFY_VERSION = "v1" as const;

export const FIRST_PARTY_CANONICAL_HOST = "theflixiptv.com" as const;

export const FIRST_PARTY_VERIFY_CAPS = {
  entryCount: SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount,
  claimMin: 24,
  claimMax: SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.claim,
  descriptionMax: 360,
  evidenceId: 64,
  url: 400,
  slug: 80,
  fingerprint: 64,
  reasonDetail: 160,
} as const;

export const FIRST_PARTY_VERIFY_REASON_CODES = [
  "ACCEPTED",
  "EXTERNAL_REFERENCE_UNSUPPORTED",
  "ENTRY_TYPE_UNSUPPORTED",
  "MISSING_SOURCE_URL",
  "UNSAFE_OR_NON_CANONICAL_URL",
  "SOURCE_NOT_FOUND",
  "SOURCE_NOT_PUBLISHED",
  "SOURCE_CANONICAL_MISMATCH",
  "CLAIM_MISSING_OR_GENERIC",
  "CLAIM_NOT_FOUND_IN_SOURCE",
  "EMPTY_EVIDENCE",
] as const;
export type FirstPartyVerifyReasonCode = (typeof FIRST_PARTY_VERIFY_REASON_CODES)[number];

export const FIRST_PARTY_VERIFY_STATUSES = [
  "OK",
  "DENIED",
  "FAILED",
  "MISSING_DRAFT",
] as const;
export type FirstPartyVerifyStatus = (typeof FIRST_PARTY_VERIFY_STATUSES)[number];

export type FirstPartyCanonicalBlogRef = {
  slug: string;
  canonicalUrl: string;
  pathname: string;
};

export type FirstPartySiteFactProvenance = {
  evidenceId: string;
  editorialEntryId: string;
  blogPostId: string;
  blogSlug: string;
  canonicalUrl: string;
  contentFingerprint: string;
  matchedClaimNormalized: string;
};

export type FirstPartyEntryVerification = {
  entryId: string;
  evidenceType: string;
  accepted: boolean;
  reasonCode: FirstPartyVerifyReasonCode;
};

export type FirstPartySiteFactVerifyResult = {
  verifyVersion: typeof FIRST_PARTY_SITE_FACT_VERIFY_VERSION;
  planningDraftId: string;
  status: FirstPartyVerifyStatus;
  /** Sanitized top-level message; never includes secrets or stack traces. */
  message: string;
  entries: FirstPartyEntryVerification[];
  groundedEvidence: SeoEvidencePackGroundedEvidence[];
  provenance: FirstPartySiteFactProvenance[];
  unresolvedCount: number;
  /** Always false — verification is not publication approval. */
  publicationReady: false;
};

/** Injected read-only CMS boundary for tests and orchestration. */
export type FirstPartyVerifyCatalog = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getPostBySlug(slug: string): Promise<BlogPost | null>;
};

const GENERIC_CLAIM_PATTERNS = [
  /^best iptv/i,
  /^top iptv/i,
  /^cheap iptv/i,
  /^#1 iptv/i,
  /^number one iptv/i,
  /^the best streaming/i,
  /^buy now/i,
  /^click here/i,
];

/** Exact stored canonical form: https://theflixiptv.com/blogs/{lowercase-slug}/ */
const EXACT_CANONICAL_BLOG_URL_RE =
  /^https:\/\/theflixiptv\.com\/blogs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/;

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenericFirstPartyClaim(claim: string): boolean {
  const normalized = claim.replace(/\s+/g, " ").trim();
  if (normalized.length < FIRST_PARTY_VERIFY_CAPS.claimMin) return true;
  return GENERIC_CLAIM_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Accept only the exact stored canonical URL form:
 * `https://theflixiptv.com/blogs/{valid-lowercase-slug}/`
 *
 * Does not silently repair missing slashes, ports, dot-segments, encoding,
 * case variants, credentials, query, fragment, legacy `/blog/`, or other hosts.
 */
export function parseCanonicalFirstPartyBlogUrl(
  raw: unknown,
): FirstPartyCanonicalBlogRef | null {
  const urlText = sanitizeText(raw, FIRST_PARTY_VERIFY_CAPS.url).trim();
  if (!urlText) return null;

  // Reject any input that is not already the exact canonical string.
  // Do not use WHATWG pathname normalization — it can repair noncanonical forms.
  const match = EXACT_CANONICAL_BLOG_URL_RE.exec(urlText);
  if (!match) return null;

  const slug = match[1] || "";
  if (!slug || slug.length > FIRST_PARTY_VERIFY_CAPS.slug) return null;

  const canonicalPath = blogPostPath(slug);
  const canonicalUrl = `https://${FIRST_PARTY_CANONICAL_HOST}${canonicalPath}`;
  if (urlText !== canonicalUrl) return null;

  return {
    slug,
    pathname: canonicalPath,
    canonicalUrl,
  };
}

/**
 * Split HTML into independent plain-text passages using block-tag boundaries.
 * Avoids treating adjacent block ends/starts as one contiguous claim surface.
 */
export function authoritativeBodyPassages(html: string): string[] {
  const raw = String(html || "");
  if (!raw.trim()) return [];
  const parts = raw.split(/<\/(?:p|div|h[1-6]|li|blockquote|section|article|tr|td|th)>/i);
  const passages = parts
    .map((part) => plainTextFromHtml(part).replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0);
  if (passages.length > 0) return passages;
  const fallback = plainTextFromHtml(raw).replace(/\s+/g, " ").trim();
  return fallback ? [fallback] : [];
}

/**
 * Independent authoritative CMS text fields (never concatenated for matching).
 * Body content contributes one passage per block-level HTML segment.
 */
export function authoritativePublishedPostFields(post: BlogPost): string[] {
  const fields: string[] = [
    (post.title || "").replace(/\s+/g, " ").trim(),
    (post.excerpt || "").replace(/\s+/g, " ").trim(),
    ...authoritativeBodyPassages(post.content || ""),
    (post.seoTitle || "").replace(/\s+/g, " ").trim(),
    (post.seoDescription || "").replace(/\s+/g, " ").trim(),
  ];
  return fields.filter((field) => field.length > 0);
}

/**
 * Diagnostic join of independent fields (newline-separated).
 * Verification must use {@link claimSupportedByAuthoritativeFields}, not this string.
 */
export function authoritativePublishedPostText(post: BlogPost): string {
  return authoritativePublishedPostFields(post).join("\n").trim();
}

/** True when one independent field contains the entire normalized claim. */
export function claimSupportedByAuthoritativeFields(
  claimNormalized: string,
  fields: string[],
): boolean {
  if (!claimNormalized) return false;
  return fields.some((field) => {
    const fieldNorm = normalizeMatchText(field);
    return fieldNorm.length > 0 && fieldNorm.includes(claimNormalized);
  });
}

/**
 * Exact permitted stored Blog canonical representations for evidence provenance.
 * Built from blogPostPath / blogPostPathLegacy + trusted first-party host.
 * Literal case-sensitive equality only — no WHATWG / withSlash repair.
 */
export function permittedAuthoritativeBlogCanonicals(expectedSlug: string): readonly string[] {
  const expectedPath = blogPostPath(expectedSlug);
  const legacyPath = blogPostPathLegacy(expectedSlug);
  return [
    expectedPath,
    legacyPath,
    `https://${FIRST_PARTY_CANONICAL_HOST}${expectedPath}`,
    `https://${FIRST_PARTY_CANONICAL_HOST}${legacyPath}`,
  ];
}

/**
 * Whether BlogPost.canonicalUrl identifies the same article as expectedSlug.
 *
 * Allowed:
 * - undefined / null / "" (self-canonical default)
 * - exact `/blogs/{slug}/` or legacy `/blog/{slug}/`
 * - exact absolute https://theflixiptv.com equivalents of those paths
 *
 * Rejects query/fragment, ports, http, www, foreign hosts, credentials,
 * path-normalization variants, encoding, missing slash, whitespace padding,
 * and any value that would only become valid after silent repair.
 */
export function isAuthoritativeBlogSelfCanonical(
  postCanonicalUrl: unknown,
  expectedSlug: string,
): boolean {
  if (postCanonicalUrl == null) return true;
  if (typeof postCanonicalUrl !== "string") return false;

  // sanitizeText strips NULs only — do not trim; padded values must fail equality.
  const stored = sanitizeText(postCanonicalUrl, FIRST_PARTY_VERIFY_CAPS.url);
  if (stored === "") return true;

  const slug = sanitizeText(expectedSlug, FIRST_PARTY_VERIFY_CAPS.slug);
  if (!slug || slug !== expectedSlug) return false;

  return permittedAuthoritativeBlogCanonicals(slug).includes(stored);
}

export function contentFingerprintForPost(post: BlogPost): string {
  const material = [
    post.id,
    post.slug,
    post.status,
    post.updatedAt || "",
    post.publishedAt || "",
    post.title || "",
    post.excerpt || "",
    post.content || "",
    post.seoTitle || "",
    post.seoDescription || "",
    // Canonical metadata participates so conflicting canonical changes revoke acceptance.
    post.canonicalUrl || "",
  ].join("\n");
  return createHash("sha256").update(material, "utf8").digest("hex").slice(0, FIRST_PARTY_VERIFY_CAPS.fingerprint);
}

export function deterministicSiteFactEvidenceId(args: {
  blogPostId: string;
  canonicalUrl: string;
  claimNormalized: string;
}): string {
  const digest = createHash("sha256")
    .update(
      ["site_fact", args.blogPostId, args.canonicalUrl, args.claimNormalized].join("|"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);
  return `sf_${digest}`.slice(0, FIRST_PARTY_VERIFY_CAPS.evidenceId);
}

export type PureSiteFactVerifyOutcome =
  | {
      accepted: true;
      reasonCode: "ACCEPTED";
      grounded: SeoEvidencePackGroundedEvidence;
      provenance: FirstPartySiteFactProvenance;
    }
  | {
      accepted: false;
      reasonCode: Exclude<FirstPartyVerifyReasonCode, "ACCEPTED" | "EMPTY_EVIDENCE">;
    };

/**
 * Pure check: PROPOSED_SITE_FACT against one already-loaded published BlogPost.
 * Callers must ensure the post was resolved via server CMS and is published.
 */
export function verifyProposedSiteFactAgainstPublishedPost(args: {
  entry: SeoPlanningEditorialEvidenceEntry;
  post: BlogPost;
  canonical: FirstPartyCanonicalBlogRef;
}): PureSiteFactVerifyOutcome {
  const { entry, post, canonical } = args;

  if (entry.evidenceType === "EXTERNAL_REFERENCE") {
    return { accepted: false, reasonCode: "EXTERNAL_REFERENCE_UNSUPPORTED" };
  }
  if (entry.evidenceType !== "PROPOSED_SITE_FACT") {
    return { accepted: false, reasonCode: "ENTRY_TYPE_UNSUPPORTED" };
  }

  if (post.status !== "published") {
    return { accepted: false, reasonCode: "SOURCE_NOT_PUBLISHED" };
  }

  // Loaded slug, requested identity, and Blog canonical metadata must agree.
  if (post.slug !== canonical.slug) {
    return { accepted: false, reasonCode: "SOURCE_CANONICAL_MISMATCH" };
  }
  if (!isAuthoritativeBlogSelfCanonical(post.canonicalUrl, canonical.slug)) {
    return { accepted: false, reasonCode: "SOURCE_CANONICAL_MISMATCH" };
  }

  const claim = trimField(entry.claim, FIRST_PARTY_VERIFY_CAPS.claimMax);
  if (!claim || isGenericFirstPartyClaim(claim)) {
    return { accepted: false, reasonCode: "CLAIM_MISSING_OR_GENERIC" };
  }

  const claimNorm = normalizeMatchText(claim);
  const fields = authoritativePublishedPostFields(post);
  if (!claimSupportedByAuthoritativeFields(claimNorm, fields)) {
    return { accepted: false, reasonCode: "CLAIM_NOT_FOUND_IN_SOURCE" };
  }

  const fingerprint = contentFingerprintForPost(post);
  const evidenceId = deterministicSiteFactEvidenceId({
    blogPostId: post.id,
    canonicalUrl: canonical.canonicalUrl,
    claimNormalized: claimNorm,
  });

  const description = trimField(
    `First-party published CMS content confirms: ${claim}`,
    FIRST_PARTY_VERIFY_CAPS.descriptionMax,
  );

  return {
    accepted: true,
    reasonCode: "ACCEPTED",
    grounded: {
      id: evidenceId,
      kind: "site_fact",
      description,
      sourceUrl: canonical.canonicalUrl,
    },
    provenance: {
      evidenceId,
      editorialEntryId: entry.id,
      blogPostId: post.id,
      blogSlug: post.slug,
      canonicalUrl: canonical.canonicalUrl,
      contentFingerprint: fingerprint,
      matchedClaimNormalized: claimNorm,
    },
  };
}

function emptyResult(
  overrides: Partial<FirstPartySiteFactVerifyResult> &
    Pick<FirstPartySiteFactVerifyResult, "planningDraftId" | "status" | "message">,
): FirstPartySiteFactVerifyResult {
  return {
    verifyVersion: FIRST_PARTY_SITE_FACT_VERIFY_VERSION,
    entries: [],
    groundedEvidence: [],
    provenance: [],
    unresolvedCount: 0,
    publicationReady: false,
    ...overrides,
  };
}

/**
 * Verify PROPOSED_SITE_FACT entries from a Planning draft using injected CMS readers.
 * Ignores any client-supplied groundedEvidence / verified flags — reads stored draft only.
 */
export async function verifyPlanningFirstPartySiteFacts(args: {
  planningDraftId: string;
  catalog: FirstPartyVerifyCatalog;
  /** When false, no CMS reads occur. */
  authorized: boolean;
}): Promise<FirstPartySiteFactVerifyResult> {
  const planningDraftId = trimField(args.planningDraftId, 80);
  if (!planningDraftId) {
    return emptyResult({
      planningDraftId: "",
      status: "MISSING_DRAFT",
      message: "Planning draft id is required.",
    });
  }

  if (!args.authorized) {
    return emptyResult({
      planningDraftId,
      status: "DENIED",
      message: "Access denied.",
    });
  }

  let draft: SeoPlanningDraft | null;
  try {
    draft = await args.catalog.getSeoPlanningDraftById(planningDraftId);
  } catch {
    return emptyResult({
      planningDraftId,
      status: "FAILED",
      message: "Could not read the planning draft.",
    });
  }

  if (!draft) {
    return emptyResult({
      planningDraftId,
      status: "MISSING_DRAFT",
      message: "Planning draft was not found.",
    });
  }

  const editorial: SeoPlanningEditorialEvidenceV1 = readSeoPlanningEditorialEvidence(draft.payload);
  const entries = editorial.entries.slice(0, FIRST_PARTY_VERIFY_CAPS.entryCount);

  if (!entries.length) {
    return emptyResult({
      planningDraftId,
      status: "OK",
      message: "No editorial evidence entries to verify.",
      entries: [],
      unresolvedCount: 0,
    });
  }

  // Trust marker from stored payload must remain editorial.
  for (const entry of entries) {
    if (entry.trust !== SEO_PLANNING_EDITORIAL_TRUST) {
      // readSeoPlanningEditorialEvidence always forces EDITORIAL_UNVERIFIED; defend anyway.
      return emptyResult({
        planningDraftId,
        status: "FAILED",
        message: "Editorial evidence trust marker was invalid.",
      });
    }
  }

  const results: FirstPartyEntryVerification[] = [];
  const groundedEvidence: SeoEvidencePackGroundedEvidence[] = [];
  const provenance: FirstPartySiteFactProvenance[] = [];
  const seenEvidenceIds = new Set<string>();

  for (const entry of entries) {
    if (entry.evidenceType === "EXTERNAL_REFERENCE") {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "EXTERNAL_REFERENCE_UNSUPPORTED",
      });
      continue;
    }

    if (entry.evidenceType !== "PROPOSED_SITE_FACT") {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "ENTRY_TYPE_UNSUPPORTED",
      });
      continue;
    }

    if (!trimField(entry.url, FIRST_PARTY_VERIFY_CAPS.url)) {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "MISSING_SOURCE_URL",
      });
      continue;
    }

    const canonical = parseCanonicalFirstPartyBlogUrl(entry.url);
    if (!canonical) {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "UNSAFE_OR_NON_CANONICAL_URL",
      });
      continue;
    }

    let post: BlogPost | null;
    try {
      post = await args.catalog.getPostBySlug(canonical.slug);
    } catch {
      return emptyResult({
        planningDraftId,
        status: "FAILED",
        message: "Could not read CMS blog content.",
        entries: results,
        groundedEvidence: [],
        provenance: [],
        unresolvedCount: entries.length,
      });
    }

    if (!post) {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "SOURCE_NOT_FOUND",
      });
      continue;
    }

    // Exact slug identity — reject if CMS slug drifted from URL leaf.
    if (post.slug !== canonical.slug) {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "SOURCE_NOT_FOUND",
      });
      continue;
    }

    if (post.status !== "published") {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: "SOURCE_NOT_PUBLISHED",
      });
      continue;
    }

    const outcome = verifyProposedSiteFactAgainstPublishedPost({
      entry,
      post,
      canonical,
    });

    if (!outcome.accepted) {
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: false,
        reasonCode: outcome.reasonCode,
      });
      continue;
    }

    if (seenEvidenceIds.has(outcome.grounded.id)) {
      // Deterministic duplicate of same claim/source — keep one grounded row.
      results.push({
        entryId: entry.id,
        evidenceType: entry.evidenceType,
        accepted: true,
        reasonCode: "ACCEPTED",
      });
      continue;
    }

    seenEvidenceIds.add(outcome.grounded.id);
    groundedEvidence.push(outcome.grounded);
    provenance.push(outcome.provenance);
    results.push({
      entryId: entry.id,
      evidenceType: entry.evidenceType,
      accepted: true,
      reasonCode: "ACCEPTED",
    });
  }

  const unresolvedCount = results.filter((r) => !r.accepted).length;

  return {
    verifyVersion: FIRST_PARTY_SITE_FACT_VERIFY_VERSION,
    planningDraftId,
    status: "OK",
    message:
      groundedEvidence.length > 0
        ? "First-party site facts verified from published CMS content where proof succeeded."
        : "No first-party site facts could be verified from published CMS content.",
    entries: results,
    groundedEvidence,
    provenance,
    unresolvedCount,
    publicationReady: false,
  };
}
