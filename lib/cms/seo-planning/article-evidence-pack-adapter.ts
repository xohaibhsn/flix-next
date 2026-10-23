/**
 * A2-5B — Local adapter from H3B `prepareSeoEvidencePack` into Apply readiness.
 *
 * Reuses the Evidence Pack evaluator; does not re-score evidence.
 * READY_FOR_DRAFTING_REVIEW never authorizes Apply or publication.
 * Assessments are minted only through this module (private seal).
 */

import {
  prepareSeoEvidencePack,
  SEO_EVIDENCE_PACK_VERSION,
  type SeoEvidencePackHoldReason,
  type SeoEvidencePackInput,
  type SeoEvidencePackResult,
  type SeoEvidencePackStatus,
} from "@/lib/cms/seo-autonomy/evidence-pack";

export const SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC =
  "a2-article-evidence-pack-adapter-v1" as const;

/** Private seal — plain client objects cannot impersonate a trusted assessment. */
const TRUSTED_EVIDENCE_PACK_SEAL = Symbol("flix.a2.trustedEvidencePackAssessment.v1");

export type ArticleEvidencePackApplyGate = "PASS_DRAFTING_REVIEW_ONLY" | "BLOCK";

export type TrustedArticleEvidencePackAssessment = {
  readonly [TRUSTED_EVIDENCE_PACK_SEAL]: true;
  readonly spec: typeof SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC;
  readonly packVersion: typeof SEO_EVIDENCE_PACK_VERSION;
  /** H3B drafting-review status only. */
  readonly draftingReviewStatus: SeoEvidencePackStatus;
  /**
   * PASS_DRAFTING_REVIEW_ONLY = H3B READY; still does not authorize Apply/publish.
   * BLOCK = H3B HOLD / invalid — Apply must fail closed on evidence grounds.
   */
  readonly applyEvidenceGate: ArticleEvidencePackApplyGate;
  readonly authorizeApply: false;
  readonly authorizePublish: false;
  readonly publicationReady: false;
  readonly evidencePackComplete: false;
  readonly holdReasons: readonly SeoEvidencePackHoldReason[];
  readonly readyForDraftingReview: boolean;
  readonly pack: SeoEvidencePackResult;
};

function mint(
  pack: SeoEvidencePackResult,
): TrustedArticleEvidencePackAssessment {
  const draftingReviewStatus = pack.status;
  const applyEvidenceGate: ArticleEvidencePackApplyGate =
    draftingReviewStatus === "READY_FOR_DRAFTING_REVIEW" ? "PASS_DRAFTING_REVIEW_ONLY" : "BLOCK";

  return {
    [TRUSTED_EVIDENCE_PACK_SEAL]: true,
    spec: SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC,
    packVersion: SEO_EVIDENCE_PACK_VERSION,
    draftingReviewStatus,
    applyEvidenceGate,
    authorizeApply: false,
    authorizePublish: false,
    publicationReady: false,
    evidencePackComplete: false,
    holdReasons: pack.holdReasons,
    readyForDraftingReview: pack.readyForDraftingReview === true,
    pack,
  };
}

/**
 * Server-owned evaluation: runs real H3B `prepareSeoEvidencePack`.
 * Callers supply Research/pipeline inputs — never a client READY string.
 */
export function assessArticleEvidencePackForApply(
  input: SeoEvidencePackInput,
): TrustedArticleEvidencePackAssessment {
  const pack = prepareSeoEvidencePack(input);
  // Defense: H3B must never report publicationReady.
  if (pack.publicationReady !== false) {
    return mint({
      ...pack,
      status: "HOLD",
      holdReasons: [...pack.holdReasons, "INVALID_INPUT"],
      readyForDraftingReview: false,
      publicationReady: false,
    });
  }
  return mint(pack);
}

/**
 * Seal a result that was already produced by `prepareSeoEvidencePack` in-process.
 * Rejects forged shapes (wrong version, publicationReady, missing fields).
 */
export function sealPreparedSeoEvidencePackResult(
  pack: SeoEvidencePackResult | null | undefined,
): TrustedArticleEvidencePackAssessment | null {
  if (!pack || typeof pack !== "object") return null;
  if (pack.packVersion !== SEO_EVIDENCE_PACK_VERSION) return null;
  if (pack.publicationReady !== false) return null;
  if (pack.status !== "READY_FOR_DRAFTING_REVIEW" && pack.status !== "HOLD") return null;
  if (!Array.isArray(pack.holdReasons)) return null;
  if (typeof pack.readyForDraftingReview !== "boolean") return null;
  if (pack.readyForDraftingReview !== (pack.status === "READY_FOR_DRAFTING_REVIEW")) return null;
  return mint(pack);
}

export function isTrustedArticleEvidencePackAssessment(
  value: unknown,
): value is TrustedArticleEvidencePackAssessment {
  if (!value || typeof value !== "object") return false;
  const row = value as TrustedArticleEvidencePackAssessment;
  return (
    row[TRUSTED_EVIDENCE_PACK_SEAL] === true &&
    row.spec === SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC &&
    row.packVersion === SEO_EVIDENCE_PACK_VERSION &&
    row.authorizeApply === false &&
    row.authorizePublish === false &&
    row.publicationReady === false &&
    row.evidencePackComplete === false &&
    (row.draftingReviewStatus === "READY_FOR_DRAFTING_REVIEW" ||
      row.draftingReviewStatus === "HOLD") &&
    (row.applyEvidenceGate === "PASS_DRAFTING_REVIEW_ONLY" ||
      row.applyEvidenceGate === "BLOCK")
  );
}
