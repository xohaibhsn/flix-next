/**
 * A2 Apply-readiness — deterministic, offline, non-mutating boundary.
 *
 * Compatible with the released A1 PrivateArticlePreview. Decuses Planning
 * eligibility, fingerprint freshness, Blog association safety, HTML bounds,
 * evidence-trust representation, and mandatory human factual approval.
 *
 * This module NEVER:
 * - persists a Blog draft
 * - calls OpenAI / Gemini / GSC
 * - exposes a Server Action or Apply button
 * - treats client `approved=true` as authorization
 * - claims publicationReady / autonomous RF·NBA·Priority eligibility
 *
 * Before real Apply activation still required:
 * - server-side RBAC (SEO + Blog)
 * - fresh-state revalidation under catalog locks
 * - trusted human approval recorded server-side (not client flag alone)
 * - atomic/idempotent private-draft persistence
 * - audit / lineage handling
 */

import { normalizeGeneratedArticle, type GeneratedArticle } from "@/lib/cms/ai-seo/blog-article-openai";
import {
  evaluateNewBlogArticleEligibility,
  parsePrivateArticlePreview,
  SEO_AI_ARTICLE_REFRESH_BLOCKED_MESSAGE,
  SEO_AI_ARTICLE_STALE_PLANNING_MESSAGE,
  SEO_AI_ARTICLE_UNSUPPORTED_MESSAGE,
  type PrivateArticlePreview,
} from "@/lib/cms/seo-planning/article-generation";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
  type SeoPlanningEditorialEvidenceV1,
} from "@/lib/cms/seo-planning/editorial-evidence";
import {
  evaluateSeoPlanningHandoffEligibility,
  resolveNewBlogHandoffSlug,
  SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE,
  SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE,
  seoPlanningBlogEditorPath,
} from "@/lib/cms/seo-planning/handoff";
import {
  isTrustedArticleEvidencePackAssessment,
  type TrustedArticleEvidencePackAssessment,
} from "@/lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  isSeoPlanningDraftArchived,
  SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_APPLY_READINESS_SPEC = "a2-apply-readiness-v1" as const;

export const SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES = {
  publishedBlocked: "Generated article content cannot overwrite a published Blog post.",
  blogContentConflict:
    "The linked Blog draft already has editorial content. Applying this AI preview is blocked.",
  duplicateApplyRisk:
    "This Planning draft is already linked to a private Blog draft. Creating another Blog draft from the same preview is blocked.",
  missingHumanApproval:
    "Human approval is required before any future private Blog Apply. A client approved=true flag is not sufficient.",
  missingFactualReview:
    "Explicit human factual review confirmation is required before any future private Blog Apply.",
  falseReadyClaim:
    "Evidence or publication readiness was claimed without verified support. False READY is blocked.",
  editorialHold:
    "Editorial or evidence HOLD cannot authorize NEW_BLOG Apply readiness.",
  evidencePackHold:
    "Evidence Pack HOLD / incomplete / conflicting evidence blocks supervised NEW_BLOG Apply readiness.",
  evidencePackUnavailable:
    "A server-sealed H3B Evidence Pack assessment is required before supervised NEW_BLOG Apply readiness. ABSENT or omitted packs cannot authorize Apply.",
  untrustedEvidencePackClaim:
    "Client-supplied Evidence Pack READY/HOLD strings are not authoritative. Use a server-sealed H3B assessment.",
  restoreBlocked: "RESTORE_HISTORICAL plans cannot enter the NEW_BLOG Apply path.",
  internalLinkBlocked: "INTERNAL_LINK plans cannot enter the NEW_BLOG Apply path.",
  skipBlocked: "SKIP recommendations cannot enter the NEW_BLOG Apply path.",
  previewDraftMismatch: "This preview does not belong to the supplied Planning draft.",
  unsafeHtml: "Article HTML failed CMS sanitize/bounds checks and cannot proceed to Apply readiness.",
  protectedFixture:
    "Fixture-marked Planning drafts cannot enter the supervised NEW_BLOG Apply path.",
} as const;

/** Fingerprint prefix used by the gated editorial evidence test fixture (when present). */
export const SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX = "TEST_FIXTURE:" as const;

export type ArticleApplyReadinessBlockCode =
  | "invalid_preview"
  | "invalid_input"
  | "not_found"
  | "planning_archived"
  | "unsupported_recommendation"
  | "refresh_target_blocked"
  | "restore_blocked"
  | "internal_link_blocked"
  | "skip_blocked"
  | "ineligible"
  | "stale_planning"
  | "preview_draft_mismatch"
  | "unsafe_html"
  | "linked_post_missing"
  | "published_blocked"
  | "blog_content_conflict"
  | "slug_conflict"
  | "duplicate_apply_risk"
  | "missing_human_approval"
  | "missing_factual_review"
  | "false_ready_claim"
  | "editorial_hold"
  | "evidence_pack_hold"
  | "evidence_pack_unavailable"
  | "untrusted_evidence_pack_claim"
  | "protected_fixture";

export type ArticleApplyReadinessBlockingReason = {
  code: ArticleApplyReadinessBlockCode;
  message: string;
};

/**
 * Human approval attestation for readiness only.
 * `clientApprovedFlag` alone NEVER authorizes READY.
 */
export type ArticleApplyHumanApprovalInput = {
  factualReviewConfirmed?: unknown;
  approvedByAdminId?: unknown;
  /** Untrusted client hint — ignored as sole authorization. */
  clientApprovedFlag?: unknown;
  /** Untrusted — any true claim without verified pack is a false-READY block. */
  claimPublicationReady?: unknown;
  claimEvidencePackComplete?: unknown;
  claimEvidenceVerified?: unknown;
};

export type ArticleApplyReadinessEvidenceReview = {
  editorialTrust: typeof SEO_PLANNING_EDITORIAL_TRUST | "absent";
  editorialEvidencePromotedToVerified: false;
  firstPartySiteFacts: "none_attested";
  externalReferences: "unverified";
  aiProse: "ai_generated_untrusted";
  evidencePackComplete: false;
  publicationReady: false;
  autonomousNewBlogEligible: false;
  originalContribution: string;
  readerBenefit: string;
  missingEvidenceNotes: string;
  reviewableClaims: Array<{
    id: string;
    claim: string;
    url: string;
    trust: typeof SEO_PLANNING_EDITORIAL_TRUST;
  }>;
  reviewableTitle: string;
  reviewableExcerpt: string;
};

export type ArticleApplyProposedPrivateBlogDraft = {
  mode: "create_private_draft" | "update_linked_empty_shell" | "idempotent_already_applied";
  status: "draft";
  publishedAt: null;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  linkedPostId: string | null;
  editorPath: string | null;
  planningDraftId: string;
  writingFingerprint: string;
  /** Original unsanitized comparison values from the A1 preview (for future QA). */
  originalPreview: {
    title: string;
    excerpt: string;
    html: string;
  };
};

export type ArticleApplyReadinessSuccess = {
  ok: true;
  spec: typeof SEO_AI_ARTICLE_APPLY_READINESS_SPEC;
  status: "READY_FOR_HUMAN_APPROVED_PRIVATE_DRAFT_APPLY";
  blockingReasons: [];
  proposedPrivateBlogDraft: ArticleApplyProposedPrivateBlogDraft;
  evidenceReview: ArticleApplyReadinessEvidenceReview;
  preview: PrivateArticlePreview;
  sanitizedArticle: GeneratedArticle;
  /** Always false — readiness is never publication approval. */
  publicationReady: false;
  /** Always false — this boundary does not persist. */
  blogSaved: false;
  persisted: false;
  providerRequests: 0;
};

export type ArticleApplyReadinessFailure = {
  ok: false;
  spec: typeof SEO_AI_ARTICLE_APPLY_READINESS_SPEC;
  status: "BLOCKED";
  blockingReasons: ArticleApplyReadinessBlockingReason[];
  /** Present when HTML + planning identity are valid enough to propose a draft shape. */
  proposedPrivateBlogDraft: ArticleApplyProposedPrivateBlogDraft | null;
  evidenceReview: ArticleApplyReadinessEvidenceReview | null;
  preview: PrivateArticlePreview | null;
  sanitizedArticle: GeneratedArticle | null;
  publicationReady: false;
  blogSaved: false;
  persisted: false;
  providerRequests: 0;
};

export type ArticleApplyReadinessResult =
  | ArticleApplyReadinessSuccess
  | ArticleApplyReadinessFailure;

export type PrepareArticleApplyReadinessInput = {
  /** A1 private preview (untrusted browser shape allowed). */
  preview: unknown;
  /** Current saved Planning draft (caller-supplied; typically from in-memory/test catalog). */
  planningDraft: SeoPlanningDraft | null | undefined;
  /** Linked Blog post when planningDraft.linkedPostId is set. */
  linkedPost?: BlogPost | null;
  /** Existing posts used only for slug-collision detection (no writes). */
  existingPosts?: readonly BlogPost[];
  /**
   * @deprecated Untrusted client/request hint only.
   * READY/HOLD/ABSENT strings here are never authoritative and never authorize Apply.
   * Prefer `trustedEvidencePack` from `assessArticleEvidencePackForApply`.
   */
  evidencePackStatus?: "READY_FOR_DRAFTING_REVIEW" | "HOLD" | "ABSENT" | unknown;
  /**
   * Server-sealed H3B Evidence Pack assessment (private seal).
   * Required for Apply-authorizing readiness (`ok: true`).
   * Plain objects and client READY/ABSENT strings cannot impersonate this value.
   */
  trustedEvidencePack?: TrustedArticleEvidencePackAssessment | unknown;
  /**
   * Explicit editorial HOLD on this Apply attempt (not autonomous pack HOLD alone).
   * When true, Apply readiness is blocked.
   */
  editorialHold?: unknown;
  humanApproval?: ArticleApplyHumanApprovalInput;
};

const EMPTY_CONTENT_SHELLS = new Set(["", "<p></p>", "<p><br></p>", "<p><br/></p>", "<p>&nbsp;</p>"]);

/** Reused from A2 WIP article-apply helpers — empty CMS handoff shells. */
export function isEmptyBlogDraftShell(content: string) {
  const normalized = String(content || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return EMPTY_CONTENT_SHELLS.has(normalized);
}

export function isUntouchedHandoffShell(post: Pick<BlogPost, "content" | "excerpt">) {
  const excerpt = String(post.excerpt || "").trim();
  return isEmptyBlogDraftShell(post.content) && excerpt.length === 0;
}

export function isPrivateDraftEligibleForApply(post: BlogPost) {
  return post.status === "draft" && !post.publishedAt;
}

export function contentAlreadyMatchesApply(
  post: Pick<BlogPost, "content" | "excerpt">,
  args: { html: string; excerpt: string },
) {
  return post.content === args.html && String(post.excerpt || "") === args.excerpt;
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function adminId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function block(
  code: ArticleApplyReadinessBlockCode,
  message: string,
): ArticleApplyReadinessBlockingReason {
  return { code, message };
}

function buildEvidenceReview(
  draft: SeoPlanningDraft,
  article: GeneratedArticle,
): ArticleApplyReadinessEvidenceReview {
  const editorial = readSeoPlanningEditorialEvidence(draft.payload);
  const hasEditorial =
    Boolean(editorial.originalContribution.trim()) ||
    Boolean(editorial.readerBenefit.trim()) ||
    Boolean(editorial.missingEvidenceNotes.trim()) ||
    editorial.entries.length > 0;

  return {
    editorialTrust: hasEditorial ? SEO_PLANNING_EDITORIAL_TRUST : "absent",
    editorialEvidencePromotedToVerified: false,
    firstPartySiteFacts: "none_attested",
    externalReferences: "unverified",
    aiProse: "ai_generated_untrusted",
    evidencePackComplete: false,
    publicationReady: false,
    autonomousNewBlogEligible: false,
    originalContribution: editorial.originalContribution,
    readerBenefit: editorial.readerBenefit,
    missingEvidenceNotes: editorial.missingEvidenceNotes,
    reviewableClaims: editorial.entries.map((entry) => ({
      id: entry.id,
      claim: entry.claim,
      url: entry.url,
      trust: SEO_PLANNING_EDITORIAL_TRUST,
    })),
    reviewableTitle: article.title,
    reviewableExcerpt: article.excerpt,
  };
}

function assertEditorialNeverVerified(editorial: SeoPlanningEditorialEvidenceV1): boolean {
  return editorial.entries.every((entry) => entry.trust === SEO_PLANNING_EDITORIAL_TRUST);
}

function failure(
  reasons: ArticleApplyReadinessBlockingReason[],
  extras: Partial<
    Pick<
      ArticleApplyReadinessFailure,
      "proposedPrivateBlogDraft" | "evidenceReview" | "preview" | "sanitizedArticle"
    >
  > = {},
): ArticleApplyReadinessFailure {
  return {
    ok: false,
    spec: SEO_AI_ARTICLE_APPLY_READINESS_SPEC,
    status: "BLOCKED",
    blockingReasons: reasons,
    proposedPrivateBlogDraft: extras.proposedPrivateBlogDraft ?? null,
    evidenceReview: extras.evidenceReview ?? null,
    preview: extras.preview ?? null,
    sanitizedArticle: extras.sanitizedArticle ?? null,
    publicationReady: false,
    blogSaved: false,
    persisted: false,
    providerRequests: 0,
  };
}

function buildProposedDraft(args: {
  mode: ArticleApplyProposedPrivateBlogDraft["mode"];
  draft: SeoPlanningDraft;
  article: GeneratedArticle;
  preview: PrivateArticlePreview;
  linkedPostId: string | null;
}): ArticleApplyProposedPrivateBlogDraft {
  const slug = resolveNewBlogHandoffSlug(args.draft);
  return {
    mode: args.mode,
    status: "draft",
    publishedAt: null,
    title: args.article.title,
    slug,
    excerpt: args.article.excerpt,
    content: args.article.html,
    linkedPostId: args.linkedPostId,
    editorPath: args.linkedPostId ? seoPlanningBlogEditorPath(args.linkedPostId) : null,
    planningDraftId: args.draft.id,
    writingFingerprint: args.preview.writingFingerprint,
    originalPreview: {
      title: args.preview.article.title,
      excerpt: args.preview.article.excerpt,
      html: args.preview.article.html,
    },
  };
}

/**
 * Pure A2 Apply-readiness evaluation.
 * Deterministic. Offline. No CMS writes. No provider calls.
 */
export function prepareArticleApplyReadiness(
  input: PrepareArticleApplyReadinessInput,
): ArticleApplyReadinessResult {
  const reasons: ArticleApplyReadinessBlockingReason[] = [];

  const parsed = parsePrivateArticlePreview(input.preview);
  if (!parsed.ok) {
    return failure([block("invalid_preview", parsed.error)]);
  }
  const preview = parsed.preview;

  // Client false-READY / verified claims — never trust.
  const approval = input.humanApproval || {};
  if (
    truthyFlag(approval.claimPublicationReady) ||
    truthyFlag(approval.claimEvidencePackComplete) ||
    truthyFlag(approval.claimEvidenceVerified)
  ) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }

  const trustedPack = isTrustedArticleEvidencePackAssessment(input.trustedEvidencePack)
    ? input.trustedEvidencePack
    : null;
  const forgedTrustedObject =
    input.trustedEvidencePack != null && trustedPack == null;

  // Client-supplied status strings are never authoritative.
  const clientPackHint =
    input.evidencePackStatus === "READY_FOR_DRAFTING_REVIEW" ||
    input.evidencePackStatus === "HOLD" ||
    input.evidencePackStatus === "ABSENT"
      ? input.evidencePackStatus
      : input.evidencePackStatus == null
        ? "ABSENT"
        : "HOLD";

  /** Effective drafting-review view for messaging — sealed assessment wins. */
  const packStatus: "READY_FOR_DRAFTING_REVIEW" | "HOLD" | "ABSENT" = trustedPack
    ? trustedPack.draftingReviewStatus
    : clientPackHint === "ABSENT"
      ? "ABSENT"
      : "HOLD";

  if (forgedTrustedObject) {
    reasons.push(
      block(
        "untrusted_evidence_pack_claim",
        SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.untrustedEvidencePackClaim,
      ),
    );
  }

  // Bare client READY/HOLD without a sealed H3B assessment is a forgery attempt.
  if (!trustedPack && (clientPackHint === "READY_FOR_DRAFTING_REVIEW" || clientPackHint === "HOLD")) {
    reasons.push(
      block(
        "untrusted_evidence_pack_claim",
        SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.untrustedEvidencePackClaim,
      ),
    );
  }

  // Missing sealed assessment (including legacy ABSENT / omitted) never authorizes Apply.
  if (!trustedPack) {
    reasons.push(
      block(
        "evidence_pack_unavailable",
        SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackUnavailable,
      ),
    );
  }

  // Sealed H3B HOLD / incomplete / conflict → fail closed for Apply.
  if (trustedPack && trustedPack.applyEvidenceGate === "BLOCK") {
    reasons.push(
      block("evidence_pack_hold", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackHold),
    );
  }

  // Sealed READY is drafting-review only — never Apply/publish authorization.
  if (
    trustedPack &&
    trustedPack.applyEvidenceGate === "PASS_DRAFTING_REVIEW_ONLY" &&
    (trustedPack.authorizeApply !== false ||
      trustedPack.authorizePublish !== false ||
      trustedPack.publicationReady !== false ||
      trustedPack.evidencePackComplete !== false)
  ) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }

  // Explicit editorial HOLD blocks this Apply path.
  if (truthyFlag(input.editorialHold)) {
    reasons.push(block("editorial_hold", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.editorialHold));
  }

  // Pack HOLD/ABSENT (or drafting-review-only READY) must never be treated as
  // verified Apply authorization. Claiming verified/complete while pack is not
  // independently grounded is a false-READY block.
  if (
    (packStatus === "HOLD" || packStatus === "ABSENT") &&
    (truthyFlag(approval.claimEvidencePackComplete) ||
      truthyFlag(approval.claimEvidenceVerified) ||
      truthyFlag(approval.claimPublicationReady))
  ) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }
  if (
    packStatus === "READY_FOR_DRAFTING_REVIEW" &&
    (truthyFlag(approval.claimPublicationReady) ||
      truthyFlag(approval.claimEvidenceVerified) ||
      truthyFlag(approval.claimEvidencePackComplete))
  ) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }

  // Client hint contradicting sealed assessment.
  if (
    trustedPack &&
    clientPackHint === "READY_FOR_DRAFTING_REVIEW" &&
    trustedPack.draftingReviewStatus === "HOLD"
  ) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }

  const draft = input.planningDraft;
  if (!draft) {
    reasons.push(block("not_found", SEO_PLANNING_MISSING_DRAFT_MESSAGE));
    return failure(reasons, { preview });
  }

  if (preview.planningDraftId !== draft.id) {
    reasons.push(
      block("preview_draft_mismatch", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.previewDraftMismatch),
    );
  }

  if (isSeoPlanningDraftArchived(draft)) {
    reasons.push(block("planning_archived", SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE));
  }

  if (
    String(draft.fingerprint || "").startsWith(SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX)
  ) {
    reasons.push(
      block("protected_fixture", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.protectedFixture),
    );
  }

  if (draft.recommendation === "REFRESH_EXISTING") {
    reasons.push(block("refresh_target_blocked", SEO_AI_ARTICLE_REFRESH_BLOCKED_MESSAGE));
  } else if (draft.recommendation === "RESTORE_HISTORICAL") {
    reasons.push(block("restore_blocked", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.restoreBlocked));
  } else if (draft.recommendation === "INTERNAL_LINK_ONLY") {
    reasons.push(
      block("internal_link_blocked", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.internalLinkBlocked),
    );
  } else if (draft.recommendation === "SKIP") {
    reasons.push(block("skip_blocked", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.skipBlocked));
  } else if (draft.recommendation !== "NEW_BLOG") {
    reasons.push(block("unsupported_recommendation", SEO_AI_ARTICLE_UNSUPPORTED_MESSAGE));
  }

  // Handoff eligibility is broader (allows REFRESH); we already rejected non-NEW_BLOG.
  const handoff = evaluateSeoPlanningHandoffEligibility(draft);
  if (!handoff.ok && draft.recommendation === "NEW_BLOG") {
    reasons.push(
      block(
        handoff.code === "planning_archived" ? "planning_archived" : "ineligible",
        handoff.error,
      ),
    );
  }

  const eligible = evaluateNewBlogArticleEligibility(draft, { status: "skipped" });
  if (!eligible.ok) {
    const code: ArticleApplyReadinessBlockCode =
      eligible.code === "refresh_target_blocked"
        ? "refresh_target_blocked"
        : eligible.code === "planning_archived"
          ? "planning_archived"
          : eligible.code === "unsupported_recommendation"
            ? "unsupported_recommendation"
            : eligible.code === "not_found"
              ? "not_found"
              : "ineligible";
    if (!reasons.some((r) => r.code === code)) {
      reasons.push(block(code, eligible.error));
    }
  } else if (
    draft.updatedAt !== preview.planningUpdatedAt ||
    eligible.fingerprint !== preview.writingFingerprint
  ) {
    reasons.push(block("stale_planning", SEO_AI_ARTICLE_STALE_PLANNING_MESSAGE));
  }

  // Preview trust markers must remain honest (parse already forces false flags;
  // defend against mutated objects that bypassed parse).
  if (
    preview.publicationReady !== false ||
    preview.evidenceTrust.publicationReady !== false ||
    preview.evidenceTrust.evidencePackComplete !== false ||
    preview.evidenceTrust.aiProse !== "ai_generated_untrusted"
  ) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }

  const sanitized = normalizeGeneratedArticle(preview.article);
  if (!sanitized) {
    reasons.push(block("unsafe_html", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.unsafeHtml));
    return failure(reasons, { preview });
  }

  const editorial = readSeoPlanningEditorialEvidence(draft.payload);
  if (!assertEditorialNeverVerified(editorial)) {
    reasons.push(block("false_ready_claim", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.falseReadyClaim));
  }

  const evidenceReview = buildEvidenceReview(draft, sanitized);

  let mode: ArticleApplyProposedPrivateBlogDraft["mode"] = "create_private_draft";
  const linkedPostId: string | null = draft.linkedPostId ? String(draft.linkedPostId) : null;
  const existingPosts = input.existingPosts || [];

  if (linkedPostId) {
    const linked = input.linkedPost;
    if (!linked || linked.id !== linkedPostId) {
      reasons.push(block("linked_post_missing", SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE));
    } else if (linked.status === "published" || linked.publishedAt) {
      reasons.push(
        block("published_blocked", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.publishedBlocked),
      );
    } else if (!isPrivateDraftEligibleForApply(linked)) {
      reasons.push(
        block("published_blocked", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.publishedBlocked),
      );
    } else if (contentAlreadyMatchesApply(linked, sanitized)) {
      mode = "idempotent_already_applied";
    } else if (!isUntouchedHandoffShell(linked)) {
      reasons.push(
        block("blog_content_conflict", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.blogContentConflict),
      );
    } else {
      mode = "update_linked_empty_shell";
    }
  } else {
    // Unlinked: propose create — block silent duplicate if slug already owned.
    const slug = resolveNewBlogHandoffSlug(draft);
    const collision = existingPosts.find((post) => post.slug === slug);
    if (collision) {
      reasons.push(block("slug_conflict", SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE));
    }
    // Guard: if somehow linked in posts list under another path, do not create second.
    const alreadyOwned = existingPosts.find(
      (post) =>
        post.status === "draft" &&
        !post.publishedAt &&
        contentAlreadyMatchesApply(post, sanitized),
    );
    if (alreadyOwned) {
      reasons.push(
        block("duplicate_apply_risk", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.duplicateApplyRisk),
      );
    }
  }

  // Human approval — mandatory; clientApprovedFlag alone is insufficient.
  const factualOk = truthyFlag(approval.factualReviewConfirmed);
  const trustedActor = adminId(approval.approvedByAdminId);
  const clientOnly = truthyFlag(approval.clientApprovedFlag) && (!factualOk || !trustedActor);

  if (!factualOk) {
    reasons.push(
      block("missing_factual_review", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.missingFactualReview),
    );
  }
  if (!trustedActor || clientOnly) {
    reasons.push(
      block("missing_human_approval", SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.missingHumanApproval),
    );
  }

  const proposed = buildProposedDraft({
    mode,
    draft,
    article: sanitized,
    preview,
    linkedPostId,
  });

  // Deduplicate reasons by code+message while preserving order.
  const seen = new Set<string>();
  const uniqueReasons = reasons.filter((reason) => {
    const key = `${reason.code}:${reason.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueReasons.length > 0) {
    return failure(uniqueReasons, {
      proposedPrivateBlogDraft: proposed,
      evidenceReview,
      preview,
      sanitizedArticle: sanitized,
    });
  }

  return {
    ok: true,
    spec: SEO_AI_ARTICLE_APPLY_READINESS_SPEC,
    status: "READY_FOR_HUMAN_APPROVED_PRIVATE_DRAFT_APPLY",
    blockingReasons: [],
    proposedPrivateBlogDraft: proposed,
    evidenceReview,
    preview,
    sanitizedArticle: sanitized,
    publicationReady: false,
    blogSaved: false,
    persisted: false,
    providerRequests: 0,
  };
}
