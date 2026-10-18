/**
 * L4B-1 — Pure Planning ↔ Ledger decision lineage validation.
 * No I/O. Matching fields prove consistency only — not Proceed selection authority.
 */

import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";
import {
  SEO_PLANNING_LINEAGE_CAPS,
  type PlanningDecisionLineageCandidate,
  type PlanningDecisionLineageRecords,
  type PlanningDecisionLineageValidationResult,
  type SeoPlanningDecisionLinkRow,
  type SeoPlanningLineageErrorCode,
} from "@/lib/cms/seo-planning-lineage/types";

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value: unknown, max: number): string {
  return trimField(value, max).toLowerCase();
}

function fail(
  errorCode: SeoPlanningLineageErrorCode,
  errorMessage: string,
): PlanningDecisionLineageValidationResult {
  return {
    ok: false,
    errorCode,
    errorMessage: trimField(errorMessage, SEO_PLANNING_LINEAGE_CAPS.errorMessage),
  };
}

export function isValidLineageId(value: unknown): value is string {
  const id = trimField(value, SEO_PLANNING_LINEAGE_CAPS.id);
  return id.length >= 4 && id.length <= SEO_PLANNING_LINEAGE_CAPS.id && !/\s/.test(id);
}

export function isPlanningDraftArchived(draft: SeoPlanningDraft): boolean {
  const archived = draft.archivedAt;
  return typeof archived === "string" && archived.trim().length > 0;
}

/**
 * Soft consistency check between Planning draft and Ledger decision fields.
 * Never sufficient alone to authorize a write.
 */
export function planningDecisionIdentityConsistent(
  draft: SeoPlanningDraft,
  decision: SeoOpportunityDecisionRow,
): boolean {
  const recD = normalizeIdentity(draft.recommendation, SEO_PLANNING_LINEAGE_CAPS.recommendation);
  const recP = normalizeIdentity(
    decision.researchRecommendation,
    SEO_PLANNING_LINEAGE_CAPS.recommendation,
  );
  const topicD = normalizeIdentity(draft.topic, SEO_PLANNING_LINEAGE_CAPS.topic);
  const topicP = normalizeIdentity(decision.topic, SEO_PLANNING_LINEAGE_CAPS.topic);
  const titleD = normalizeIdentity(draft.workingTitle, SEO_PLANNING_LINEAGE_CAPS.workingTitle);
  const titleP = normalizeIdentity(decision.workingTitle, SEO_PLANNING_LINEAGE_CAPS.workingTitle);

  if (!recD || !recP || !topicD || !topicP || !titleD || !titleP) return false;
  if (recD !== recP || topicD !== topicP || titleD !== titleP) return false;

  // searchIntent is on Planning; Ledger decisions do not persist intent today.
  // When both sides later expose intent, enforce equality here.
  void draft.searchIntent;
  return true;
}

export function researchRunSupportsLineage(run: SeoResearchRunRow): boolean {
  if (!run.researchOk) return false;
  if (run.durabilityStatus !== "COMPLETE") return false;
  if (run.pipelineRunStatus !== "OK") return false;
  return true;
}

export function decisionSnapshotIncomplete(decision: SeoOpportunityDecisionRow): boolean {
  if (!decision.evaluationStatus) return true;
  if (decision.evaluationStatus !== "OK") return true;
  // Nullable historical RF/NBA/Priority fields — incomplete for full readiness reconstruction.
  if (!decision.rfVerdict || !decision.nbaAction || decision.priorityAutomationSelectable == null) {
    return true;
  }
  if (!decision.pipelineFingerprint) return true;
  return false;
}

function sameLinkPair(
  link: SeoPlanningDecisionLinkRow,
  planningDraftId: string,
  decisionId: string,
): boolean {
  return link.planningDraftId === planningDraftId && link.decisionId === decisionId;
}

/**
 * Validate authoritative records for a lineage candidate.
 * Does NOT authorize the write — trusted selection context is required separately.
 */
export function validatePlanningDecisionLineageCandidate(
  candidate: PlanningDecisionLineageCandidate,
  records: PlanningDecisionLineageRecords,
): PlanningDecisionLineageValidationResult {
  const planningDraftId = trimField(candidate.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id);
  const decisionId = trimField(candidate.decisionId, SEO_PLANNING_LINEAGE_CAPS.id);
  const actorAdminId = trimField(candidate.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId);

  if (!isValidLineageId(planningDraftId) || !isValidLineageId(decisionId) || !actorAdminId) {
    return fail("INVALID_INPUT", "Planning draft id, decision id, and actor are required.");
  }

  const draft = records.planningDraft;
  if (!draft || draft.id !== planningDraftId) {
    return fail("MISSING_PLANNING_DRAFT", "Planning draft was not found.");
  }
  if (isPlanningDraftArchived(draft)) {
    return fail("PLANNING_ARCHIVED", "Archived Planning drafts cannot receive lineage links.");
  }

  const decision = records.decision;
  if (!decision || decision.id !== decisionId) {
    return fail("MISSING_DECISION", "Ledger decision was not found.");
  }

  const run = records.researchRun;
  if (!run) {
    return fail("MISSING_RESEARCH_RUN", "Parent Research run was not found.");
  }
  if (decision.runId !== run.id) {
    return fail("DECISION_RUN_MISMATCH", "Decision does not belong to the loaded Research run.");
  }

  if (!researchRunSupportsLineage(run)) {
    if (run.durabilityStatus !== "COMPLETE" || !run.researchOk) {
      return fail("RESEARCH_NOT_PERSISTED", "Research run is not durably available for lineage.");
    }
    return fail(
      "PIPELINE_STATUS_UNSUPPORTED",
      "Research run pipeline status does not support lineage provenance.",
    );
  }

  if (
    !decision.opportunityIdentity ||
    !Number.isInteger(decision.opportunityIndex) ||
    decision.opportunityIndex < 0 ||
    decision.opportunityIndex >= 5
  ) {
    return fail("IDENTITY_INCOMPLETE", "Decision opportunity identity/index is incomplete.");
  }

  if (!planningDecisionIdentityConsistent(draft, decision)) {
    return fail(
      "IDENTITY_MISMATCH",
      "Planning draft and Ledger decision identity fields are inconsistent.",
    );
  }

  if (!actorAdminId) {
    return fail("UNAUTHORIZED_ACTOR", "Authorized admin actor is required.");
  }

  // Manual Research lineage requires actor ownership of the persisted run.
  if (run.source === "manual") {
    const owner = trimField(run.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId);
    if (!owner || owner !== actorAdminId) {
      return fail(
        "CROSS_ADMIN_FORBIDDEN",
        "Manual Research lineage requires the owning administrator.",
      );
    }
  }

  const byDraft = records.existingLinkByDraft;
  const byDecision = records.existingLinkByDecision;

  if (byDraft && !sameLinkPair(byDraft, planningDraftId, decisionId)) {
    return fail("LINK_CONFLICT", "Planning draft is already linked to a different decision.");
  }
  if (byDecision && !sameLinkPair(byDecision, planningDraftId, decisionId)) {
    return fail("LINK_CONFLICT", "Decision is already linked to a different Planning draft.");
  }

  const alreadyLinked = Boolean(
    byDraft && byDecision && sameLinkPair(byDraft, planningDraftId, decisionId),
  );

  return {
    ok: true,
    planningDraft: draft,
    decision,
    researchRun: run,
    alreadyLinked,
    existingLink: alreadyLinked ? byDraft : null,
  };
}
