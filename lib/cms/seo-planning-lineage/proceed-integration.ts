/**
 * L4B-3 — Same-request Research selection → Planning Proceed orchestration.
 *
 * Server-only. Does not replace proceedSeoOpportunityToPlanningDraftAction.
 * Does not activate lineage DDL, insert seo_planning_decision_links, or claim LINKED.
 * Durable lineage writes remain BLOCKED (schema inactive / concurrency v6 collision).
 */

import {
  SEO_RESEARCH_COVERAGE,
  SEO_RESEARCH_CONFIDENCE,
  SEO_RESEARCH_INTENTS,
  type SeoResearchCoverage,
  type SeoResearchConfidence,
  type SeoResearchIntent,
} from "@/lib/cms/ai-seo/research-schemas";
import type { SeoOpportunityDecisionRow } from "@/lib/cms/seo-experiment-ledger/types";
import { isSeoPlanningActionableRecommendation } from "@/lib/cms/seo-planning/constants";
import {
  proceedSeoOpportunityToPlanningDraft,
  type SeoPlanningCatalog,
} from "@/lib/cms/seo-planning/proceed";
import { sanitizeText } from "@/lib/cms/validation";
import {
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
} from "@/lib/cms/seo-planning-lineage/schema-ddl";
import {
  isPreparedResearchProceedSelection,
  prepareTrustedResearchProceedSelection,
  summarizePreparedResearchProceedSelection,
  type DisplayedResearchOpportunitySnapshot,
  type PreparedResearchProceedSelection,
  type ResearchProceedLedgerReader,
} from "@/lib/cms/seo-planning-lineage/research-proceed-selection";
import {
  isTrustedPlanningDecisionSelection,
  tryMintTrustedPlanningDecisionSelection,
  type TrustedPlanningDecisionSelection,
} from "@/lib/cms/seo-planning-lineage/selection";
import { SEO_PLANNING_LINEAGE_CAPS } from "@/lib/cms/seo-planning-lineage/types";

export const RESEARCH_PROCEED_INTEGRATION_VERSION = "l4b3-v1" as const;

/** Durable link is never claimed from this module while schema remains inactive. */
export const RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED = false as const;

export const RESEARCH_PROCEED_LINKAGE_STATUSES = [
  "NOT_PERSISTED_SCHEMA_INACTIVE",
  "SELECTION_PREPARED",
  "SELECTION_UNAVAILABLE",
  "SELECTION_DEFERRED",
  "DRAFT_CONFLICT",
  "PROCEED_FAILED",
] as const;

export type ResearchProceedLinkageStatus =
  (typeof RESEARCH_PROCEED_LINKAGE_STATUSES)[number];

export const RESEARCH_PROCEED_INTEGRATION_ERROR_CODES = [
  "UNAUTHORIZED",
  "SELECTION_UNAVAILABLE",
  "UNSUPPORTED_RECOMMENDATION",
  "IDENTITY_MISMATCH",
  "MISSING_SUPPLEMENTAL",
  "DECISION_UNAVAILABLE",
  "PROCEED_FAILED",
  "INVALID_INPUT",
] as const;

export type ResearchProceedIntegrationErrorCode =
  (typeof RESEARCH_PROCEED_INTEGRATION_ERROR_CODES)[number];

/**
 * Unverified manual/editorial fields. Never Ledger authority.
 * Must not override recommendation, decision identity, topic, or working title.
 */
export type ResearchProceedEditorialSupplemental = {
  /** Required — Ledger does not persist searchIntent. Never claimed Ledger-verified. */
  searchIntent: unknown;
  whyNow?: unknown;
  webEvidence?: unknown;
  suggestedAngle?: unknown;
  nextStep?: unknown;
  matchedTitle?: unknown;
  proposedSlug?: unknown;
  historicalSignal?: unknown;
  gscEvidenceRefs?: unknown;
  gscEvidence?: unknown;
  sources?: unknown;
  gscMeta?: unknown;
  /**
   * Optional consistency checks only. If present and disagree with Ledger → reject.
   * Never used as authority when Ledger values exist.
   */
  recommendation?: unknown;
  topic?: unknown;
  workingTitle?: unknown;
};

export type ResearchProceedAuthoritativeFields = {
  researchRunId: string;
  decisionId: string;
  opportunityIndex: number;
  opportunityIdentity: string;
  researchRecommendation: string;
  topic: string;
  workingTitle: string;
  evaluationStatus: string;
  pipelineRunStatus: string;
  matchedPublicUrl: string;
  restorePath: string;
  targetPostId: string | null;
  existingCoverage: string;
  researchConfidence: string;
};

export type ResearchProceedEditorialProvenance = {
  verified: false;
  source: "manual_editorial_supplemental";
  searchIntent: SeoResearchIntent;
  whyNow: string;
  webEvidence: string;
  suggestedAngle: string;
  nextStep: string;
  matchedTitle: string | null;
  proposedSlug: string | undefined;
  historicalSignal: boolean;
  sourcesProvided: boolean;
  gscMetaProvided: boolean;
  gscEvidenceProvided: boolean;
};

type LinkageOutcome = {
  status: ResearchProceedLinkageStatus;
  durableLink: false;
  reason: string;
  schemaRegisteredWithEnsure: typeof L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
};

export type ResearchProceedIntegrationSuccess = {
  ok: true;
  planning: {
    draftId: string;
    created: boolean;
    openedExisting: boolean;
  };
  selection: {
    status: "SELECTION_PREPARED" | "SELECTION_DEFERRED";
    summary: ReturnType<typeof summarizePreparedResearchProceedSelection>;
    /** Process-local only — never serialize across requests. */
    trustedMinted: boolean;
  };
  linkage: LinkageOutcome;
  provenance: {
    authoritative: ResearchProceedAuthoritativeFields;
    editorialSupplemental: ResearchProceedEditorialProvenance;
  };
};

export type ResearchProceedIntegrationFailure = {
  ok: false;
  status:
    | "SELECTION_UNAVAILABLE"
    | "PROCEED_FAILED"
    | "PLANNING_INPUT_INCOMPLETE"
    | "DRAFT_CONFLICT";
  errorCode: ResearchProceedIntegrationErrorCode;
  errorMessage: string;
  linkage: LinkageOutcome;
  planning?: {
    draftId: string | null;
    created: false;
  };
};

export type ResearchProceedIntegrationResult =
  | ResearchProceedIntegrationSuccess
  | ResearchProceedIntegrationFailure;

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function linkage(
  status: ResearchProceedLinkageStatus,
  reason: string,
): LinkageOutcome {
  return {
    status,
    durableLink: false,
    reason,
    schemaRegisteredWithEnsure: L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  };
}

function fail(
  status: ResearchProceedIntegrationFailure["status"],
  errorCode: ResearchProceedIntegrationErrorCode,
  errorMessage: string,
  linkageStatus: ResearchProceedLinkageStatus = "SELECTION_UNAVAILABLE",
): ResearchProceedIntegrationFailure {
  return {
    ok: false,
    status,
    errorCode,
    errorMessage,
    linkage: linkage(linkageStatus, errorMessage),
  };
}

function assertNoForgedPreparation(value: unknown): void {
  // Integration never accepts client-supplied preparation objects as authority.
  // If a forged object somehow carries WeakSet membership from another path,
  // callers still cannot force Proceed via this API without going through prepare.
  void value;
}

/**
 * Reject client attempts to override Ledger-authoritative identity fields.
 */
export function editorialOverridesAuthoritative(
  editorial: ResearchProceedEditorialSupplemental,
  preparation: PreparedResearchProceedSelection,
): boolean {
  if (editorial.recommendation != null && editorial.recommendation !== "") {
    const rec = trimField(editorial.recommendation, SEO_PLANNING_LINEAGE_CAPS.recommendation);
    if (rec && rec !== preparation.researchRecommendation) return true;
  }
  if (editorial.topic != null && editorial.topic !== "") {
    const topic = trimField(editorial.topic, SEO_PLANNING_LINEAGE_CAPS.topic);
    if (topic && topic !== preparation.topic) return true;
  }
  if (editorial.workingTitle != null && editorial.workingTitle !== "") {
    const title = trimField(editorial.workingTitle, SEO_PLANNING_LINEAGE_CAPS.workingTitle);
    if (title && title !== preparation.workingTitle) return true;
  }
  return false;
}

export function parseRequiredSearchIntent(
  raw: unknown,
): { ok: true; value: SeoResearchIntent } | { ok: false; error: string } {
  if (raw == null || raw === "") {
    return {
      ok: false,
      error:
        "Search intent is required as unverified editorial supplemental input (Ledger does not persist it).",
    };
  }
  const intent = oneOf(raw, SEO_RESEARCH_INTENTS);
  if (!intent) {
    return { ok: false, error: "Search intent is invalid." };
  }
  return { ok: true, value: intent };
}

export async function resolveAuthoritativeDecision(args: {
  ledgerReader: ResearchProceedLedgerReader;
  researchRunId: string;
  decisionId: string;
  opportunityIndex: number;
}): Promise<
  | { ok: true; decision: SeoOpportunityDecisionRow }
  | { ok: false; errorMessage: string }
> {
  let detail: Awaited<ReturnType<ResearchProceedLedgerReader["getSeoResearchRunDetail"]>>;
  try {
    detail = await args.ledgerReader.getSeoResearchRunDetail({
      runId: args.researchRunId,
    });
  } catch {
    return { ok: false, errorMessage: "Could not load the Ledger decision." };
  }

  if (!detail.ok) {
    return { ok: false, errorMessage: "Could not load the Ledger decision." };
  }

  const decision = detail.decisions.find((row) => row.id === args.decisionId);
  if (!decision) {
    return { ok: false, errorMessage: "Selected Ledger decision was not found." };
  }
  if (decision.opportunityIndex !== args.opportunityIndex) {
    return {
      ok: false,
      errorMessage: "Selected decision opportunity index does not match the preparation.",
    };
  }
  if (decision.runId !== args.researchRunId) {
    return { ok: false, errorMessage: "Selected decision does not belong to the prepared run." };
  }
  return { ok: true, decision };
}

function coverageFromDecision(decision: SeoOpportunityDecisionRow): SeoResearchCoverage {
  return oneOf(decision.existingCoverage, SEO_RESEARCH_COVERAGE) || "NONE";
}

function confidenceFromDecision(decision: SeoOpportunityDecisionRow): SeoResearchConfidence {
  return oneOf(decision.researchConfidence, SEO_RESEARCH_CONFIDENCE) || "LOW";
}

export function buildProceedOpportunity(args: {
  preparation: PreparedResearchProceedSelection;
  decision: SeoOpportunityDecisionRow;
  searchIntent: SeoResearchIntent;
  editorial: ResearchProceedEditorialSupplemental;
}): Record<string, unknown> {
  const { preparation, decision, searchIntent, editorial } = args;
  const whyNow = trimField(editorial.whyNow, 2000);
  const webEvidence = trimField(editorial.webEvidence, 4000);
  const suggestedAngle = trimField(editorial.suggestedAngle, 1000);
  const nextStep = trimField(editorial.nextStep, 1000);
  const matchedTitleRaw = trimField(editorial.matchedTitle, 200);
  const proposedSlug = trimField(editorial.proposedSlug, 160);

  return {
    // Ledger-authoritative — client cannot override via this builder.
    recommendation: preparation.researchRecommendation,
    topic: preparation.topic,
    workingTitle: preparation.workingTitle,
    existingCoverage: coverageFromDecision(decision),
    confidence: confidenceFromDecision(decision),
    matchedPublicUrl: decision.matchedPublicUrl || "",
    restorePath: decision.restorePath || "",
    // Unverified editorial supplemental (explicit; never Ledger-verified).
    searchIntent,
    whyNow,
    webEvidence,
    suggestedAngle,
    nextStep,
    matchedTitle: matchedTitleRaw || null,
    gscEvidenceRefs: editorial.gscEvidenceRefs,
    gscEvidence: editorial.gscEvidence,
    historicalSignal:
      typeof editorial.historicalSignal === "boolean"
        ? editorial.historicalSignal
        : Boolean(decision.restorePath),
    ...(proposedSlug ? { proposedSlug } : {}),
  };
}

function editorialProvenance(
  searchIntent: SeoResearchIntent,
  editorial: ResearchProceedEditorialSupplemental,
): ResearchProceedEditorialProvenance {
  return {
    verified: false,
    source: "manual_editorial_supplemental",
    searchIntent,
    whyNow: trimField(editorial.whyNow, 2000),
    webEvidence: trimField(editorial.webEvidence, 4000),
    suggestedAngle: trimField(editorial.suggestedAngle, 1000),
    nextStep: trimField(editorial.nextStep, 1000),
    matchedTitle: trimField(editorial.matchedTitle, 200) || null,
    proposedSlug: trimField(editorial.proposedSlug, 160) || undefined,
    historicalSignal:
      typeof editorial.historicalSignal === "boolean"
        ? editorial.historicalSignal
        : false,
    sourcesProvided: Array.isArray(editorial.sources) && editorial.sources.length > 0,
    gscMetaProvided: editorial.gscMeta != null && typeof editorial.gscMeta === "object",
    gscEvidenceProvided:
      (Array.isArray(editorial.gscEvidence) && editorial.gscEvidence.length > 0) ||
      (Array.isArray(editorial.gscEvidenceRefs) && editorial.gscEvidenceRefs.length > 0),
  };
}

function authoritativeFrom(
  preparation: PreparedResearchProceedSelection,
  decision: SeoOpportunityDecisionRow,
): ResearchProceedAuthoritativeFields {
  return {
    researchRunId: preparation.researchRunId,
    decisionId: preparation.decisionId,
    opportunityIndex: preparation.opportunityIndex,
    opportunityIdentity: preparation.opportunityIdentity,
    researchRecommendation: preparation.researchRecommendation,
    topic: preparation.topic,
    workingTitle: preparation.workingTitle,
    evaluationStatus: preparation.evaluationStatus,
    pipelineRunStatus: preparation.pipelineRunStatus,
    matchedPublicUrl: decision.matchedPublicUrl || "",
    restorePath: decision.restorePath || "",
    targetPostId: decision.targetPostId,
    existingCoverage: decision.existingCoverage || "",
    researchConfidence: decision.researchConfidence || "",
  };
}

/**
 * Same-request orchestration: prepare trusted Research selection → existing
 * Planning Proceed → optional process-local mint. Never durable-links.
 *
 * Does not accept a client-forged PreparedResearchProceedSelection.
 * Does not serialize WeakSet capability across requests.
 */
export async function proceedFromTrustedResearchSelection(args: {
  /** Server-established SEO actor — not client-asserted. */
  actor: { authorized: boolean; adminId: string };
  ledgerRunId: unknown;
  opportunityIndex?: unknown;
  decisionId?: unknown;
  displayedOpportunity?: DisplayedResearchOpportunitySnapshot | null;
  /** Unverified editorial/manual supplemental — never Ledger authority. */
  editorialSupplemental: ResearchProceedEditorialSupplemental;
  ledgerReader: ResearchProceedLedgerReader;
  catalog: SeoPlanningCatalog;
  now?: string;
  createIdFn?: (prefix?: string) => string;
  /**
   * Rejected when provided — clients must not supply prepared selections.
   * Present only so forged payloads are explicitly ignored/fail-closed.
   */
  forgedPreparation?: unknown;
}): Promise<ResearchProceedIntegrationResult> {
  // Caller-supplied preparation objects are ignored — only prepare() below is authoritative.
  assertNoForgedPreparation(args.forgedPreparation);

  const adminId = trimField(args.actor?.adminId, SEO_PLANNING_LINEAGE_CAPS.adminId);
  if (!args.actor?.authorized || !adminId) {
    return fail("SELECTION_UNAVAILABLE", "UNAUTHORIZED", "Access denied.");
  }

  if (!args.editorialSupplemental || typeof args.editorialSupplemental !== "object") {
    return fail(
      "PLANNING_INPUT_INCOMPLETE",
      "MISSING_SUPPLEMENTAL",
      "Editorial supplemental input is required for Planning Proceed.",
      "SELECTION_UNAVAILABLE",
    );
  }

  const prepared = await prepareTrustedResearchProceedSelection({
    actor: args.actor,
    ledgerRunId: args.ledgerRunId,
    opportunityIndex: args.opportunityIndex,
    decisionId: args.decisionId,
    displayedOpportunity: args.displayedOpportunity,
    ledgerReader: args.ledgerReader,
  });

  if (!prepared.ok) {
    return fail(
      "SELECTION_UNAVAILABLE",
      "SELECTION_UNAVAILABLE",
      prepared.errorMessage || "Research selection is unavailable.",
    );
  }

  const preparation = prepared.preparation;
  if (!isPreparedResearchProceedSelection(preparation)) {
    return fail(
      "SELECTION_UNAVAILABLE",
      "SELECTION_UNAVAILABLE",
      "Trusted Research selection binding is not available.",
    );
  }

  if (editorialOverridesAuthoritative(args.editorialSupplemental, preparation)) {
    return fail(
      "SELECTION_UNAVAILABLE",
      "IDENTITY_MISMATCH",
      "Editorial supplemental fields must not override Ledger-authoritative identity.",
    );
  }

  if (!isSeoPlanningActionableRecommendation(preparation.researchRecommendation)) {
    return fail(
      "SELECTION_UNAVAILABLE",
      "UNSUPPORTED_RECOMMENDATION",
      preparation.researchRecommendation === "SKIP"
        ? "Skip recommendations do not create planning drafts."
        : "Unsupported recommendation for Planning Proceed.",
    );
  }

  const searchIntentParsed = parseRequiredSearchIntent(
    args.editorialSupplemental.searchIntent,
  );
  if (!searchIntentParsed.ok) {
    return fail(
      "PLANNING_INPUT_INCOMPLETE",
      "MISSING_SUPPLEMENTAL",
      searchIntentParsed.error,
      "SELECTION_UNAVAILABLE",
    );
  }

  const resolved = await resolveAuthoritativeDecision({
    ledgerReader: args.ledgerReader,
    researchRunId: preparation.researchRunId,
    decisionId: preparation.decisionId,
    opportunityIndex: preparation.opportunityIndex,
  });
  if (!resolved.ok) {
    return fail(
      "SELECTION_UNAVAILABLE",
      "DECISION_UNAVAILABLE",
      resolved.errorMessage,
    );
  }

  const opportunity = buildProceedOpportunity({
    preparation,
    decision: resolved.decision,
    searchIntent: searchIntentParsed.value,
    editorial: args.editorialSupplemental,
  });

  const proceedResult = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: opportunity,
    rawSources: args.editorialSupplemental.sources,
    rawGscMeta: args.editorialSupplemental.gscMeta,
    adminId,
    catalog: args.catalog,
    now: args.now,
    createIdFn: args.createIdFn,
  });

  if (!proceedResult.ok) {
    return {
      ok: false,
      status: "PROCEED_FAILED",
      errorCode: "PROCEED_FAILED",
      errorMessage: proceedResult.error || "Could not create the planning draft.",
      linkage: linkage("PROCEED_FAILED", proceedResult.error || "Proceed failed."),
      planning: { draftId: null, created: false },
    };
  }

  const draftId = proceedResult.id;
  if (!draftId || typeof draftId !== "string") {
    return {
      ok: false,
      status: "PROCEED_FAILED",
      errorCode: "PROCEED_FAILED",
      errorMessage: "Planning draft identity was not returned.",
      linkage: linkage("PROCEED_FAILED", "Missing planning draft identity."),
      planning: { draftId: null, created: false },
    };
  }

  const authoritative = authoritativeFrom(preparation, resolved.decision);
  const editorial = editorialProvenance(
    searchIntentParsed.value,
    args.editorialSupplemental,
  );

  // Existing draft (fingerprint dedupe / race): open without claiming new provenance.
  if (!proceedResult.created) {
    return {
      ok: true,
      planning: {
        draftId,
        created: false,
        openedExisting: true,
      },
      selection: {
        status: "SELECTION_DEFERRED",
        summary: summarizePreparedResearchProceedSelection(preparation),
        trustedMinted: false,
      },
      linkage: linkage(
        "DRAFT_CONFLICT",
        "An existing Planning draft was opened. Durable lineage was not claimed or rewritten for this selection.",
      ),
      provenance: { authoritative, editorialSupplemental: editorial },
    };
  }

  // New draft: mint process-local selection for the actual saved draft id only.
  const minted = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: draftId,
    decisionId: preparation.decisionId,
    researchRunId: preparation.researchRunId,
    actorAdminId: adminId,
    serverResearchBinding: preparation,
  });

  const trustedMinted =
    minted.ok && isTrustedPlanningDecisionSelection(minted.selection);

  // Hard activation boundary — never insert lineage rows from L4B-3.
  void RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
  // Intentionally no lineage repository insert / MySQL write from this module.

  if (!trustedMinted) {
    return {
      ok: true,
      planning: {
        draftId,
        created: true,
        openedExisting: false,
      },
      selection: {
        status: "SELECTION_DEFERRED",
        summary: summarizePreparedResearchProceedSelection(preparation),
        trustedMinted: false,
      },
      linkage: linkage(
        "SELECTION_UNAVAILABLE",
        "Planning draft was created but trusted selection minting was unavailable. No durable lineage write was attempted.",
      ),
      provenance: { authoritative, editorialSupplemental: editorial },
    };
  }

  // Keep mint in-process only; do not return the capability object (not serializable/trust-safe).
  void (minted as { ok: true; selection: TrustedPlanningDecisionSelection }).selection;

  return {
    ok: true,
    planning: {
      draftId,
      created: true,
      openedExisting: false,
    },
    selection: {
      status: "SELECTION_PREPARED",
      summary: summarizePreparedResearchProceedSelection(preparation),
      trustedMinted: true,
    },
    linkage: linkage(
      "NOT_PERSISTED_SCHEMA_INACTIVE",
      "Planning draft created and same-request selection prepared. Lineage schema is inactive — no durable link was written.",
    ),
    provenance: { authoritative, editorialSupplemental: editorial },
  };
}

/** Test helper: confirm this module never exposes LINKED as a success linkage status. */
export function researchProceedIntegrationAllowsLinkedStatus(): false {
  return false;
}
