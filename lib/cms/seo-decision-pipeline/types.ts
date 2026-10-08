/**
 * SEO Decision Pipeline Adapter V1 — contracts.
 * Composes Research → Refresh-First → NBA → Priority.
 * Zero providers, zero GSC API calls, zero writes. Not a fifth decision engine.
 */

import type {
  SeoResearchCoverage,
  SeoResearchGscEvidence,
  SeoResearchIntent,
  SeoResearchOpportunity,
  SeoResearchRecommendation,
} from "@/lib/cms/ai-seo/research-schemas";
import type { SeoNextBestActionDecision } from "@/lib/cms/seo-next-best-action/types";
import type {
  SeoRefreshFirstCorpusCandidate,
  SeoRefreshFirstReservations,
  SeoRefreshFirstResult,
} from "@/lib/cms/seo-refresh-first/types";
import type { SeoPriorityResult } from "@/lib/cms/seo-priority/types";
import type { PostStatus } from "@/lib/cms/types";

export const SEO_DECISION_PIPELINE_VERSION = "v1" as const;
export type SeoDecisionPipelineVersion = typeof SEO_DECISION_PIPELINE_VERSION;

export const SEO_DECISION_PIPELINE_CAPS = {
  maxOpportunities: 5,
  maxCandidates: 20,
  maxReservations: 40,
  maxGscEvidence: 8,
  topic: 120,
  workingTitle: 140,
  slug: 80,
  url: 300,
  postId: 80,
  errorMessage: 200,
  opportunityFingerprintMaterial: 480,
} as const;

export const SEO_DECISION_PIPELINE_EVALUATION_STATUSES = [
  "OK",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
] as const;
export type SeoDecisionPipelineEvaluationStatus =
  (typeof SEO_DECISION_PIPELINE_EVALUATION_STATUSES)[number];

/** Lightweight Blog identity — no body content. */
export type SeoDecisionPipelineBlogIdentity = {
  postId: string;
  publicUrl: string;
  slug: string;
  title: string;
  seoTitle?: string;
  canonicalUrl?: string;
  status: PostStatus | string;
  categoryName?: string;
  excerpt?: string;
};

export type SeoDecisionPipelineResolvedTarget = {
  postId: string;
  publicUrl: string;
  slug: string;
  status: PostStatus | string;
  title?: string;
};

export type SeoDecisionPipelineOpportunitySlice = {
  topic: string;
  workingTitle: string;
  searchIntent?: SeoResearchIntent | string;
  recommendation: SeoResearchRecommendation | string;
  existingCoverage?: SeoResearchCoverage | null;
  matchedPublicUrl?: string | null;
  restorePath?: string;
  confidence?: string;
  whyNow?: string;
  webEvidence?: string;
  gscEvidenceRefs?: string[];
  historicalSignal?: boolean;
};

export type SeoDecisionPipelineContext = {
  /** Full lightweight Blog identities for exact lookup (not truncated). */
  blogIdentities: SeoDecisionPipelineBlogIdentity[];
  /** Total eligible Blog count used for completeness. */
  totalBlogCount: number;
  /**
   * True only when the Blog search space is fully covered by Governor
   * evaluation (total ≤ maxCandidates) AND Planning reservations were not truncated.
   */
  corpusComplete: boolean;
  /** Governor-capped candidate projection (≤20). */
  candidates: SeoRefreshFirstCorpusCandidate[];
  reservations: SeoRefreshFirstReservations;
  /** True when active Planning drafts exceeded the reservation cap. */
  reservationsTruncated: boolean;
  categoryNameById?: ReadonlyMap<string, string>;
  source?: {
    runId?: string;
  };
};

export type SeoDecisionPipelineResult = {
  pipelineVersion: SeoDecisionPipelineVersion;
  pipelineFingerprint: string;
  evaluationStatus: SeoDecisionPipelineEvaluationStatus;
  opportunityIdentity: string;
  opportunity: SeoDecisionPipelineOpportunitySlice;
  refreshFirst: SeoRefreshFirstResult | null;
  nextBestAction: SeoNextBestActionDecision | null;
  priority: SeoPriorityResult | null;
  resolvedTarget: SeoDecisionPipelineResolvedTarget | null;
  errorCode?: string;
  errorMessage?: string;
};

export type SeoDecisionPipelineBatchResult = {
  pipelineVersion: SeoDecisionPipelineVersion;
  results: SeoDecisionPipelineResult[];
};

/** Input shape accepted by pure evaluate — normalized Research opportunity. */
export type SeoDecisionPipelineOpportunityInput = SeoResearchOpportunity;

/** Optional GSC evidence already attached on the Research opportunity. */
export type SeoDecisionPipelineGscEvidence = SeoResearchGscEvidence;
