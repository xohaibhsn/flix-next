/**
 * L4B-1 — Bounded repository for Planning ↔ Ledger decision lineage.
 *
 * Mutation requires a server-minted TrustedPlanningDecisionSelection.
 * Production entry without that proof returns SELECTION_PROVENANCE_UNAVAILABLE
 * and performs zero writes.
 *
 * Does not mutate seo_planning_drafts.payload or Ledger decision history.
 */

import { createId } from "@/lib/cms/ids";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";
import {
  isTrustedPlanningDecisionSelection,
  trustedSelectionMatchesLocators,
  tryMintTrustedPlanningDecisionSelection,
  type TrustedPlanningDecisionSelection,
} from "@/lib/cms/seo-planning-lineage/selection";
import {
  SEO_PLANNING_LINEAGE_CAPS,
  type EstablishPlanningDecisionLinkResult,
  type PlanningDecisionLineageRecords,
  type SeoPlanningDecisionLinkRow,
} from "@/lib/cms/seo-planning-lineage/types";
import { validatePlanningDecisionLineageCandidate } from "@/lib/cms/seo-planning-lineage/validate";

export type PlanningLineageStore = {
  /** False when table/schema is missing or DB unavailable. */
  isLineageSchemaAvailable(): Promise<boolean>;
  getPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getDecisionById(id: string): Promise<SeoOpportunityDecisionRow | null>;
  getResearchRunById(id: string): Promise<SeoResearchRunRow | null>;
  getLinkByPlanningDraftId(id: string): Promise<SeoPlanningDecisionLinkRow | null>;
  getLinkByDecisionId(id: string): Promise<SeoPlanningDecisionLinkRow | null>;
  /**
   * Atomic insert under UNIQUE(planning_draft_id) and UNIQUE(decision_id).
   * Must throw a distinguishable conflict error on unique violation.
   */
  insertLinkInTransaction(link: SeoPlanningDecisionLinkRow): Promise<void>;
};

export class PlanningLineageConflictError extends Error {
  readonly code = "LINK_CONFLICT" as const;
  constructor(message = "Lineage link conflict.") {
    super(message);
    this.name = "PlanningLineageConflictError";
  }
}

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

async function loadRecords(
  store: PlanningLineageStore,
  planningDraftId: string,
  decisionId: string,
): Promise<PlanningDecisionLineageRecords | { error: EstablishPlanningDecisionLinkResult }> {
  let decision: SeoOpportunityDecisionRow | null;
  try {
    decision = await store.getDecisionById(decisionId);
  } catch {
    return {
      error: {
        ok: false,
        errorCode: "READ_ERROR",
        errorMessage: "Could not read Ledger decision.",
      },
    };
  }

  let researchRun: SeoResearchRunRow | null = null;
  if (decision) {
    try {
      researchRun = await store.getResearchRunById(decision.runId);
    } catch {
      return {
        error: {
          ok: false,
          errorCode: "READ_ERROR",
          errorMessage: "Could not read Research run.",
        },
      };
    }
  }

  try {
    const [planningDraft, existingLinkByDraft, existingLinkByDecision] = await Promise.all([
      store.getPlanningDraftById(planningDraftId),
      store.getLinkByPlanningDraftId(planningDraftId),
      store.getLinkByDecisionId(decisionId),
    ]);
    return {
      planningDraft,
      decision,
      researchRun,
      existingLinkByDraft,
      existingLinkByDecision,
    };
  } catch {
    return {
      error: {
        ok: false,
        errorCode: "READ_ERROR",
        errorMessage: "Could not read Planning lineage records.",
      },
    };
  }
}

/**
 * Production-facing mutation entry.
 * Without a server-minted trusted selection, returns SELECTION_PROVENANCE_UNAVAILABLE
 * and never writes. Client decisionId alone is never authority.
 */
export async function attemptEstablishPlanningDecisionLink(args: {
  planningDraftId: string;
  decisionId: string;
  actorAdminId: string;
  store: PlanningLineageStore;
  /**
   * Must be minted via server Research binding (or test helper).
   * Plain object forgeries are rejected.
   */
  trustedSelection?: TrustedPlanningDecisionSelection | null;
  /** Optional future binding — currently always unavailable. */
  serverResearchBinding?: unknown;
  createLinkId?: () => string;
  nowIso?: () => string;
}): Promise<EstablishPlanningDecisionLinkResult> {
  const planningDraftId = trimField(args.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id);
  const decisionId = trimField(args.decisionId, SEO_PLANNING_LINEAGE_CAPS.id);
  const actorAdminId = trimField(args.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId);

  if (!planningDraftId || !decisionId || !actorAdminId) {
    return {
      ok: false,
      errorCode: "INVALID_INPUT",
      errorMessage: "Planning draft id, decision id, and actor are required.",
    };
  }

  let trusted = args.trustedSelection ?? null;
  if (!trusted) {
    const minted = tryMintTrustedPlanningDecisionSelection({
      planningDraftId,
      decisionId,
      researchRunId: "",
      actorAdminId,
      serverResearchBinding: args.serverResearchBinding,
    });
    if (!minted.ok) {
      return {
        ok: false,
        errorCode: minted.errorCode,
        errorMessage: minted.errorMessage,
      };
    }
    trusted = minted.selection;
  }

  if (!isTrustedPlanningDecisionSelection(trusted)) {
    return {
      ok: false,
      errorCode: "SELECTION_PROVENANCE_UNAVAILABLE",
      errorMessage: "Trusted Research selection binding is required for lineage writes.",
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
      errorCode: "SCHEMA_UNAVAILABLE",
      errorMessage: "Planning decision lineage schema is unavailable.",
    };
  }

  const loaded = await loadRecords(args.store, planningDraftId, decisionId);
  if ("error" in loaded) return loaded.error;

  const validated = validatePlanningDecisionLineageCandidate(
    { planningDraftId, decisionId, actorAdminId },
    loaded,
  );
  if (!validated.ok) {
    return {
      ok: false,
      errorCode: validated.errorCode,
      errorMessage: validated.errorMessage,
    };
  }

  if (
    !trustedSelectionMatchesLocators(trusted, {
      planningDraftId,
      decisionId,
      actorAdminId,
      researchRunId: validated.researchRun.id,
    })
  ) {
    return {
      ok: false,
      errorCode: "SELECTION_PROVENANCE_UNAVAILABLE",
      errorMessage: "Trusted selection does not match the authoritative lineage locators.",
    };
  }

  if (validated.alreadyLinked && validated.existingLink) {
    return {
      ok: true,
      status: "IDEMPOTENT",
      link: validated.existingLink,
    };
  }

  const link: SeoPlanningDecisionLinkRow = {
    id: (args.createLinkId ?? (() => createId("seoplink")))(),
    planningDraftId,
    decisionId,
    linkedByAdminId: actorAdminId,
    linkedAt: (args.nowIso ?? (() => new Date().toISOString()))(),
    selectionMarker: "server_research_binding",
  };

  try {
    await args.store.insertLinkInTransaction(link);
  } catch (error) {
    if (error instanceof PlanningLineageConflictError) {
      // Re-read for idempotent same-pair under race.
      const again = await loadRecords(args.store, planningDraftId, decisionId);
      if (!("error" in again)) {
        const recheck = validatePlanningDecisionLineageCandidate(
          { planningDraftId, decisionId, actorAdminId },
          again,
        );
        if (recheck.ok && recheck.alreadyLinked && recheck.existingLink) {
          return { ok: true, status: "IDEMPOTENT", link: recheck.existingLink };
        }
      }
      return {
        ok: false,
        errorCode: "LINK_CONFLICT",
        errorMessage: "A conflicting Planning decision lineage already exists.",
      };
    }
    return {
      ok: false,
      errorCode: "WRITE_ERROR",
      errorMessage: "Could not persist Planning decision lineage.",
    };
  }

  return { ok: true, status: "CREATED", link };
}
