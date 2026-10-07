/**
 * SEO Next-Best-Action Engine V1 — public server/domain exports.
 * Pure decide + Planning map. No providers. No CMS writes.
 */

export {
  SEO_HISTORICAL_DISPOSITIONS,
  SEO_NEXT_BEST_ACTIONS,
  SEO_NEXT_BEST_HOLD_REASONS,
  SEO_NEXT_BEST_STATUSES,
  SEO_REFRESH_FIRST_VERDICTS,
  type MapToPlanningOptions,
  type SeoHistoricalDisposition,
  type SeoNextBestAction,
  type SeoNextBestActionDecision,
  type SeoNextBestActionInput,
  type SeoNextBestAlternative,
  type SeoNextBestConfidence,
  type SeoNextBestCorpusSlice,
  type SeoNextBestCoverage,
  type SeoNextBestEvidence,
  type SeoNextBestEvidenceSlice,
  type SeoNextBestHistoricalSlice,
  type SeoNextBestHoldReason,
  type SeoNextBestOpportunitySlice,
  type SeoNextBestPrioritySlots,
  type SeoNextBestStatus,
  type SeoNextBestTarget,
  type SeoNextBestTechnicalSlice,
  type SeoRefreshFirstVerdict,
} from "@/lib/cms/seo-next-best-action/types";

export {
  buildSeoNextBestActionFingerprint,
  buildSeoNextBestActionFingerprintAlias,
  decideSeoNextBestAction,
} from "@/lib/cms/seo-next-best-action/decide";

export {
  mapSeoNextBestActionToPlanningRecommendation,
  mapSeoNextBestDecisionToPlanningRecommendation,
} from "@/lib/cms/seo-next-best-action/map-to-planning";
