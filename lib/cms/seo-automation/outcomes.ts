/**
 * 7/14/28-day GSC outcome measurement for genuinely published experimental articles.
 *
 * Missing GSC evidence ≠ zero performance. No fabricated improvement %.
 * Recurring collection remains OFF until budgets + scheduler readiness.
 */

import { assertSeoAutomationPathAllowed } from "@/lib/cms/seo-automation/master-control";

export const SEO_AUTOMATION_OUTCOMES_SPEC = "seo-automation-gsc-outcomes-v1" as const;

export type SeoAutomationOutcomeWindow = 7 | 14 | 28;

export type SeoAutomationOutcomeBaseline = {
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  averagePosition: number | null;
  capturedAt: string | null;
  evidenceStatus: "present" | "missing" | "lagging" | "unknown";
};

export type SeoAutomationOutcomeWindowMetrics = SeoAutomationOutcomeBaseline & {
  windowDays: SeoAutomationOutcomeWindow;
  deltaImpressions: number | null;
  deltaClicks: number | null;
  deltaCtr: number | null;
  deltaAveragePosition: number | null;
  /** Never invent causal SEO improvement without appropriate evidence. */
  causalImprovementClaimed: false;
};

export type SeoAutomationOutcomeRecord = {
  researchOpportunityId: string;
  ledgerDecisionId: string | null;
  planningId: string;
  blogPostId: string;
  publishedCanonicalUrl: string;
  publicationTimestamp: string;
  baseline: SeoAutomationOutcomeBaseline;
  day7: SeoAutomationOutcomeWindowMetrics | null;
  day14: SeoAutomationOutcomeWindowMetrics | null;
  day28: SeoAutomationOutcomeWindowMetrics | null;
  experimentStatus: "instrumented" | "awaiting_gsc_lag" | "complete" | "blocked";
  aiProviderCostUsd: number | null;
};

export function buildEmptyOutcomeWindow(
  windowDays: SeoAutomationOutcomeWindow,
): SeoAutomationOutcomeWindowMetrics {
  return {
    windowDays,
    impressions: null,
    clicks: null,
    ctr: null,
    averagePosition: null,
    capturedAt: null,
    evidenceStatus: "missing",
    deltaImpressions: null,
    deltaClicks: null,
    deltaCtr: null,
    deltaAveragePosition: null,
    causalImprovementClaimed: false,
  };
}

/**
 * Compute deltas only when both sides have numeric evidence.
 * Missing evidence stays null — never coerced to zero.
 */
export function computeOutcomeDeltas(
  baseline: SeoAutomationOutcomeBaseline,
  window: Omit<SeoAutomationOutcomeWindowMetrics, "deltaImpressions" | "deltaClicks" | "deltaCtr" | "deltaAveragePosition" | "causalImprovementClaimed">,
): Pick<
  SeoAutomationOutcomeWindowMetrics,
  "deltaImpressions" | "deltaClicks" | "deltaCtr" | "deltaAveragePosition" | "causalImprovementClaimed"
> {
  const delta = (a: number | null, b: number | null) =>
    a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) ? null : b - a;
  return {
    deltaImpressions: delta(baseline.impressions, window.impressions),
    deltaClicks: delta(baseline.clicks, window.clicks),
    deltaCtr: delta(baseline.ctr, window.ctr),
    deltaAveragePosition: delta(baseline.averagePosition, window.averagePosition),
    causalImprovementClaimed: false,
  };
}

export type SeoAutomationOutcomeCollectDecision =
  | { ok: false; code: string; error: string }
  | { ok: true; executed: false; reason: "recurring_outcomes_off" | "gsc_lag_observe_only" };

/**
 * Bounded outcome collection gate. Does not call GSC while recurring path is OFF.
 */
export function evaluateOutcomeCollectionGate(args: {
  record: Pick<SeoAutomationOutcomeRecord, "publicationTimestamp" | "publishedCanonicalUrl">;
  now?: Date;
}): SeoAutomationOutcomeCollectDecision {
  const path = assertSeoAutomationPathAllowed("outcomes_recurring");
  if (!path.ok) {
    return { ok: false, code: path.code, error: path.error };
  }
  if (!String(args.record.publishedCanonicalUrl || "").trim()) {
    return { ok: false, code: "missing_canonical", error: "Published canonical URL required." };
  }
  const published = Date.parse(args.record.publicationTimestamp);
  if (!Number.isFinite(published)) {
    return { ok: false, code: "invalid_publication_timestamp", error: "Invalid publication timestamp." };
  }
  // GSC reporting lag — observe, do not treat as zero.
  return { ok: true, executed: false, reason: "recurring_outcomes_off" };
}
