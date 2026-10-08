/**
 * SEO Opportunity Priority Score V1 — contracts.
 * Pure ranking of already-decided NBA actions. Never re-decides eligibility.
 *
 * Autonomous Blog selection still requires:
 *   decision.action === "NEW_BLOG" && decision.autonomousEligible === true
 */

import type { SeoResearchCoverage, SeoResearchIntent } from "@/lib/cms/ai-seo/research-schemas";
import type {
  SeoNextBestAction,
  SeoNextBestActionDecision,
  SeoNextBestConfidence,
} from "@/lib/cms/seo-next-best-action/types";
import type { SeoRefreshFirstResult } from "@/lib/cms/seo-refresh-first/types";

export const SEO_PRIORITY_SCORE_VERSION = "v1" as const;
export type SeoPriorityScoreVersion = typeof SEO_PRIORITY_SCORE_VERSION;

export const SEO_PRIORITY_TIERS = ["HIGH", "MEDIUM", "LOW"] as const;
export type SeoPriorityTier = (typeof SEO_PRIORITY_TIERS)[number];

export const SEO_PRIORITY_EFFORTS = ["LOW", "MEDIUM", "HIGH"] as const;
export type SeoPriorityEffort = (typeof SEO_PRIORITY_EFFORTS)[number];

export const SEO_PRIORITY_COMPLETENESS = ["FULL", "PARTIAL", "MINIMAL"] as const;
export type SeoPriorityEvidenceCompleteness = (typeof SEO_PRIORITY_COMPLETENESS)[number];

export const SEO_PRIORITY_COMPONENT_NAMES = [
  "demand",
  "opportunity",
  "confidence",
  "coverageDistinctness",
  "momentum",
  "risk",
] as const;
export type SeoPriorityComponentName = (typeof SEO_PRIORITY_COMPONENT_NAMES)[number];

/** Hard caps — keep score O(bounded evidence). */
export const SEO_PRIORITY_CAPS = {
  maxGscEvidence: 8,
  reason: 280,
  warning: 120,
  maxWarnings: 8,
  missingInput: 80,
  maxMissingInputs: 12,
  componentExplain: 120,
  topic: 120,
  narrative: 360,
} as const;

export type SeoPriorityGscTrend = "UP" | "DOWN" | "FLAT";

/** Pre-attached normalized GSC row — no API calls inside Priority. */
export type SeoPriorityGscEvidence = {
  id?: string;
  kind?: "query" | "page" | "query_page" | string;
  query?: string;
  pageUrl?: string;
  normalizedPath?: string | null;
  classification?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  clicksDirection?: SeoPriorityGscTrend | null;
  impressionsDirection?: SeoPriorityGscTrend | null;
  ctrDirection?: SeoPriorityGscTrend | null;
  positionDirection?: SeoPriorityGscTrend | null;
};

export type SeoPriorityOpportunitySlice = {
  topic?: string;
  whyNow?: string;
  webEvidence?: string;
  existingCoverage?: SeoResearchCoverage | null;
  searchIntent?: SeoResearchIntent | string;
  recommendation?: string;
  /** Supporting only — NBA confidence remains authoritative. */
  confidence?: SeoNextBestConfidence | string;
  webEvidencePresent?: boolean;
  gscEvidencePresent?: boolean;
};

export type SeoPriorityInput = {
  /** Already-decided NBA decision — eligibility source of truth. */
  decision: SeoNextBestActionDecision;
  refreshFirst?: SeoRefreshFirstResult | null;
  opportunity?: SeoPriorityOpportunitySlice;
  gscEvidence?: SeoPriorityGscEvidence[];
  source?: {
    runId?: string;
    opportunityFingerprint?: string;
  };
};

export type SeoPriorityComponent = {
  name: SeoPriorityComponentName;
  /** Integer points contributed (risk is negative or zero). */
  points: number;
  maxPoints: number;
  explain: string;
};

export type SeoPriorityResult = {
  score: number;
  tier: SeoPriorityTier;
  scoreVersion: SeoPriorityScoreVersion;
  components: SeoPriorityComponent[];
  reason: string;
  warnings: string[];
  effort: SeoPriorityEffort;
  evidenceCompleteness: SeoPriorityEvidenceCompleteness;
  missingInputs: string[];
  /**
   * Exact mirror of NBA Blog autonomy truth:
   * action === NEW_BLOG && autonomousEligible === true
   * Score never flips this.
   */
  automationSelectable: boolean;
  priorityFingerprint: string;
  action: SeoNextBestAction;
  decisionFingerprint: string;
  refreshFingerprint: string | null;
};
