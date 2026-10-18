/**
 * L4B-2 — Trusted Research → Proceed selection-preparation bridge.
 *
 * Derives selected opportunity identity from authoritative persisted Ledger
 * decision records. Client locators and displayed snapshots are never authority.
 *
 * Does not write lineage, Planning drafts, or Ledger selection flags.
 * Does not modify Proceed. Ephemeral prepared objects are process-local only.
 */

import {
  isValidLedgerRunId,
  SEO_LEDGER_MAX_OPPORTUNITIES,
} from "@/lib/cms/seo-experiment-ledger";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";
import { sanitizeText } from "@/lib/cms/validation";
import { SEO_PLANNING_LINEAGE_CAPS } from "@/lib/cms/seo-planning-lineage/types";

export const RESEARCH_PROCEED_SELECTION_VERSION = "v1" as const;

export const RESEARCH_PROCEED_SELECTION_STATUSES = [
  /** Persisted decision identity established; Planning fields complete enough. */
  "SERVER_DECISION_VALIDATED",
  /** Decision established, but full Planning provenance fields absent from Ledger. */
  "PLANNING_INPUT_INCOMPLETE",
  /** Authoritative selection cannot be demonstrated. */
  "SELECTION_UNAVAILABLE",
] as const;
export type ResearchProceedSelectionStatus =
  (typeof RESEARCH_PROCEED_SELECTION_STATUSES)[number];

export const RESEARCH_PROCEED_SELECTION_ERROR_CODES = [
  "UNAUTHORIZED",
  "INVALID_INPUT",
  "INVALID_RUN_ID",
  "INVALID_OPPORTUNITY_INDEX",
  "INVALID_DECISION_ID",
  "RUN_NOT_FOUND",
  "DECISION_NOT_FOUND",
  "DECISION_RUN_MISMATCH",
  "AMBIGUOUS_DECISION",
  "CROSS_ADMIN_FORBIDDEN",
  "RESEARCH_NOT_OK",
  "RUN_NOT_PERSISTED",
  "PIPELINE_STATUS_UNSUPPORTED",
  "IDENTITY_INCOMPLETE",
  "IDENTITY_MISMATCH",
  "EVALUATION_UNSUPPORTED",
  "LEDGER_UNAVAILABLE",
  "LEDGER_READ_ERROR",
] as const;
export type ResearchProceedSelectionErrorCode =
  (typeof RESEARCH_PROCEED_SELECTION_ERROR_CODES)[number];

/** Fields Ledger does not persist today — never invented from the browser. */
export const LEDGER_MISSING_PLANNING_FIELDS = [
  "searchIntent",
  "researchNarrative",
  "sources",
  "gscEvidence",
] as const;

const DECISION_ID_RE = /^seodec_[A-Za-z0-9-]{1,72}$/;

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value: unknown, max: number): string {
  return trimField(value, max).toLowerCase();
}

export function isValidLedgerDecisionId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > SEO_PLANNING_LINEAGE_CAPS.id) return false;
  return DECISION_ID_RE.test(id);
}

export function isValidOpportunityIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < SEO_LEDGER_MAX_OPPORTUNITIES
  );
}

/** Authoritative server-prepared selection values (Ledger-sourced). */
export type PreparedResearchProceedSelection = {
  readonly researchRunId: string;
  readonly decisionId: string;
  readonly opportunityIndex: number;
  readonly opportunityIdentity: string;
  readonly actorAdminId: string;
  readonly topic: string;
  readonly workingTitle: string;
  readonly researchRecommendation: string;
  readonly evaluationStatus: string;
  readonly pipelineRunStatus: string;
  readonly preparedAt: string;
  /** Explicit gaps — never filled from browser. */
  readonly missingAuthoritativeFields: readonly string[];
};

/** Optional browser-displayed fields for consistency only. */
export type DisplayedResearchOpportunitySnapshot = {
  topic?: unknown;
  workingTitle?: unknown;
  recommendation?: unknown;
  opportunityIndex?: unknown;
  /** Ignored — never authority. */
  trusted?: unknown;
  verified?: unknown;
  selected?: unknown;
  provenance?: unknown;
  pipeline?: unknown;
  searchIntent?: unknown;
};

/** Reader contract mirrors Ledger detail reads without importing server-only MySQL. */
export type ResearchProceedLedgerDetailResult =
  | {
      ok: true;
      run: SeoResearchRunRow;
      decisions: SeoOpportunityDecisionRow[];
      decisionOverflow: boolean;
    }
  | {
      ok: false;
      errorCode: "unavailable" | "query_error" | "invalid_id" | "not_found";
      errorMessage: string;
    };

export type ResearchProceedLedgerReader = {
  getSeoResearchRunDetail(args: {
    runId: string;
  }): Promise<ResearchProceedLedgerDetailResult>;
};

export type PrepareTrustedResearchProceedSelectionResult =
  | {
      ok: true;
      status: "SERVER_DECISION_VALIDATED" | "PLANNING_INPUT_INCOMPLETE";
      preparation: PreparedResearchProceedSelection;
      incompleteReasons: string[];
    }
  | {
      ok: false;
      status: "SELECTION_UNAVAILABLE";
      errorCode: ResearchProceedSelectionErrorCode;
      errorMessage: string;
    };

/** Process-local registry — not durable across requests/workers. */
const preparedSelections = new WeakSet<object>();

export function isPreparedResearchProceedSelection(
  value: unknown,
): value is PreparedResearchProceedSelection {
  return typeof value === "object" && value !== null && preparedSelections.has(value);
}

function fail(
  errorCode: ResearchProceedSelectionErrorCode,
  errorMessage: string,
): PrepareTrustedResearchProceedSelectionResult {
  return {
    ok: false,
    status: "SELECTION_UNAVAILABLE",
    errorCode,
    errorMessage: trimField(errorMessage, SEO_PLANNING_LINEAGE_CAPS.errorMessage),
  };
}

function mintPreparation(
  value: Omit<PreparedResearchProceedSelection, "preparedAt" | "missingAuthoritativeFields"> & {
    missingAuthoritativeFields?: readonly string[];
    preparedAt?: string;
  },
): PreparedResearchProceedSelection {
  const preparation: PreparedResearchProceedSelection = {
    researchRunId: value.researchRunId,
    decisionId: value.decisionId,
    opportunityIndex: value.opportunityIndex,
    opportunityIdentity: value.opportunityIdentity,
    actorAdminId: value.actorAdminId,
    topic: value.topic,
    workingTitle: value.workingTitle,
    researchRecommendation: value.researchRecommendation,
    evaluationStatus: value.evaluationStatus,
    pipelineRunStatus: value.pipelineRunStatus,
    preparedAt: value.preparedAt || new Date().toISOString(),
    missingAuthoritativeFields: value.missingAuthoritativeFields || [...LEDGER_MISSING_PLANNING_FIELDS],
  };
  preparedSelections.add(preparation);
  return preparation;
}

function displayedMatchesDecision(
  displayed: DisplayedResearchOpportunitySnapshot | null | undefined,
  decision: SeoOpportunityDecisionRow,
): ResearchProceedSelectionErrorCode | null {
  if (!displayed || typeof displayed !== "object") return null;

  if (displayed.opportunityIndex != null && displayed.opportunityIndex !== "") {
    if (!isValidOpportunityIndex(displayed.opportunityIndex)) {
      return "INVALID_OPPORTUNITY_INDEX";
    }
    if (displayed.opportunityIndex !== decision.opportunityIndex) {
      return "IDENTITY_MISMATCH";
    }
  }

  const topicD = normalizeIdentity(displayed.topic, SEO_PLANNING_LINEAGE_CAPS.topic);
  const titleD = normalizeIdentity(displayed.workingTitle, SEO_PLANNING_LINEAGE_CAPS.workingTitle);
  const recD = normalizeIdentity(displayed.recommendation, SEO_PLANNING_LINEAGE_CAPS.recommendation);

  if (topicD && topicD !== normalizeIdentity(decision.topic, SEO_PLANNING_LINEAGE_CAPS.topic)) {
    return "IDENTITY_MISMATCH";
  }
  if (
    titleD &&
    titleD !== normalizeIdentity(decision.workingTitle, SEO_PLANNING_LINEAGE_CAPS.workingTitle)
  ) {
    return "IDENTITY_MISMATCH";
  }
  if (
    recD &&
    recD !==
      normalizeIdentity(decision.researchRecommendation, SEO_PLANNING_LINEAGE_CAPS.recommendation)
  ) {
    return "IDENTITY_MISMATCH";
  }

  return null;
}

function resolveDecisionCandidates(
  decisions: SeoOpportunityDecisionRow[],
  args: { opportunityIndex: number | null; decisionId: string },
):
  | { ok: true; decision: SeoOpportunityDecisionRow }
  | { ok: false; errorCode: ResearchProceedSelectionErrorCode; errorMessage: string } {
  let candidates = decisions.slice();

  if (args.decisionId) {
    candidates = candidates.filter((d) => d.id === args.decisionId);
    if (!candidates.length) {
      return {
        ok: false,
        errorCode: "DECISION_NOT_FOUND",
        errorMessage: "Persisted Ledger decision was not found for this run.",
      };
    }
  }

  if (args.opportunityIndex != null) {
    candidates = candidates.filter((d) => d.opportunityIndex === args.opportunityIndex);
  }

  if (!candidates.length) {
    return {
      ok: false,
      errorCode: "DECISION_NOT_FOUND",
      errorMessage: "No persisted decision matches the supplied opportunity locator.",
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      errorCode: "AMBIGUOUS_DECISION",
      errorMessage: "Multiple persisted decisions match the selection locator.",
    };
  }

  return { ok: true, decision: candidates[0]! };
}

/**
 * Prepare a server-validated Research→Proceed selection from persisted Ledger records.
 * Authorization failures perform zero protected Ledger reads.
 */
export async function prepareTrustedResearchProceedSelection(args: {
  /** Server-established SEO actor — not client-asserted. */
  actor: { authorized: boolean; adminId: string };
  /** Bounded Ledger run id (locator). */
  ledgerRunId: unknown;
  /** Original Research opportunity index (preferred locator). */
  opportunityIndex?: unknown;
  /** Optional persisted decision id — must agree with run/index when supplied. */
  decisionId?: unknown;
  /** Optional UI-displayed fields for consistency checks only. */
  displayedOpportunity?: DisplayedResearchOpportunitySnapshot | null;
  /** Injected Ledger reader. */
  ledgerReader: ResearchProceedLedgerReader;
  nowIso?: () => string;
}): Promise<PrepareTrustedResearchProceedSelectionResult> {
  const adminId = trimField(args.actor?.adminId, SEO_PLANNING_LINEAGE_CAPS.adminId);
  if (!args.actor?.authorized || !adminId) {
    return fail("UNAUTHORIZED", "Access denied.");
  }

  const ledgerRunId = trimField(args.ledgerRunId, SEO_PLANNING_LINEAGE_CAPS.id);
  if (!ledgerRunId || !isValidLedgerRunId(ledgerRunId)) {
    return fail("INVALID_RUN_ID", "A valid Ledger research run id is required.");
  }

  const hasIndex = args.opportunityIndex != null && args.opportunityIndex !== "";
  const hasDecisionId = args.decisionId != null && args.decisionId !== "";
  if (!hasIndex && !hasDecisionId) {
    return fail(
      "INVALID_INPUT",
      "An opportunity index or persisted decision id locator is required.",
    );
  }

  let opportunityIndex: number | null = null;
  if (hasIndex) {
    if (!isValidOpportunityIndex(args.opportunityIndex)) {
      return fail("INVALID_OPPORTUNITY_INDEX", "Opportunity index is out of range.");
    }
    opportunityIndex = args.opportunityIndex as number;
  }

  let decisionIdLocator = "";
  if (hasDecisionId) {
    decisionIdLocator = trimField(args.decisionId, SEO_PLANNING_LINEAGE_CAPS.id);
    if (!isValidLedgerDecisionId(decisionIdLocator)) {
      return fail("INVALID_DECISION_ID", "Decision id is invalid.");
    }
  }

  let detail: ResearchProceedLedgerDetailResult;
  try {
    detail = await args.ledgerReader.getSeoResearchRunDetail({ runId: ledgerRunId });
  } catch {
    return fail("LEDGER_READ_ERROR", "Could not read the Research Ledger.");
  }

  if (!detail.ok) {
    if (detail.errorCode === "not_found" || detail.errorCode === "invalid_id") {
      return fail("RUN_NOT_FOUND", "Research run was not found.");
    }
    if (detail.errorCode === "unavailable") {
      return fail("LEDGER_UNAVAILABLE", "Research Ledger is unavailable.");
    }
    return fail("LEDGER_READ_ERROR", "Could not read the Research Ledger.");
  }

  const run: SeoResearchRunRow = detail.run;
  if (run.id !== ledgerRunId) {
    return fail("RUN_NOT_FOUND", "Research run was not found.");
  }

  if (run.source !== "manual") {
    return fail(
      "PIPELINE_STATUS_UNSUPPORTED",
      "Only manual Research runs can establish Proceed selection provenance.",
    );
  }

  const owner = trimField(run.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId);
  if (!owner || owner !== adminId) {
    return fail("CROSS_ADMIN_FORBIDDEN", "Research run belongs to another administrator.");
  }

  if (run.durabilityStatus !== "COMPLETE") {
    return fail("RUN_NOT_PERSISTED", "Research run is not durably persisted.");
  }
  if (!run.researchOk) {
    return fail("RESEARCH_NOT_OK", "Research run did not succeed.");
  }
  if (run.pipelineRunStatus !== "OK") {
    return fail(
      "PIPELINE_STATUS_UNSUPPORTED",
      "Research run pipeline status does not support authoritative selection.",
    );
  }

  if (detail.decisionOverflow) {
    return fail("AMBIGUOUS_DECISION", "Research run has an unexpected decision overflow.");
  }

  const resolved = resolveDecisionCandidates(detail.decisions, {
    opportunityIndex,
    decisionId: decisionIdLocator,
  });
  if (!resolved.ok) {
    return fail(resolved.errorCode, resolved.errorMessage);
  }

  const decision = resolved.decision;
  if (decision.runId !== run.id) {
    return fail("DECISION_RUN_MISMATCH", "Decision does not belong to the Research run.");
  }

  if (decisionIdLocator && decision.id !== decisionIdLocator) {
    return fail("DECISION_RUN_MISMATCH", "Decision locator does not match the resolved decision.");
  }

  if (
    !decision.opportunityIdentity ||
    !Number.isInteger(decision.opportunityIndex) ||
    decision.opportunityIndex < 0 ||
    decision.opportunityIndex >= SEO_LEDGER_MAX_OPPORTUNITIES
  ) {
    return fail("IDENTITY_INCOMPLETE", "Decision opportunity identity is incomplete.");
  }

  const topic = trimField(decision.topic, SEO_PLANNING_LINEAGE_CAPS.topic);
  const workingTitle = trimField(decision.workingTitle, SEO_PLANNING_LINEAGE_CAPS.workingTitle);
  const researchRecommendation = trimField(
    decision.researchRecommendation,
    SEO_PLANNING_LINEAGE_CAPS.recommendation,
  );
  if (!topic || !workingTitle || !researchRecommendation) {
    return fail("IDENTITY_INCOMPLETE", "Decision identity fields are incomplete.");
  }

  if (decision.evaluationStatus !== "OK") {
    return fail(
      "EVALUATION_UNSUPPORTED",
      "Decision evaluation status does not support authoritative selection.",
    );
  }

  const mismatch = displayedMatchesDecision(args.displayedOpportunity, decision);
  if (mismatch) {
    return fail(
      mismatch,
      mismatch === "IDENTITY_MISMATCH"
        ? "Displayed opportunity does not match the persisted Ledger decision."
        : "Displayed opportunity index is invalid.",
    );
  }

  const missingAuthoritativeFields = [...LEDGER_MISSING_PLANNING_FIELDS];
  const incompleteReasons = [
    "Ledger decisions do not persist searchIntent.",
    "Ledger decisions do not persist research narrative, sources, or GSC evidence rows.",
  ];

  const preparation = mintPreparation({
    researchRunId: run.id,
    decisionId: decision.id,
    opportunityIndex: decision.opportunityIndex,
    opportunityIdentity: trimField(decision.opportunityIdentity, 80),
    actorAdminId: adminId,
    topic,
    workingTitle,
    researchRecommendation,
    evaluationStatus: trimField(decision.evaluationStatus, 40),
    pipelineRunStatus: trimField(run.pipelineRunStatus, 40),
    missingAuthoritativeFields,
    preparedAt: (args.nowIso ?? (() => new Date().toISOString()))(),
  });

  // Today Ledger never carries searchIntent → preparation is always planning-incomplete.
  // Decision identity itself is still server-validated.
  if (missingAuthoritativeFields.length > 0) {
    return {
      ok: true,
      status: "PLANNING_INPUT_INCOMPLETE",
      preparation,
      incompleteReasons,
    };
  }

  return {
    ok: true,
    status: "SERVER_DECISION_VALIDATED",
    preparation,
    incompleteReasons: [],
  };
}

/**
 * Serialize-safe summary for diagnostics/tests — never includes WeakSet capability.
 * Safe to log; not a trust token.
 */
export function summarizePreparedResearchProceedSelection(
  preparation: PreparedResearchProceedSelection,
): {
  researchRunId: string;
  decisionId: string;
  opportunityIndex: number;
  opportunityIdentity: string;
  topic: string;
  workingTitle: string;
  researchRecommendation: string;
  missingAuthoritativeFields: readonly string[];
} {
  return {
    researchRunId: preparation.researchRunId,
    decisionId: preparation.decisionId,
    opportunityIndex: preparation.opportunityIndex,
    opportunityIdentity: preparation.opportunityIdentity,
    topic: preparation.topic,
    workingTitle: preparation.workingTitle,
    researchRecommendation: preparation.researchRecommendation,
    missingAuthoritativeFields: preparation.missingAuthoritativeFields,
  };
}
