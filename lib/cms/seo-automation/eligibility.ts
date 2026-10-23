/**
 * Autonomous NEW_BLOG eligibility gate for SEO Automation.
 *
 * Priority score alone never authorizes creation. REFRESH / RESTORE / HOLD /
 * SKIP / INTERNAL_LINK are rejected for autonomous NEW_BLOG Apply.
 */

export const SEO_AUTOMATION_ELIGIBILITY_SPEC = "seo-automation-new-blog-eligibility-v1" as const;

export type SeoAutomationNbaAction =
  | "NEW_BLOG"
  | "REFRESH_EXISTING"
  | "RESTORE_HISTORICAL"
  | "HOLD"
  | "SKIP"
  | "INTERNAL_LINK"
  | string;

export type SeoAutomationEligibilityInput = {
  refreshFirstVerdict: string | null | undefined;
  nbaAction: SeoAutomationNbaAction | null | undefined;
  autonomousEligible: boolean | null | undefined;
  automationSelectable: boolean | null | undefined;
  hasValidResearchProvenance: boolean;
  hasFirstPartyContentGap: boolean;
  hasSuitableSearchIntentEvidence: boolean;
  hasExistingEquivalentContent: boolean;
  hasProtectedTargetConflict: boolean;
  /** Opportunity-owned GSC query×page evidence when required by evidence pack. */
  hasOpportunityOwnedGscEvidence: boolean | null | undefined;
  gscRequired: boolean;
  /** UNKNOWN must not be treated as 404/RESTORE. */
  urlStatusUnknown: boolean;
  priorityScore?: number | null;
};

export type SeoAutomationEligibilityResult =
  | {
      ok: true;
      spec: typeof SEO_AUTOMATION_ELIGIBILITY_SPEC;
      eligible: true;
      code: "ELIGIBLE_NEW_BLOG";
    }
  | {
      ok: false;
      spec: typeof SEO_AUTOMATION_ELIGIBILITY_SPEC;
      eligible: false;
      code:
        | "NO_ELIGIBLE_NEW_BLOG"
        | "REFRESH_REJECTED"
        | "RESTORE_REJECTED"
        | "HOLD_REJECTED"
        | "SKIP_REJECTED"
        | "INTERNAL_LINK_REJECTED"
        | "RF_NOT_PASS_NEW_CONTENT"
        | "AUTONOMOUS_NOT_ELIGIBLE"
        | "AUTOMATION_NOT_SELECTABLE"
        | "MISSING_PROVENANCE"
        | "MISSING_CONTENT_GAP"
        | "MISSING_SEARCH_INTENT"
        | "EQUIVALENT_CONTENT_EXISTS"
        | "PROTECTED_TARGET_CONFLICT"
        | "MISSING_OPPORTUNITY_GSC"
        | "UNKNOWN_URL_STATUS"
        | "PRIORITY_OVERRIDE_REJECTED";
      reason: string;
    };

type SeoAutomationEligibilityFailureCode = Extract<
  SeoAutomationEligibilityResult,
  { ok: false }
>["code"];

const REJECT_ACTIONS: Record<string, SeoAutomationEligibilityFailureCode> = {
  REFRESH_EXISTING: "REFRESH_REJECTED",
  REFRESH: "REFRESH_REJECTED",
  RESTORE_HISTORICAL: "RESTORE_REJECTED",
  RESTORE: "RESTORE_REJECTED",
  HOLD: "HOLD_REJECTED",
  SKIP: "SKIP_REJECTED",
  INTERNAL_LINK: "INTERNAL_LINK_REJECTED",
};

function fail(
  code: SeoAutomationEligibilityFailureCode,
  reason: string,
): SeoAutomationEligibilityResult {
  return {
    ok: false,
    spec: SEO_AUTOMATION_ELIGIBILITY_SPEC,
    eligible: false,
    code,
    reason,
  };
}

/**
 * Deterministic eligibility. Does not call providers or mutate CMS state.
 */
export function evaluateAutonomousNewBlogEligibility(
  input: SeoAutomationEligibilityInput,
): SeoAutomationEligibilityResult {
  const action = String(input.nbaAction || "")
    .trim()
    .toUpperCase();

  if (action in REJECT_ACTIONS) {
    return fail(
      REJECT_ACTIONS[action],
      `${action} cannot authorize autonomous NEW_BLOG creation. Use the manual editorial workflow when appropriate.`,
    );
  }

  if (action !== "NEW_BLOG") {
    return fail("NO_ELIGIBLE_NEW_BLOG", `NBA action "${action || "absent"}" is not NEW_BLOG.`);
  }

  if (String(input.refreshFirstVerdict || "").trim().toUpperCase() !== "PASS_NEW_CONTENT") {
    return fail(
      "RF_NOT_PASS_NEW_CONTENT",
      "Refresh-First must be PASS_NEW_CONTENT for autonomous NEW_BLOG.",
    );
  }

  if (input.autonomousEligible !== true) {
    return fail("AUTONOMOUS_NOT_ELIGIBLE", "autonomousEligible must be true.");
  }

  if (input.automationSelectable !== true) {
    return fail("AUTOMATION_NOT_SELECTABLE", "automationSelectable must be true.");
  }

  if (!input.hasValidResearchProvenance) {
    return fail("MISSING_PROVENANCE", "Valid Research provenance is required.");
  }

  if (!input.hasFirstPartyContentGap) {
    return fail("MISSING_CONTENT_GAP", "A valid first-party content gap is required.");
  }

  if (!input.hasSuitableSearchIntentEvidence) {
    return fail("MISSING_SEARCH_INTENT", "Suitable search-intent evidence is required.");
  }

  if (input.hasExistingEquivalentContent) {
    return fail("EQUIVALENT_CONTENT_EXISTS", "Equivalent content already exists.");
  }

  if (input.hasProtectedTargetConflict) {
    return fail("PROTECTED_TARGET_CONFLICT", "Protected target conflict blocks NEW_BLOG.");
  }

  if (input.urlStatusUnknown) {
    return fail(
      "UNKNOWN_URL_STATUS",
      "UNKNOWN URL status must not be treated as 404 or RESTORE for NEW_BLOG.",
    );
  }

  if (input.gscRequired && input.hasOpportunityOwnedGscEvidence !== true) {
    return fail(
      "MISSING_OPPORTUNITY_GSC",
      "Opportunity-owned GSC query×page evidence is required. Run-level GSC AVAILABLE is insufficient.",
    );
  }

  // Explicitly ignore priority score as an override — documented rejection if someone
  // tries to force eligibility with score alone (caller may still pass score for audit).
  void input.priorityScore;

  return {
    ok: true,
    spec: SEO_AUTOMATION_ELIGIBILITY_SPEC,
    eligible: true,
    code: "ELIGIBLE_NEW_BLOG",
  };
}
