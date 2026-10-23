/**
 * Mandatory PrePublish QA gate for the SEO Automation publication pathway.
 * Deterministic QA cannot be silently bypassed by AI.
 */

import type { PrePublishQaResult } from "@/lib/cms/seo-prepublish-qa-types";
import {
  evaluateAutonomousNewBlogEligibility,
  type SeoAutomationEligibilityInput,
} from "@/lib/cms/seo-automation/eligibility";
import { authorizePilotSpend, emptyPilotUsage } from "@/lib/cms/seo-automation/budgets";

export const SEO_AUTOMATION_PREPUBLISH_GATE_SPEC = "seo-automation-prepublish-gate-v1" as const;

export type SeoAutomationPrepublishGateInput = {
  eligibility: SeoAutomationEligibilityInput;
  prePublishQa: PrePublishQaResult | null;
  evidenceOwnershipOk: boolean;
  contentOriginalAndDefensible: boolean;
  noConflictingPublishedBlog: boolean;
  noProtectedEditorialHoldBypass: boolean;
  noDuplicateApplyOrPublish: boolean;
  planningVersionCurrent: boolean;
  noUnsupportedCommercialClaims: boolean;
  seoManagerApprovalAuthoritative: boolean;
  auditAndRollbackAvailable: boolean;
  repairAttemptsUsed: number;
};

export type SeoAutomationPrepublishGateResult =
  | {
      ok: true;
      spec: typeof SEO_AUTOMATION_PREPUBLISH_GATE_SPEC;
      publicationAllowed: true;
      repairAttemptAuthorized: false;
    }
  | {
      ok: false;
      spec: typeof SEO_AUTOMATION_PREPUBLISH_GATE_SPEC;
      publicationAllowed: false;
      code: string;
      reasons: string[];
      /** At most one bounded repair when safely repairable. */
      repairAttemptAuthorized: boolean;
    };

export function evaluateAutomationPrepublishGate(
  input: SeoAutomationPrepublishGateInput,
): SeoAutomationPrepublishGateResult {
  const reasons: string[] = [];
  const eligibility = evaluateAutonomousNewBlogEligibility(input.eligibility);
  if (!eligibility.ok) {
    reasons.push(`eligibility:${eligibility.code}`);
  }
  if (!input.prePublishQa || input.prePublishQa.status !== "pass") {
    reasons.push("prepublish_qa_not_pass");
  }
  if (!input.evidenceOwnershipOk) reasons.push("evidence_ownership");
  if (!input.contentOriginalAndDefensible) reasons.push("factuality");
  if (!input.noConflictingPublishedBlog) reasons.push("conflicting_published_blog");
  if (!input.noProtectedEditorialHoldBypass) reasons.push("editorial_hold_bypass");
  if (!input.noDuplicateApplyOrPublish) reasons.push("duplicate_apply_or_publish");
  if (!input.planningVersionCurrent) reasons.push("stale_planning_version");
  if (!input.noUnsupportedCommercialClaims) reasons.push("unsupported_commercial_claims");
  if (!input.seoManagerApprovalAuthoritative) reasons.push("missing_seo_manager_approval");
  if (!input.auditAndRollbackAvailable) reasons.push("audit_rollback_unavailable");

  if (reasons.length === 0) {
    return {
      ok: true,
      spec: SEO_AUTOMATION_PREPUBLISH_GATE_SPEC,
      publicationAllowed: true,
      repairAttemptAuthorized: false,
    };
  }

  // Only a solitary deterministic PrePublish failure may authorize one bounded repair.
  const repairable = reasons.length === 1 && reasons[0] === "prepublish_qa_not_pass";

  const spend = authorizePilotSpend(
    { ...emptyPilotUsage(), repairAttempts: input.repairAttemptsUsed },
    "repairAttempts",
    1,
  );
  const repairAttemptAuthorized = Boolean(repairable && spend.ok);

  return {
    ok: false,
    spec: SEO_AUTOMATION_PREPUBLISH_GATE_SPEC,
    publicationAllowed: false,
    code: "prepublish_automation_blocked",
    reasons,
    repairAttemptAuthorized,
  };
}
