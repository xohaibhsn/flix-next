/**
 * SEO Opportunity Priority Score V1 — public exports.
 * Pure ranking. No providers. No CMS writes. No eligibility re-decision.
 * Not wired into Opportunities UI / Proceed / adapter (Option A).
 */

export {
  SEO_PRIORITY_CAPS,
  SEO_PRIORITY_COMPLETENESS,
  SEO_PRIORITY_COMPONENT_NAMES,
  SEO_PRIORITY_EFFORTS,
  SEO_PRIORITY_SCORE_VERSION,
  SEO_PRIORITY_TIERS,
  type SeoPriorityComponent,
  type SeoPriorityComponentName,
  type SeoPriorityEffort,
  type SeoPriorityEvidenceCompleteness,
  type SeoPriorityGscEvidence,
  type SeoPriorityGscTrend,
  type SeoPriorityInput,
  type SeoPriorityOpportunitySlice,
  type SeoPriorityResult,
  type SeoPriorityScoreVersion,
  type SeoPriorityTier,
} from "@/lib/cms/seo-priority/types";

export {
  SEO_PRIORITY_SCORE_MAX,
  SEO_PRIORITY_SCORE_MIN,
  SEO_PRIORITY_TIER_HIGH_MIN,
  SEO_PRIORITY_TIER_MEDIUM_MIN,
  MAX_CONFIDENCE_POINTS,
  MAX_COVERAGE_POINTS,
  MAX_DEMAND_POINTS,
  MAX_MOMENTUM_POINTS,
  MAX_OPPORTUNITY_POINTS,
  MAX_RISK_PENALTY,
} from "@/lib/cms/seo-priority/weights";

export {
  buildSeoPriorityFingerprint,
  impressionsBucket,
  impressionsPoints,
  isAutomationSelectable,
  positionBucket,
  positionPoints,
  scoreSeoPriority,
  tierFromScore,
} from "@/lib/cms/seo-priority/score";
