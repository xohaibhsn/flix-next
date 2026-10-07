/**
 * SEO Next-Best-Action Engine V1 — decision-layer contracts.
 * Higher-level than Opportunities recommendations and Planning enums.
 * Provider-free. Write-free. Serializable.
 */

import type {
  SeoResearchConfidence,
  SeoResearchCoverage,
} from "@/lib/cms/ai-seo/research-schemas";

export const SEO_NEXT_BEST_ACTIONS = [
  "NEW_BLOG",
  "REFRESH_EXISTING",
  "TITLE_META_UPDATE",
  "INTERNAL_LINKS",
  "IMAGE",
  "INDEXING_REVIEW",
  "TECHNICAL_FIX",
  "HISTORICAL_RECOVERY",
  "DO_NOTHING",
] as const;
export type SeoNextBestAction = (typeof SEO_NEXT_BEST_ACTIONS)[number];

export const SEO_NEXT_BEST_STATUSES = ["ACTIONABLE", "HOLD"] as const;
export type SeoNextBestStatus = (typeof SEO_NEXT_BEST_STATUSES)[number];

export const SEO_NEXT_BEST_HOLD_REASONS = [
  "INSUFFICIENT_EVIDENCE",
  "DUPLICATE",
  "CANNIBALIZATION_RISK",
  "TECHNICAL_BLOCKER",
  "NO_WORTHWHILE_ACTION",
] as const;
export type SeoNextBestHoldReason = (typeof SEO_NEXT_BEST_HOLD_REASONS)[number];

export type SeoNextBestConfidence = SeoResearchConfidence;
export type SeoNextBestCoverage = SeoResearchCoverage;

/** Upstream Refresh-First Governor verdict consumed by decide(). */
export const SEO_REFRESH_FIRST_VERDICTS = [
  "PASS_NEW_CONTENT",
  "REFRESH_EXISTING",
  "DUPLICATE",
  "CANNIBALIZATION_RISK",
  "UNKNOWN",
] as const;
export type SeoRefreshFirstVerdict = (typeof SEO_REFRESH_FIRST_VERDICTS)[number];

/** Historical disposition hint — only RECREATE maps to Planning RESTORE_HISTORICAL. */
export const SEO_HISTORICAL_DISPOSITIONS = [
  "RECREATE",
  "REDIRECT",
  "REFRESH_EXISTING",
  "LEAVE_404",
] as const;
export type SeoHistoricalDisposition = (typeof SEO_HISTORICAL_DISPOSITIONS)[number];

export type SeoNextBestTarget =
  | { kind: "none" }
  | { kind: "blog_post"; postId: string; publicUrl?: string }
  | { kind: "historical_path"; path: string }
  | { kind: "new_topic"; topic: string; proposedSlug?: string };

export type SeoNextBestEvidence = {
  gscPresent: boolean;
  webEvidencePresent: boolean;
  corpusEvidencePresent: boolean;
  existingCoverage: SeoNextBestCoverage | null;
  matchedPostId: string | null;
  matchedUrl: string | null;
  historicalPath: string | null;
  refreshFirstVerdict: SeoRefreshFirstVerdict | null;
  duplicate: boolean;
  cannibalizationRisk: boolean;
};

export type SeoNextBestAlternative = {
  action: SeoNextBestAction;
  reason: string;
};

/** Reserved for Priority Score phase — no formula in V1. */
export type SeoNextBestPrioritySlots = {
  priorityInputs?: Record<string, unknown>;
  priorityScore?: number | null;
  priorityReason?: string;
};

export type SeoNextBestActionDecision = {
  decisionFingerprint: string;
  action: SeoNextBestAction;
  status: SeoNextBestStatus;
  holdReason: SeoNextBestHoldReason | null;
  confidence: SeoNextBestConfidence;
  autonomousEligible: boolean;
  target: SeoNextBestTarget;
  topic: string;
  reason: string;
  evidence: SeoNextBestEvidence;
  blockers: string[];
  warnings: string[];
  alternatives: SeoNextBestAlternative[];
  /** Optional parent opportunity identity for future ledger. */
  opportunityFingerprint?: string;
  actionFingerprint: string;
  historicalDisposition: SeoHistoricalDisposition | null;
  source?: {
    runId?: string;
  };
} & SeoNextBestPrioritySlots;

export type SeoNextBestOpportunitySlice = {
  recommendation?: string;
  topic?: string;
  workingTitle?: string;
  confidence?: SeoNextBestConfidence;
  existingCoverage?: SeoNextBestCoverage;
  matchedPublicUrl?: string | null;
  restorePath?: string;
  whyNow?: string;
  webEvidence?: string;
  /** True when validated GSC rows are attached to the opportunity. */
  gscEvidencePresent?: boolean;
};

export type SeoNextBestCorpusSlice = {
  matchedPostId?: string | null;
  matchedUrl?: string | null;
  existingCoverage?: SeoNextBestCoverage;
  duplicate?: boolean;
  cannibalizationRisk?: boolean;
};

export type SeoNextBestTechnicalSlice = {
  technicalBlocker?: boolean;
  indexingBlocker?: boolean;
  metadataOnly?: boolean;
  internalLinkOnly?: boolean;
  imageOnly?: boolean;
};

export type SeoNextBestHistoricalSlice = {
  registryMatch?: boolean;
  /** True when classification is eligible (e.g. REMOVED_OR_404). */
  classificationEligible?: boolean;
  restoreEligible?: boolean;
  path?: string;
  preferredDisposition?: SeoHistoricalDisposition;
};

export type SeoNextBestEvidenceSlice = {
  gscPresent?: boolean;
  webEvidencePresent?: boolean;
  corpusEvidencePresent?: boolean;
};

export type SeoNextBestActionInput = {
  opportunity?: SeoNextBestOpportunitySlice;
  corpus?: SeoNextBestCorpusSlice;
  refreshFirst?: {
    verdict: SeoRefreshFirstVerdict;
  };
  technical?: SeoNextBestTechnicalSlice;
  historical?: SeoNextBestHistoricalSlice;
  evidence?: SeoNextBestEvidenceSlice;
  source?: {
    runId?: string;
    opportunityFingerprint?: string;
  };
};

export type MapToPlanningOptions = {
  /**
   * When true, INTERNAL_LINKS may map to Planning INTERNAL_LINK_ONLY.
   * Decision engine never creates Planning itself.
   */
  requestPlanningArtifact?: boolean;
  /**
   * When true (default), HISTORICAL_RECOVERY maps to RESTORE_HISTORICAL
   * only if disposition is RECREATE (or disposition omitted/null treated as recreate intent).
   */
  historicalContentRecovery?: boolean;
};
