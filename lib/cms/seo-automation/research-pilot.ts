/**
 * Bounded supervised UK Research pilot — preparation + gate only.
 *
 * Does not invoke OpenAI / GSC unless every prerequisite and operation-specific
 * authorization is present. No retries. No model fallback.
 */

import {
  SEO_AUTOMATION_PILOT_LIMITS,
  authorizePilotSpend,
  emptyPilotUsage,
  requireBoundedCostEstimate,
  type SeoAutomationPilotUsage,
} from "@/lib/cms/seo-automation/budgets";
import { assertSeoAutomationPathAllowed } from "@/lib/cms/seo-automation/master-control";

export const SEO_AUTOMATION_RESEARCH_PILOT_SPEC = "seo-automation-research-pilot-v1" as const;

export type SeoAutomationResearchPilotPrereq = {
  openaiUkResearchConfigured: boolean;
  modelAllowlisted: boolean;
  pricingKnown: boolean;
  estimatedCostUsd: number | null;
  operationSpecificAuthorization: boolean;
  usage: SeoAutomationPilotUsage;
};

export type SeoAutomationResearchPilotDecision =
  | {
      ok: true;
      spec: typeof SEO_AUTOMATION_RESEARCH_PILOT_SPEC;
      /** Live paid call is never auto-executed from this helper. */
      executeLiveCall: false;
      bounds: {
        maxOpportunities: 5;
        maxOutputTokens: typeof SEO_AUTOMATION_PILOT_LIMITS.maxResearchOutputTokens;
        maxProviderTimeoutMs: typeof SEO_AUTOMATION_PILOT_LIMITS.maxResearchProviderTimeoutMs;
        maxBoundedGscReads: typeof SEO_AUTOMATION_PILOT_LIMITS.maxBoundedGscReads;
        maxLedgerPersistenceAttempts: 1;
        maxAssociatedLedgerDecisions: 5;
        retries: 0;
        modelFallback: false;
      };
      message: string;
    }
  | {
      ok: false;
      spec: typeof SEO_AUTOMATION_RESEARCH_PILOT_SPEC;
      code: string;
      error: string;
      executeLiveCall: false;
    };

/**
 * Validate prerequisites for ONE bounded Research invocation.
 * Always returns executeLiveCall=false — caller must obtain separate live authority.
 */
export function prepareBoundedUkResearchPilot(
  prereq: SeoAutomationResearchPilotPrereq,
): SeoAutomationResearchPilotDecision {
  const path = assertSeoAutomationPathAllowed("research");
  if (!path.ok) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
      code: path.code,
      error: path.error,
      executeLiveCall: false,
    };
  }
  if (!prereq.operationSpecificAuthorization) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
      code: "missing_operation_authority",
      error:
        "Operation-specific execution authorization is required before a live paid Research call.",
      executeLiveCall: false,
    };
  }
  if (!prereq.openaiUkResearchConfigured || !prereq.modelAllowlisted) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
      code: "provider_not_ready",
      error: "UK Research OpenAI configuration / allowlist not verified.",
      executeLiveCall: false,
    };
  }
  if (!prereq.pricingKnown) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
      code: "pricing_unknown",
      error: "Research pricing unavailable; paid invocation skipped.",
      executeLiveCall: false,
    };
  }
  const cost = requireBoundedCostEstimate(prereq.estimatedCostUsd);
  if (!cost.ok) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
      code: cost.code,
      error: cost.error,
      executeLiveCall: false,
    };
  }
  const spend = authorizePilotSpend(prereq.usage ?? emptyPilotUsage(), "researchInvocations", 1);
  if (!spend.ok) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
      code: spend.code,
      error: spend.error,
      executeLiveCall: false,
    };
  }
  return {
    ok: true,
    spec: SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
    executeLiveCall: false,
    bounds: {
      maxOpportunities: 5,
      maxOutputTokens: SEO_AUTOMATION_PILOT_LIMITS.maxResearchOutputTokens,
      maxProviderTimeoutMs: SEO_AUTOMATION_PILOT_LIMITS.maxResearchProviderTimeoutMs,
      maxBoundedGscReads: SEO_AUTOMATION_PILOT_LIMITS.maxBoundedGscReads,
      maxLedgerPersistenceAttempts: 1,
      maxAssociatedLedgerDecisions: 5,
      retries: 0,
      modelFallback: false,
    },
    message:
      "Pilot bounds validated. Live Research remains unexecuted until operation-specific live authority is granted.",
  };
}

/** Result code when a completed run yields zero autonomous NEW_BLOG opportunities. */
export const SEO_AUTOMATION_NO_ELIGIBLE_NEW_BLOG = "NO_ELIGIBLE_NEW_BLOG" as const;
