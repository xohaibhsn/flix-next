/**
 * Refresh-First Governor V1 — input/output contracts.
 * Pure eligibility gate. No providers, network, CMS writes, or Planning reads.
 *
 * Verdicts are NBA-compatible (`SeoRefreshFirstVerdict`). Historical is
 * evidence/metadata only — never a sixth verdict.
 *
 * V1 scaling boundary: exact/bounded candidate projection only (≤20).
 * No embeddings or full-corpus search. Fine for current small corpus;
 * later indexed topic/fingerprint layer when scale requires it.
 */

import type { SeoResearchCoverage } from "@/lib/cms/ai-seo/research-schemas";
import type { SeoRefreshFirstVerdict } from "@/lib/cms/seo-next-best-action/types";
import type { PostStatus } from "@/lib/cms/types";

export type { SeoRefreshFirstVerdict };
export type SeoRefreshFirstCoverage = SeoResearchCoverage;
export type SeoRefreshFirstConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Hard caps — keep evaluate() O(bounded). */
export const SEO_REFRESH_FIRST_CAPS = {
  maxCandidates: 20,
  maxGscEvidence: 16,
  maxReservations: 40,
  topic: 120,
  slug: 80,
  url: 300,
  title: 160,
  excerpt: 180,
  reason: 280,
  path: 300,
  postId: 80,
  evidenceId: 40,
  registryKey: 120,
} as const;

export type SeoRefreshFirstCorpusCandidate = {
  postId: string;
  publicUrl: string;
  title?: string;
  slug?: string;
  seoTitle?: string;
  canonicalUrl?: string;
  status?: PostStatus | string;
  categoryName?: string;
  excerpt?: string;
};

/**
 * Pre-resolved GSC ownership evidence only — no API calls inside Governor.
 * Qualitative/structured; no arbitrary numeric thresholds in V1.
 */
export type SeoRefreshFirstGscOwnershipEvidence = {
  /** Normalized site path (trailing slash). */
  normalizedPath: string;
  /** Upstream classification (e.g. CURRENT_CMS). */
  classification: string;
  /** True when this page owns the related query/page relationship for the opportunity. */
  ownsRelatedQueryPage?: boolean;
  evidenceId?: string;
  /** Optional resolved CMS post id when upstream already mapped path → post. */
  relatedPostId?: string;
};

export type SeoRefreshFirstHistoricalCandidate = {
  path: string;
  registryKey?: string;
  classification?: string;
  restoreEligible?: boolean;
  /** Hint only — Governor does not choose final disposition. */
  dispositionHint?: string;
};

export type SeoRefreshFirstReservations = {
  /** Draft BlogPost slug reservations (normalized). */
  draftSlugs?: string[];
  /** Draft topic keys (slugified). */
  draftTopicKeys?: string[];
  /** Planning topic keys supplied by caller — Governor does not query Planning. */
  reservedTopicKeys?: string[];
  /** Planning slug keys supplied by caller. */
  reservedSlugs?: string[];
};

export type SeoRefreshFirstOpportunitySlice = {
  topic?: string;
  workingTitle?: string;
  proposedSlug?: string;
  searchIntent?: string;
  existingCoverage?: SeoRefreshFirstCoverage;
  matchedPublicUrl?: string | null;
  confidence?: string;
  whyNow?: string;
  webEvidence?: string;
  /** Explicit flag; otherwise inferred from whyNow/webEvidence materiality. */
  webEvidencePresent?: boolean;
  /** True when relevant GSC opportunity evidence was attached upstream. */
  gscOpportunityEvidencePresent?: boolean;
};

export type SeoRefreshFirstSignals = {
  duplicate?: boolean;
  cannibalizationRisk?: boolean;
};

/**
 * Bounded evaluate input. Corpus candidates must include authoritative postId.
 * When corpusComplete is false/undefined, PASS_NEW_CONTENT is blocked.
 */
export type SeoRefreshFirstInput = {
  opportunity?: SeoRefreshFirstOpportunitySlice;
  /** Authoritative CMS post id — always wins over AI NONE / soft signals. */
  targetPostId?: string | null;
  candidates?: SeoRefreshFirstCorpusCandidate[];
  gscOwnership?: SeoRefreshFirstGscOwnershipEvidence[];
  historical?: SeoRefreshFirstHistoricalCandidate | null;
  reservations?: SeoRefreshFirstReservations;
  signals?: SeoRefreshFirstSignals;
  /**
   * True only when caller asserts the candidate projection covers the full
   * relevant Blog corpus for this decision. Incomplete → no PASS.
   */
  corpusComplete?: boolean;
};

export type SeoRefreshFirstTarget = {
  postId: string;
  publicUrl?: string;
};

export type SeoRefreshFirstEvidence = {
  exactPostMatch: boolean;
  exactSlugMatch: boolean;
  exactUrlMatch: boolean;
  canonicalMatch: boolean;
  gscOwnership: boolean;
  historicalPath: string | null;
  candidateCount: number;
  duplicate: boolean;
  cannibalizationRisk: boolean;
  draftReservation: boolean;
  planningReservation: boolean;
  existingCoverage: SeoRefreshFirstCoverage | null;
  corpusComplete: boolean;
  materialEvidence: boolean;
};

export type SeoRefreshFirstHistoricalOutput = {
  path: string;
  registryKey?: string;
  classification?: string;
  restoreEligible: boolean;
  dispositionHint?: string;
};

export type SeoRefreshFirstResult = {
  verdict: SeoRefreshFirstVerdict;
  confidence: SeoRefreshFirstConfidence;
  target?: SeoRefreshFirstTarget;
  reason: string;
  evidence: SeoRefreshFirstEvidence;
  historicalCandidate?: SeoRefreshFirstHistoricalOutput;
  fingerprint: string;
};
