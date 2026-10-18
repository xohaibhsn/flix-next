/**
 * L4B-1 — Planning ↔ Ledger decision lineage contracts (pure).
 */

import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";
import type { SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_PLANNING_LINEAGE_VERSION = "v1" as const;

export const SEO_PLANNING_LINEAGE_CAPS = {
  id: 80,
  adminId: 80,
  selectionMarker: 40,
  topic: 160,
  workingTitle: 180,
  recommendation: 40,
  searchIntent: 40,
  errorMessage: 160,
} as const;

export const SEO_PLANNING_LINEAGE_SELECTION_MARKERS = [
  "server_research_binding",
] as const;
export type SeoPlanningLineageSelectionMarker =
  (typeof SEO_PLANNING_LINEAGE_SELECTION_MARKERS)[number];

export const SEO_PLANNING_LINEAGE_ERROR_CODES = [
  "SELECTION_PROVENANCE_UNAVAILABLE",
  "MISSING_PLANNING_DRAFT",
  "PLANNING_ARCHIVED",
  "MISSING_DECISION",
  "MISSING_RESEARCH_RUN",
  "DECISION_RUN_MISMATCH",
  "RESEARCH_NOT_PERSISTED",
  "PIPELINE_STATUS_UNSUPPORTED",
  "IDENTITY_INCOMPLETE",
  "IDENTITY_MISMATCH",
  "UNAUTHORIZED_ACTOR",
  "CROSS_ADMIN_FORBIDDEN",
  "LINK_CONFLICT",
  "INVALID_INPUT",
  "SCHEMA_UNAVAILABLE",
  "WRITE_ERROR",
  "READ_ERROR",
] as const;
export type SeoPlanningLineageErrorCode = (typeof SEO_PLANNING_LINEAGE_ERROR_CODES)[number];

export const SEO_PLANNING_LINEAGE_READ_STATES = [
  "LINKED",
  "UNLINKED",
  "UNAVAILABLE",
  "CONFLICT",
  "INCOMPLETE",
] as const;
export type SeoPlanningLineageReadState = (typeof SEO_PLANNING_LINEAGE_READ_STATES)[number];

export type SeoPlanningDecisionLinkRow = {
  id: string;
  planningDraftId: string;
  decisionId: string;
  linkedByAdminId: string;
  linkedAt: string;
  selectionMarker: SeoPlanningLineageSelectionMarker;
};

/** Authoritative records required for validation (server-loaded). */
export type PlanningDecisionLineageRecords = {
  planningDraft: SeoPlanningDraft | null;
  decision: SeoOpportunityDecisionRow | null;
  researchRun: SeoResearchRunRow | null;
  /** Existing link for this planning draft, if any. */
  existingLinkByDraft: SeoPlanningDecisionLinkRow | null;
  /** Existing link for this decision, if any. */
  existingLinkByDecision: SeoPlanningDecisionLinkRow | null;
};

export type PlanningDecisionLineageCandidate = {
  planningDraftId: string;
  /** Locator only — never authority. */
  decisionId: string;
  actorAdminId: string;
};

export type PlanningDecisionLineageValidationResult =
  | {
      ok: true;
      planningDraft: SeoPlanningDraft;
      decision: SeoOpportunityDecisionRow;
      researchRun: SeoResearchRunRow;
      /** When same pair already linked — idempotent accept. */
      alreadyLinked: boolean;
      existingLink: SeoPlanningDecisionLinkRow | null;
    }
  | {
      ok: false;
      errorCode: SeoPlanningLineageErrorCode;
      errorMessage: string;
    };

export type EstablishPlanningDecisionLinkResult =
  | {
      ok: true;
      status: "CREATED" | "IDEMPOTENT";
      link: SeoPlanningDecisionLinkRow;
    }
  | {
      ok: false;
      errorCode: SeoPlanningLineageErrorCode;
      errorMessage: string;
    };

export type ResolvePlanningDecisionLineageResult =
  | {
      ok: true;
      state: "LINKED";
      link: SeoPlanningDecisionLinkRow;
      decision: SeoOpportunityDecisionRow;
      researchRun: SeoResearchRunRow;
      /** True when decision snapshot is incomplete for future Evidence Pack use. */
      pipelineSnapshotIncomplete: boolean;
    }
  | {
      ok: true;
      state: "UNLINKED";
      planningDraftId: string;
    }
  | {
      ok: true;
      state: "INCOMPLETE";
      planningDraftId: string;
      link: SeoPlanningDecisionLinkRow;
      reason: string;
    }
  | {
      ok: false;
      state: "UNAVAILABLE" | "CONFLICT";
      errorCode: SeoPlanningLineageErrorCode;
      errorMessage: string;
    };

/**
 * Decision → Planning resolution (same link table; reverse lookup).
 * Single source of truth with Planning → Decision.
 */
export type ResolveDecisionPlanningLineageResult =
  | {
      ok: true;
      state: "LINKED";
      link: SeoPlanningDecisionLinkRow;
      planningDraftId: string;
      decision: SeoOpportunityDecisionRow;
      researchRun: SeoResearchRunRow;
      pipelineSnapshotIncomplete: boolean;
    }
  | {
      ok: true;
      state: "UNLINKED";
      decisionId: string;
    }
  | {
      ok: true;
      state: "INCOMPLETE";
      decisionId: string;
      link: SeoPlanningDecisionLinkRow;
      reason: string;
    }
  | {
      ok: false;
      state: "UNAVAILABLE" | "CONFLICT";
      errorCode: SeoPlanningLineageErrorCode;
      errorMessage: string;
    };
