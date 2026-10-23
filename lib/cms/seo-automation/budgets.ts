/**
 * Finite AI / GSC spend budgets for SEO Automation.
 * Server-side enforcement helpers — never trust client budget claims.
 */

export const SEO_AUTOMATION_BUDGET_SPEC = "seo-automation-budget-v1" as const;

/** First supervised pilot ceilings (aggregate task). */
export const SEO_AUTOMATION_PILOT_LIMITS = {
  maxResearchInvocations: 1,
  maxBoundedGscReads: 4,
  maxLedgerRunPersistenceAttempts: 1,
  maxOpportunityDecisions: 5,
  maxArticleGenerations: 1,
  maxArticleDraftApplies: 1,
  maxImages: 2,
  maxSupervisedPublications: 1,
  maxRepairAttempts: 1,
  maxAutomaticRetries: 0,
  maxResearchOutputTokens: 2200,
  maxResearchProviderTimeoutMs: 30_000,
  allowRecurrence: false,
} as const;

export type SeoAutomationPilotUsage = {
  researchInvocations: number;
  boundedGscReads: number;
  ledgerPersistenceAttempts: number;
  opportunityDecisions: number;
  articleGenerations: number;
  articleDraftApplies: number;
  images: number;
  supervisedPublications: number;
  repairAttempts: number;
  automaticRetries: number;
};

export type SeoAutomationBudgetDecision =
  | { ok: true; spec: typeof SEO_AUTOMATION_BUDGET_SPEC; remaining: SeoAutomationPilotUsage }
  | {
      ok: false;
      spec: typeof SEO_AUTOMATION_BUDGET_SPEC;
      code: "budget_exceeded" | "cost_unbounded" | "recurrence_blocked";
      error: string;
      dimension: keyof SeoAutomationPilotUsage | "aggregate" | "allowRecurrence";
    };

function remainingFrom(usage: SeoAutomationPilotUsage): SeoAutomationPilotUsage {
  const L = SEO_AUTOMATION_PILOT_LIMITS;
  return {
    researchInvocations: Math.max(0, L.maxResearchInvocations - usage.researchInvocations),
    boundedGscReads: Math.max(0, L.maxBoundedGscReads - usage.boundedGscReads),
    ledgerPersistenceAttempts: Math.max(
      0,
      L.maxLedgerRunPersistenceAttempts - usage.ledgerPersistenceAttempts,
    ),
    opportunityDecisions: Math.max(0, L.maxOpportunityDecisions - usage.opportunityDecisions),
    articleGenerations: Math.max(0, L.maxArticleGenerations - usage.articleGenerations),
    articleDraftApplies: Math.max(0, L.maxArticleDraftApplies - usage.articleDraftApplies),
    images: Math.max(0, L.maxImages - usage.images),
    supervisedPublications: Math.max(
      0,
      L.maxSupervisedPublications - usage.supervisedPublications,
    ),
    repairAttempts: Math.max(0, L.maxRepairAttempts - usage.repairAttempts),
    automaticRetries: Math.max(0, L.maxAutomaticRetries - usage.automaticRetries),
  };
}

export function emptyPilotUsage(): SeoAutomationPilotUsage {
  return {
    researchInvocations: 0,
    boundedGscReads: 0,
    ledgerPersistenceAttempts: 0,
    opportunityDecisions: 0,
    articleGenerations: 0,
    articleDraftApplies: 0,
    images: 0,
    supervisedPublications: 0,
    repairAttempts: 0,
    automaticRetries: 0,
  };
}

/**
 * Authorize one incremental spend dimension. Fail-closed when over ceiling.
 */
export function authorizePilotSpend(
  usage: SeoAutomationPilotUsage,
  dimension: keyof SeoAutomationPilotUsage,
  amount = 1,
): SeoAutomationBudgetDecision {
  if (amount < 1 || !Number.isFinite(amount)) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_BUDGET_SPEC,
      code: "budget_exceeded",
      error: "Invalid spend amount.",
      dimension: "aggregate",
    };
  }
  const next = { ...usage, [dimension]: usage[dimension] + amount };
  const rem = remainingFrom(next);
  // remainingFrom clamps at 0; detect exceed by comparing before clamp.
  const limits: Record<keyof SeoAutomationPilotUsage, number> = {
    researchInvocations: SEO_AUTOMATION_PILOT_LIMITS.maxResearchInvocations,
    boundedGscReads: SEO_AUTOMATION_PILOT_LIMITS.maxBoundedGscReads,
    ledgerPersistenceAttempts: SEO_AUTOMATION_PILOT_LIMITS.maxLedgerRunPersistenceAttempts,
    opportunityDecisions: SEO_AUTOMATION_PILOT_LIMITS.maxOpportunityDecisions,
    articleGenerations: SEO_AUTOMATION_PILOT_LIMITS.maxArticleGenerations,
    articleDraftApplies: SEO_AUTOMATION_PILOT_LIMITS.maxArticleDraftApplies,
    images: SEO_AUTOMATION_PILOT_LIMITS.maxImages,
    supervisedPublications: SEO_AUTOMATION_PILOT_LIMITS.maxSupervisedPublications,
    repairAttempts: SEO_AUTOMATION_PILOT_LIMITS.maxRepairAttempts,
    automaticRetries: SEO_AUTOMATION_PILOT_LIMITS.maxAutomaticRetries,
  };
  if (next[dimension] > limits[dimension]) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_BUDGET_SPEC,
      code: "budget_exceeded",
      error: `Pilot budget exceeded for ${dimension}.`,
      dimension,
    };
  }
  return {
    ok: true,
    spec: SEO_AUTOMATION_BUDGET_SPEC,
    remaining: rem,
  };
}

/**
 * If a reliable pre-call cost estimate cannot be produced, skip the paid call.
 */
export function requireBoundedCostEstimate(estimateUsd: number | null | undefined): SeoAutomationBudgetDecision {
  if (estimateUsd == null || !Number.isFinite(estimateUsd) || estimateUsd < 0) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_BUDGET_SPEC,
      code: "cost_unbounded",
      error: "Provider cost cannot be bounded safely; paid invocation skipped.",
      dimension: "aggregate",
    };
  }
  return {
    ok: true,
    spec: SEO_AUTOMATION_BUDGET_SPEC,
    remaining: emptyPilotUsage(),
  };
}

export function assertRecurrenceBlocked(): SeoAutomationBudgetDecision {
  if (!SEO_AUTOMATION_PILOT_LIMITS.allowRecurrence) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_BUDGET_SPEC,
      code: "recurrence_blocked",
      error: "Recurring automation is blocked until supervised pilot acceptance.",
      dimension: "allowRecurrence",
    };
  }
  return { ok: true, spec: SEO_AUTOMATION_BUDGET_SPEC, remaining: emptyPilotUsage() };
}
