/**
 * L4B-1 — Read-only Planning ↔ Ledger decision lineage resolution.
 * Fail closed when schema/table is missing. No unbounded scans.
 * Does not alter A2-4B HOLD behavior.
 */

import { sanitizeText } from "@/lib/cms/validation";
import type { PlanningLineageStore } from "@/lib/cms/seo-planning-lineage/repository";
import {
  SEO_PLANNING_LINEAGE_CAPS,
  type ResolveDecisionPlanningLineageResult,
  type ResolvePlanningDecisionLineageResult,
} from "@/lib/cms/seo-planning-lineage/types";
import {
  decisionSnapshotIncomplete,
  isValidLineageId,
  researchRunSupportsLineage,
} from "@/lib/cms/seo-planning-lineage/validate";

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

/**
 * Resolve a Planning draft to its persisted Ledger decision lineage.
 * Query budget: schema check + link by draft + decision + run (≤4 bounded reads).
 */
export async function resolvePlanningDecisionLineage(args: {
  planningDraftId: string;
  store: PlanningLineageStore;
}): Promise<ResolvePlanningDecisionLineageResult> {
  const planningDraftId = trimField(args.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id);
  if (!isValidLineageId(planningDraftId)) {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "INVALID_INPUT",
      errorMessage: "Planning draft id is required.",
    };
  }

  let schemaOk = false;
  try {
    schemaOk = await args.store.isLineageSchemaAvailable();
  } catch {
    schemaOk = false;
  }
  if (!schemaOk) {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "SCHEMA_UNAVAILABLE",
      errorMessage: "Planning decision lineage schema is unavailable.",
    };
  }

  let link;
  try {
    link = await args.store.getLinkByPlanningDraftId(planningDraftId);
  } catch {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "READ_ERROR",
      errorMessage: "Could not read Planning decision lineage.",
    };
  }

  if (!link) {
    return { ok: true, state: "UNLINKED", planningDraftId };
  }

  // Detect conflict: decision uniquely owned but draft link points elsewhere is DB-enforced;
  // still verify reverse lookup agrees.
  let byDecision;
  try {
    byDecision = await args.store.getLinkByDecisionId(link.decisionId);
  } catch {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "READ_ERROR",
      errorMessage: "Could not verify Planning decision lineage.",
    };
  }

  if (
    !byDecision ||
    byDecision.planningDraftId !== link.planningDraftId ||
    byDecision.decisionId !== link.decisionId
  ) {
    return {
      ok: false,
      state: "CONFLICT",
      errorCode: "LINK_CONFLICT",
      errorMessage: "Planning decision lineage is inconsistent.",
    };
  }

  let decision;
  let researchRun;
  try {
    decision = await args.store.getDecisionById(link.decisionId);
    researchRun = decision ? await args.store.getResearchRunById(decision.runId) : null;
  } catch {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "READ_ERROR",
      errorMessage: "Could not load linked Ledger records.",
    };
  }

  if (!decision || !researchRun) {
    return {
      ok: true,
      state: "INCOMPLETE",
      planningDraftId,
      link,
      reason: "Linked Ledger decision or Research run is missing.",
    };
  }

  if (decision.runId !== researchRun.id) {
    return {
      ok: false,
      state: "CONFLICT",
      errorCode: "DECISION_RUN_MISMATCH",
      errorMessage: "Linked decision does not match its Research run.",
    };
  }

  if (!researchRunSupportsLineage(researchRun)) {
    return {
      ok: true,
      state: "INCOMPLETE",
      planningDraftId,
      link,
      reason: "Linked Research run is incomplete for lineage use.",
    };
  }

  const incomplete = decisionSnapshotIncomplete(decision);
  return {
    ok: true,
    state: "LINKED",
    link,
    decision,
    researchRun,
    pipelineSnapshotIncomplete: incomplete,
  };
}

/**
 * Resolve a Ledger decision to its persisted Planning draft lineage.
 * Same durable table as Planning → Decision (no second source of truth).
 * Query budget: schema check + link by decision + reverse draft check + decision + run.
 */
export async function resolveDecisionPlanningLineage(args: {
  decisionId: string;
  store: PlanningLineageStore;
}): Promise<ResolveDecisionPlanningLineageResult> {
  const decisionId = trimField(args.decisionId, SEO_PLANNING_LINEAGE_CAPS.id);
  if (!isValidLineageId(decisionId)) {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "INVALID_INPUT",
      errorMessage: "Decision id is required.",
    };
  }

  let schemaOk = false;
  try {
    schemaOk = await args.store.isLineageSchemaAvailable();
  } catch {
    schemaOk = false;
  }
  if (!schemaOk) {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "SCHEMA_UNAVAILABLE",
      errorMessage: "Planning decision lineage schema is unavailable.",
    };
  }

  let link;
  try {
    link = await args.store.getLinkByDecisionId(decisionId);
  } catch {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "READ_ERROR",
      errorMessage: "Could not read Planning decision lineage.",
    };
  }

  if (!link) {
    return { ok: true, state: "UNLINKED", decisionId };
  }

  let byDraft;
  try {
    byDraft = await args.store.getLinkByPlanningDraftId(link.planningDraftId);
  } catch {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "READ_ERROR",
      errorMessage: "Could not verify Planning decision lineage.",
    };
  }

  if (
    !byDraft ||
    byDraft.planningDraftId !== link.planningDraftId ||
    byDraft.decisionId !== link.decisionId
  ) {
    return {
      ok: false,
      state: "CONFLICT",
      errorCode: "LINK_CONFLICT",
      errorMessage: "Planning decision lineage is inconsistent.",
    };
  }

  let decision;
  let researchRun;
  try {
    decision = await args.store.getDecisionById(link.decisionId);
    researchRun = decision ? await args.store.getResearchRunById(decision.runId) : null;
  } catch {
    return {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "READ_ERROR",
      errorMessage: "Could not load linked Ledger records.",
    };
  }

  if (!decision || !researchRun) {
    return {
      ok: true,
      state: "INCOMPLETE",
      decisionId,
      link,
      reason: "Linked Ledger decision or Research run is missing.",
    };
  }

  if (decision.id !== decisionId) {
    return {
      ok: false,
      state: "CONFLICT",
      errorCode: "LINK_CONFLICT",
      errorMessage: "Linked decision does not match the requested decision id.",
    };
  }

  if (decision.runId !== researchRun.id) {
    return {
      ok: false,
      state: "CONFLICT",
      errorCode: "DECISION_RUN_MISMATCH",
      errorMessage: "Linked decision does not match its Research run.",
    };
  }

  if (!researchRunSupportsLineage(researchRun)) {
    return {
      ok: true,
      state: "INCOMPLETE",
      decisionId,
      link,
      reason: "Linked Research run is incomplete for lineage use.",
    };
  }

  return {
    ok: true,
    state: "LINKED",
    link,
    planningDraftId: link.planningDraftId,
    decision,
    researchRun,
    pipelineSnapshotIncomplete: decisionSnapshotIncomplete(decision),
  };
}
