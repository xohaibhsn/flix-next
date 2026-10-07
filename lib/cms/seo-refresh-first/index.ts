/**
 * Refresh-First Governor V1 — public server/domain exports.
 * Pure evaluate + bounded corpus projection. No providers. No CMS writes.
 * Not wired into Opportunities UI / Proceed / Planning (Option A).
 */

export {
  SEO_REFRESH_FIRST_CAPS,
  type SeoRefreshFirstConfidence,
  type SeoRefreshFirstCorpusCandidate,
  type SeoRefreshFirstCoverage,
  type SeoRefreshFirstEvidence,
  type SeoRefreshFirstGscOwnershipEvidence,
  type SeoRefreshFirstHistoricalCandidate,
  type SeoRefreshFirstHistoricalOutput,
  type SeoRefreshFirstInput,
  type SeoRefreshFirstOpportunitySlice,
  type SeoRefreshFirstReservations,
  type SeoRefreshFirstResult,
  type SeoRefreshFirstSignals,
  type SeoRefreshFirstTarget,
  type SeoRefreshFirstVerdict,
} from "@/lib/cms/seo-refresh-first/types";

export {
  buildSeoRefreshFirstFingerprint,
  evaluateSeoRefreshFirst,
} from "@/lib/cms/seo-refresh-first/evaluate";

export { buildSeoRefreshFirstCorpusCandidates } from "@/lib/cms/seo-refresh-first/corpus";
