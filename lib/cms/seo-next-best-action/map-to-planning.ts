/**
 * Pure mapping from Next-Best-Action decisions to current Planning recommendations.
 * Does not expand Planning enums. Does not create Planning drafts.
 */

import type { SeoPlanningActionableRecommendation } from "@/lib/cms/seo-planning/constants";
import type {
  MapToPlanningOptions,
  SeoNextBestAction,
  SeoNextBestActionDecision,
} from "@/lib/cms/seo-next-best-action/types";

/**
 * Map a decision-layer action to a Planning recommendation, or null when
 * the action must not enter the Planning Proceed workflow.
 */
export function mapSeoNextBestActionToPlanningRecommendation(
  action: SeoNextBestAction,
  options: MapToPlanningOptions = {},
  decision?: Pick<SeoNextBestActionDecision, "historicalDisposition">,
): SeoPlanningActionableRecommendation | null {
  switch (action) {
    case "NEW_BLOG":
      return "NEW_BLOG";
    case "REFRESH_EXISTING":
      return "REFRESH_EXISTING";
    case "INTERNAL_LINKS":
      return options.requestPlanningArtifact ? "INTERNAL_LINK_ONLY" : null;
    case "HISTORICAL_RECOVERY": {
      const allowContentRecovery = options.historicalContentRecovery !== false;
      if (!allowContentRecovery) return null;
      const disposition = decision?.historicalDisposition;
      // Omitted disposition is treated as recreate intent for mapping callers that already
      // selected HISTORICAL_RECOVERY as a content-recovery action.
      if (disposition && disposition !== "RECREATE") return null;
      return "RESTORE_HISTORICAL";
    }
    case "TITLE_META_UPDATE":
    case "IMAGE":
    case "INDEXING_REVIEW":
    case "TECHNICAL_FIX":
    case "DO_NOTHING":
      return null;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function mapSeoNextBestDecisionToPlanningRecommendation(
  decision: SeoNextBestActionDecision,
  options: MapToPlanningOptions = {},
): SeoPlanningActionableRecommendation | null {
  return mapSeoNextBestActionToPlanningRecommendation(decision.action, options, decision);
}
