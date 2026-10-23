/**
 * Autonomous SEO Evidence Pack V1 — readiness gate for future NEW_BLOG drafting.
 *
 * Consumes existing Research + Decision Pipeline results. Does not re-decide
 * Refresh-First, NBA, or Priority. Zero providers, network, GSC API, DB, or CMS I/O.
 *
 * READY_FOR_DRAFTING_REVIEW means evidence is sufficient to proceed toward
 * drafting review only — never publication approval.
 */

import {
  SEO_RESEARCH_FIELD_CAPS,
  domainFromUrl,
  isSafeHttpUrl,
  type SeoResearchConfidence,
  type SeoResearchCoverage,
  type SeoResearchGscEvidence,
  type SeoResearchIntent,
  type SeoResearchRecommendation,
  type SeoResearchSource,
} from "@/lib/cms/ai-seo/research-schemas";
import {
  SEO_DECISION_PIPELINE_CAPS,
  SEO_DECISION_PIPELINE_VERSION,
  type SeoDecisionPipelineResult,
} from "@/lib/cms/seo-decision-pipeline/types";
import { sanitizeText } from "@/lib/cms/validation";

export const SEO_EVIDENCE_PACK_VERSION = "v1" as const;
export type SeoEvidencePackVersion = typeof SEO_EVIDENCE_PACK_VERSION;

export const SEO_EVIDENCE_PACK_CAPS = {
  topic: SEO_RESEARCH_FIELD_CAPS.topic,
  workingTitle: SEO_RESEARCH_FIELD_CAPS.workingTitle,
  statement: 480,
  evidenceDescription: 360,
  sourceTitle: SEO_RESEARCH_FIELD_CAPS.sourceTitle,
  sourceUrl: SEO_RESEARCH_FIELD_CAPS.sourceUrl,
  sourceCount: 12,
  groundedCount: 12,
  gscEvidence: SEO_DECISION_PIPELINE_CAPS.maxGscEvidence,
  holdReasons: 12,
  reasonDetail: 200,
  identity: 120,
  evidenceId: 64,
  minOriginalStatement: 24,
  minEvidenceDescription: 16,
} as const;

export const SEO_EVIDENCE_PACK_STATUSES = [
  "READY_FOR_DRAFTING_REVIEW",
  "HOLD",
] as const;
export type SeoEvidencePackStatus = (typeof SEO_EVIDENCE_PACK_STATUSES)[number];

/**
 * Sanitized hold reason codes — never include raw errors, secrets, or provider text.
 */
export const SEO_EVIDENCE_PACK_HOLD_REASONS = [
  "INVALID_INPUT",
  "PIPELINE_FAILURE",
  "PIPELINE_INCOMPLETE",
  "INELIGIBLE_DECISION",
  "UNSUPPORTED_ACTION",
  "RF_NOT_PASS_NEW_CONTENT",
  "NBA_NOT_NEW_BLOG",
  "NBA_NOT_AUTONOMOUS_ELIGIBLE",
  "PRIORITY_NOT_SELECTABLE",
  "MISSING_SOURCES",
  "UNCERTAIN_SOURCE_SUPPORT",
  "MISSING_ORIGINAL_VALUE",
  "UNSUPPORTED_ORIGINAL_VALUE",
] as const;
export type SeoEvidencePackHoldReason = (typeof SEO_EVIDENCE_PACK_HOLD_REASONS)[number];

/** Recorded Research source URL — not automatically verified. */
export type SeoEvidencePackRecordedSource = {
  title: string;
  url: string;
  domain: string;
  /** Always false for Research-recorded URLs unless also present in groundedEvidence. */
  verified: boolean;
};

/**
 * Independently supplied grounded evidence.
 * Never invent these from advisory Research narrative alone.
 */
export type SeoEvidencePackGroundedEvidence = {
  id: string;
  kind: "site_fact" | "source_verified" | "gsc_grounded";
  description: string;
  sourceUrl?: string;
  gscEvidenceId?: string;
};

export type SeoEvidencePackOriginalContribution = {
  /** Explicit original contribution — never inferred from title alone. */
  statement: string;
  /**
   * Backing mode:
   * - site_fact: authoritative site-specific fact (must be non-generic statement)
   * - grounded_evidence: references groundedEvidence ids
   * - source_backed: references recorded source URLs that are also grounded
   */
  backing: "site_fact" | "grounded_evidence" | "source_backed";
  evidenceIds?: string[];
  sourceUrls?: string[];
};

export type SeoEvidencePackInput = {
  /** Optional opportunity index within a Research run (0-based). */
  opportunityIndex?: number;
  /** Prefer pipeline.opportunityIdentity when omitted. */
  opportunityIdentity?: string;
  /** Authoritative Decision Pipeline evaluation for this opportunity. */
  pipeline: SeoDecisionPipelineResult;
  /** Research-recorded sources (URLs are recorded, not verified by default). */
  sources?: readonly SeoResearchSource[] | unknown;
  /** Independently supplied grounded/verified evidence. */
  groundedEvidence?: readonly SeoEvidencePackGroundedEvidence[] | unknown;
  /**
   * Optional GSC rows already attached upstream.
   * Only ids present in pipeline.opportunity.gscEvidenceRefs are retained.
   */
  gscEvidence?: readonly SeoResearchGscEvidence[] | unknown;
  /** Explicit original contribution input — required for READY. */
  originalContribution?: SeoEvidencePackOriginalContribution | unknown;
};

export type SeoEvidencePackGscRef = {
  id: string;
  kind: string;
  query?: string;
  pageUrl?: string;
  normalizedPath?: string | null;
  classification?: string;
};

export type SeoEvidencePackResult = {
  packVersion: SeoEvidencePackVersion;
  status: SeoEvidencePackStatus;
  holdReasons: SeoEvidencePackHoldReason[];
  /** True only when status is READY_FOR_DRAFTING_REVIEW. Never implies publish approval. */
  readyForDraftingReview: boolean;
  /** Always false in V1 — publication gates are separate. */
  publicationReady: false;
  opportunityIndex: number | null;
  opportunityIdentity: string;
  topic: string;
  workingTitle: string;
  searchIntent: string | null;
  researchRecommendation: SeoResearchRecommendation | string | null;
  researchConfidence: SeoResearchConfidence | string | null;
  existingCoverage: SeoResearchCoverage | string | null;
  matchedPublicUrl: string | null;
  recordedSources: SeoEvidencePackRecordedSource[];
  groundedEvidence: SeoEvidencePackGroundedEvidence[];
  gscEvidence: SeoEvidencePackGscRef[];
  originalContribution: {
    statement: string;
    backing: SeoEvidencePackOriginalContribution["backing"] | null;
    proposed: boolean;
    supported: boolean;
  };
  pipeline: {
    version: string;
    fingerprint: string;
    evaluationStatus: string;
    refreshFirstVerdict: string | null;
    nbaAction: string | null;
    autonomousEligible: boolean | null;
    automationSelectable: boolean | null;
  };
  advisoryNotes: string[];
};

const GENERIC_ORIGINAL_PATTERNS: readonly RegExp[] = [
  /^best\s+iptv(\s+service)?$/i,
  /^best\s+iptv\s+apps?$/i,
  /^top\s+iptv(\s+service)?$/i,
  /^#1\s+iptv/i,
  /^the\s+best\s+iptv/i,
  /^great\s+iptv\s+service$/i,
  /^leading\s+iptv/i,
];

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function uniqueHoldReasons(reasons: SeoEvidencePackHoldReason[]): SeoEvidencePackHoldReason[] {
  const order = SEO_EVIDENCE_PACK_HOLD_REASONS;
  const set = new Set(reasons);
  return order.filter((code) => set.has(code)).slice(0, SEO_EVIDENCE_PACK_CAPS.holdReasons);
}

function isGenericOriginalStatement(statement: string): boolean {
  const normalized = statement.replace(/\s+/g, " ").trim();
  if (normalized.length < SEO_EVIDENCE_PACK_CAPS.minOriginalStatement) return true;
  return GENERIC_ORIGINAL_PATTERNS.some((re) => re.test(normalized));
}

function normalizeRecordedSources(raw: unknown): SeoEvidencePackRecordedSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SeoEvidencePackRecordedSource[] = [];
  for (const item of raw) {
    if (out.length >= SEO_EVIDENCE_PACK_CAPS.sourceCount) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = trimField(row.url ?? row.href, SEO_EVIDENCE_PACK_CAPS.sourceUrl);
    if (!url || !isSafeHttpUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const domain = domainFromUrl(url);
    const title = trimField(row.title, SEO_EVIDENCE_PACK_CAPS.sourceTitle) || domain || url;
    out.push({ title, url, domain, verified: false });
  }
  return out;
}

function normalizeGroundedEvidence(raw: unknown): SeoEvidencePackGroundedEvidence[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SeoEvidencePackGroundedEvidence[] = [];
  for (const item of raw) {
    if (out.length >= SEO_EVIDENCE_PACK_CAPS.groundedCount) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = trimField(row.id, SEO_EVIDENCE_PACK_CAPS.evidenceId);
    const kindRaw = trimField(row.kind, 32);
    const kind =
      kindRaw === "site_fact" || kindRaw === "source_verified" || kindRaw === "gsc_grounded"
        ? kindRaw
        : null;
    const description = trimField(row.description, SEO_EVIDENCE_PACK_CAPS.evidenceDescription);
    if (!id || !kind || description.length < SEO_EVIDENCE_PACK_CAPS.minEvidenceDescription) {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const sourceUrlRaw = trimField(row.sourceUrl, SEO_EVIDENCE_PACK_CAPS.sourceUrl);
    const sourceUrl =
      sourceUrlRaw && isSafeHttpUrl(sourceUrlRaw) ? sourceUrlRaw : undefined;
    const gscEvidenceId = trimField(row.gscEvidenceId, 12) || undefined;
    out.push({
      id,
      kind,
      description,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(gscEvidenceId ? { gscEvidenceId } : {}),
    });
  }
  return out;
}

function normalizeOriginalContribution(
  raw: unknown,
):
  | { ok: true; value: SeoEvidencePackOriginalContribution }
  | { ok: false; reason: SeoEvidencePackHoldReason } {
  if (raw == null) return { ok: false, reason: "MISSING_ORIGINAL_VALUE" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const row = raw as Record<string, unknown>;
  const statement = trimField(row.statement, SEO_EVIDENCE_PACK_CAPS.statement);
  if (!statement) return { ok: false, reason: "MISSING_ORIGINAL_VALUE" };
  if (isGenericOriginalStatement(statement)) {
    return { ok: false, reason: "UNSUPPORTED_ORIGINAL_VALUE" };
  }
  const backingRaw = trimField(row.backing, 32);
  if (
    backingRaw !== "site_fact" &&
    backingRaw !== "grounded_evidence" &&
    backingRaw !== "source_backed"
  ) {
    return { ok: false, reason: "UNSUPPORTED_ORIGINAL_VALUE" };
  }
  const evidenceIds = Array.isArray(row.evidenceIds)
    ? row.evidenceIds
        .map((v) => trimField(v, SEO_EVIDENCE_PACK_CAPS.evidenceId))
        .filter(Boolean)
        .slice(0, SEO_EVIDENCE_PACK_CAPS.groundedCount)
    : [];
  const sourceUrls = Array.isArray(row.sourceUrls)
    ? row.sourceUrls
        .map((v) => trimField(v, SEO_EVIDENCE_PACK_CAPS.sourceUrl))
        .filter((u) => u && isSafeHttpUrl(u))
        .slice(0, SEO_EVIDENCE_PACK_CAPS.sourceCount)
    : [];
  return {
    ok: true,
    value: {
      statement,
      backing: backingRaw,
      ...(evidenceIds.length ? { evidenceIds } : {}),
      ...(sourceUrls.length ? { sourceUrls } : {}),
    },
  };
}

function markVerifiedSources(
  sources: SeoEvidencePackRecordedSource[],
  grounded: SeoEvidencePackGroundedEvidence[],
): SeoEvidencePackRecordedSource[] {
  const verifiedUrls = new Set(
    grounded
      .filter((g) => g.kind === "source_verified" && g.sourceUrl)
      .map((g) => g.sourceUrl!.toLowerCase()),
  );
  return sources.map((s) => ({
    ...s,
    verified: verifiedUrls.has(s.url.toLowerCase()),
  }));
}

function selectGscEvidence(
  refs: readonly string[] | undefined,
  raw: unknown,
): SeoEvidencePackGscRef[] {
  const allow = new Set(
    (refs || [])
      .map((r) => trimField(r, 12))
      .filter(Boolean)
      .slice(0, SEO_EVIDENCE_PACK_CAPS.gscEvidence),
  );
  if (!allow.size || !Array.isArray(raw)) return [];
  const out: SeoEvidencePackGscRef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= SEO_EVIDENCE_PACK_CAPS.gscEvidence) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = trimField(row.id, 12);
    if (!id || !allow.has(id) || seen.has(id)) continue;
    seen.add(id);
    const kind = trimField(row.kind, 24) || "unknown";
    out.push({
      id,
      kind,
      ...(typeof row.query === "string"
        ? { query: trimField(row.query, 160) || undefined }
        : {}),
      ...(typeof row.pageUrl === "string"
        ? { pageUrl: trimField(row.pageUrl, SEO_EVIDENCE_PACK_CAPS.sourceUrl) || undefined }
        : {}),
      normalizedPath:
        typeof row.normalizedPath === "string"
          ? trimField(row.normalizedPath, SEO_DECISION_PIPELINE_CAPS.url) || null
          : null,
      ...(typeof row.classification === "string"
        ? { classification: trimField(row.classification, 40) || undefined }
        : {}),
    });
  }
  return out;
}

function originalContributionSupported(
  contribution: SeoEvidencePackOriginalContribution,
  grounded: SeoEvidencePackGroundedEvidence[],
  sources: SeoEvidencePackRecordedSource[],
): boolean {
  const groundedById = new Map(grounded.map((g) => [g.id, g]));
  if (contribution.backing === "site_fact") {
    // First-party site_fact backing requires an explicit grounded site_fact id.
    // Empty / unknown / mismatched ids never pass. URL-less site_fact rows are allowed.
    const ids = contribution.evidenceIds || [];
    if (!ids.length) return false;
    return ids.some((id) => groundedById.get(id)?.kind === "site_fact");
  }
  if (contribution.backing === "grounded_evidence") {
    const ids = contribution.evidenceIds || [];
    if (!ids.length) return false;
    return ids.some((id) => groundedById.has(id));
  }
  // source_backed: referenced URLs must be recorded AND verified via groundedEvidence
  const urls = (contribution.sourceUrls || []).map((u) => u.toLowerCase());
  if (!urls.length) return false;
  const recorded = new Set(sources.map((s) => s.url.toLowerCase()));
  const verified = new Set(
    grounded
      .filter((g) => g.kind === "source_verified" && g.sourceUrl)
      .map((g) => g.sourceUrl!.toLowerCase()),
  );
  return urls.some((u) => recorded.has(u) && verified.has(u));
}

function emptyResult(
  overrides: Partial<SeoEvidencePackResult> &
    Pick<SeoEvidencePackResult, "status" | "holdReasons" | "opportunityIdentity">,
): SeoEvidencePackResult {
  const status = overrides.status;
  return {
    packVersion: SEO_EVIDENCE_PACK_VERSION,
    opportunityIndex: null,
    topic: "",
    workingTitle: "",
    searchIntent: null,
    researchRecommendation: null,
    researchConfidence: null,
    existingCoverage: null,
    matchedPublicUrl: null,
    recordedSources: [],
    groundedEvidence: [],
    gscEvidence: [],
    originalContribution: {
      statement: "",
      backing: null,
      proposed: false,
      supported: false,
    },
    pipeline: {
      version: SEO_DECISION_PIPELINE_VERSION,
      fingerprint: "",
      evaluationStatus: "",
      refreshFirstVerdict: null,
      nbaAction: null,
      autonomousEligible: null,
      automationSelectable: null,
    },
    advisoryNotes: [
      "READY_FOR_DRAFTING_REVIEW is not publication approval.",
      "Recorded source URLs are not verified evidence unless independently grounded.",
    ],
    ...overrides,
    status,
    holdReasons: uniqueHoldReasons(overrides.holdReasons),
    readyForDraftingReview: status === "READY_FOR_DRAFTING_REVIEW",
    publicationReady: false,
  };
}

/**
 * Prepare a deterministic Evidence Pack and readiness status from existing
 * pipeline decisions plus explicit original-contribution / grounded evidence.
 */
export function prepareSeoEvidencePack(input: SeoEvidencePackInput): SeoEvidencePackResult {
  if (!input || typeof input !== "object" || !input.pipeline || typeof input.pipeline !== "object") {
    return emptyResult({
      status: "HOLD",
      holdReasons: ["INVALID_INPUT"],
      opportunityIdentity: "",
    });
  }

  const pipeline = input.pipeline;
  const opportunityIdentity = trimField(
    input.opportunityIdentity ?? pipeline.opportunityIdentity,
    SEO_EVIDENCE_PACK_CAPS.identity,
  );
  const opportunityIndex =
    typeof input.opportunityIndex === "number" &&
    Number.isInteger(input.opportunityIndex) &&
    input.opportunityIndex >= 0 &&
    input.opportunityIndex < 100
      ? input.opportunityIndex
      : null;

  const topic = trimField(pipeline.opportunity?.topic, SEO_EVIDENCE_PACK_CAPS.topic);
  const workingTitle = trimField(
    pipeline.opportunity?.workingTitle,
    SEO_EVIDENCE_PACK_CAPS.workingTitle,
  );
  const searchIntent =
    typeof pipeline.opportunity?.searchIntent === "string"
      ? (trimField(pipeline.opportunity.searchIntent, 40) as SeoResearchIntent | string)
      : null;

  const recordedSources = markVerifiedSources(
    normalizeRecordedSources(input.sources),
    normalizeGroundedEvidence(input.groundedEvidence),
  );
  const groundedEvidence = normalizeGroundedEvidence(input.groundedEvidence);
  // Re-mark with final grounded set
  const sources = markVerifiedSources(recordedSources, groundedEvidence);
  const gscEvidence = selectGscEvidence(pipeline.opportunity?.gscEvidenceRefs, input.gscEvidence);

  const pipelineSlice = {
    version: String(pipeline.pipelineVersion || SEO_DECISION_PIPELINE_VERSION),
    fingerprint: trimField(pipeline.pipelineFingerprint, 128),
    evaluationStatus: String(pipeline.evaluationStatus || ""),
    refreshFirstVerdict: pipeline.refreshFirst?.verdict ?? null,
    nbaAction: pipeline.nextBestAction?.action ?? null,
    autonomousEligible:
      typeof pipeline.nextBestAction?.autonomousEligible === "boolean"
        ? pipeline.nextBestAction.autonomousEligible
        : null,
    automationSelectable:
      typeof pipeline.priority?.automationSelectable === "boolean"
        ? pipeline.priority.automationSelectable
        : null,
  };

  const holdReasons: SeoEvidencePackHoldReason[] = [];

  if (!topic || !workingTitle || !opportunityIdentity) {
    holdReasons.push("INVALID_INPUT");
  }

  if (pipeline.evaluationStatus === "VALIDATION_ERROR" || pipeline.evaluationStatus === "INTERNAL_ERROR") {
    holdReasons.push("PIPELINE_FAILURE");
  } else if (pipeline.evaluationStatus !== "OK") {
    holdReasons.push("PIPELINE_INCOMPLETE");
  }

  if (!pipeline.refreshFirst || !pipeline.nextBestAction || !pipeline.priority) {
    holdReasons.push("PIPELINE_INCOMPLETE");
  }

  const rfVerdict = pipeline.refreshFirst?.verdict;
  const nba = pipeline.nextBestAction;
  const priority = pipeline.priority;

  if (rfVerdict && rfVerdict !== "PASS_NEW_CONTENT") {
    holdReasons.push("RF_NOT_PASS_NEW_CONTENT");
    if (rfVerdict === "REFRESH_EXISTING" || nba?.action === "REFRESH_EXISTING") {
      holdReasons.push("UNSUPPORTED_ACTION");
    }
  } else if (!rfVerdict && pipeline.evaluationStatus === "OK") {
    holdReasons.push("INELIGIBLE_DECISION");
  }

  if (nba) {
    if (nba.action !== "NEW_BLOG") {
      holdReasons.push("NBA_NOT_NEW_BLOG");
      holdReasons.push("UNSUPPORTED_ACTION");
    }
    if (nba.autonomousEligible !== true) {
      holdReasons.push("NBA_NOT_AUTONOMOUS_ELIGIBLE");
    }
  } else if (pipeline.evaluationStatus === "OK") {
    holdReasons.push("INELIGIBLE_DECISION");
  }

  if (priority) {
    if (priority.automationSelectable !== true) {
      holdReasons.push("PRIORITY_NOT_SELECTABLE");
    }
  }

  // Research recommendation must be explicitly NEW_BLOG — missing/empty/other → HOLD.
  const researchRec = pipeline.opportunity?.recommendation;
  if (researchRec !== "NEW_BLOG") {
    holdReasons.push("UNSUPPORTED_ACTION");
  }

  if (!sources.length && !groundedEvidence.length) {
    holdReasons.push("MISSING_SOURCES");
  } else if (!sources.length) {
    // Grounded site facts alone can supply evidence, but recorded sources preferred.
    // Allow READY when grounded site_fact exists; otherwise uncertain.
    const hasSiteFact = groundedEvidence.some((g) => g.kind === "site_fact");
    if (!hasSiteFact) holdReasons.push("MISSING_SOURCES");
  } else if (!sources.some((s) => s.verified) && !groundedEvidence.some((g) => g.kind === "site_fact")) {
    // Have recorded URLs but none verified and no site facts → uncertain support
    holdReasons.push("UNCERTAIN_SOURCE_SUPPORT");
  }

  const originalParsed = normalizeOriginalContribution(input.originalContribution);
  let originalStatement = "";
  let originalBacking: SeoEvidencePackOriginalContribution["backing"] | null = null;
  let originalProposed = false;
  let originalSupported = false;

  if (!originalParsed.ok) {
    holdReasons.push(originalParsed.reason);
  } else {
    originalProposed = true;
    originalStatement = originalParsed.value.statement;
    originalBacking = originalParsed.value.backing;
    originalSupported = originalContributionSupported(
      originalParsed.value,
      groundedEvidence,
      sources,
    );
    if (!originalSupported) {
      holdReasons.push("UNSUPPORTED_ORIGINAL_VALUE");
    }
  }

  const unique = uniqueHoldReasons(holdReasons);
  const status: SeoEvidencePackStatus =
    unique.length === 0 ? "READY_FOR_DRAFTING_REVIEW" : "HOLD";

  return {
    packVersion: SEO_EVIDENCE_PACK_VERSION,
    status,
    holdReasons: unique,
    readyForDraftingReview: status === "READY_FOR_DRAFTING_REVIEW",
    publicationReady: false,
    opportunityIndex,
    opportunityIdentity,
    topic,
    workingTitle,
    searchIntent,
    researchRecommendation: researchRec ?? null,
    researchConfidence: pipeline.opportunity?.confidence ?? null,
    existingCoverage: pipeline.opportunity?.existingCoverage ?? null,
    matchedPublicUrl: pipeline.opportunity?.matchedPublicUrl ?? null,
    recordedSources: sources,
    groundedEvidence,
    gscEvidence,
    originalContribution: {
      statement: originalStatement,
      backing: originalBacking,
      proposed: originalProposed,
      supported: originalSupported,
    },
    pipeline: pipelineSlice,
    advisoryNotes: [
      "READY_FOR_DRAFTING_REVIEW is not publication approval.",
      "Recorded source URLs are not verified evidence unless independently grounded.",
      "Factuality, QA, and publication gates remain separate later phases.",
    ],
  };
}
