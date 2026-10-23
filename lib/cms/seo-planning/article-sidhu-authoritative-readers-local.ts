/**
 * A2-8/A2-9/A2-10 — LOCAL-ONLY authoritative readers for Planning / Ledger / lineage / evidence.
 *
 * A2-9 hardens trust: bare `verified` flags and GSC query×page string coincidence
 * never impersonate independently verified first-party or opportunity-linked GSC evidence.
 *
 * A2-10 reuses the exact L4A/H3B `first-party-site-fact-verify` module via injected
 * read-only CMS catalog DI. Claim-level support requires the real verifier result —
 * not client attestations. Offline fixtures remain SYNTHETIC_TEST, not live production
 * authenticity.
 *
 * Composes existing read-only contracts behind injected dependencies. Never opens
 * the ambient MySQL pool, never calls GSC/AI, never mutates CMS/Ledger/Planning.
 *
 * Storage provenance ≠ claim verification ≠ Apply authorization.
 */

import type { SeoEvidencePackInput } from "@/lib/cms/seo-autonomy/evidence-pack";
import {
  verifyPlanningFirstPartySiteFacts,
  type FirstPartyVerifyCatalog,
} from "@/lib/cms/seo-autonomy/first-party-site-fact-verify";
import type { GscUkEvidencePack } from "@/lib/cms/gsc/evidence-types";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";
import { resolvePlanningDecisionLineage } from "@/lib/cms/seo-planning-lineage/read";
import type { PlanningLineageStore } from "@/lib/cms/seo-planning-lineage/repository";
import type {
  ResolvePlanningDecisionLineageResult,
  SeoPlanningLineageReadState,
} from "@/lib/cms/seo-planning-lineage/types";
import {
  decisionSnapshotIncomplete,
  researchRunSupportsLineage,
} from "@/lib/cms/seo-planning-lineage/validate";
import {
  editorialEvidenceAsUntrustedPackHints,
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "@/lib/cms/seo-planning/editorial-evidence";
import type {
  SidhuEvidenceProvenanceKind,
  SidhuTrustedEvidenceReadResult,
  SidhuTrustedEvidenceSourceReader,
} from "@/lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import type { SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC =
  "a2-10-sidhu-authoritative-readers-local-v1" as const;

/**
 * Maximum logical read budget for one Planning → evidence resolution.
 * Calls are sequential (identity first, then evidence). No retries/polling.
 */
export const SIDHU_AUTHORITATIVE_READ_BUDGET = {
  maxPlanningExactLookups: 1,
  maxBlogIdentityLookups: 1,
  /**
   * Actual resolvePlanningDecisionLineage store calls when LINKED:
   * schema + link-by-draft + reverse-by-decision + decision + research run (=5).
   */
  maxLineageResolverReads: 5,
  /** Exact Research run detail only when lineage supplies a validated run id. */
  maxLedgerRunDetailLookups: 1,
  maxOpportunityEvidenceSnapshotReads: 1,
  maxGscPackReads: 1,
  /** verifyPlanningFirstPartySiteFacts: 1 draft + ≤entryCap slug lookups (sequential). */
  maxFirstPartyVerifierInvocations: 1,
  parallelAllowed: false,
  totalMaxLogicalReads: 10,
} as const;

export const SIDHU_EVIDENCE_PROVENANCE_CATEGORIES = [
  "STORED_PLANNING",
  "DURABLY_LINKED_LEDGER",
  "LEDGER_RUN_ONLY",
  "GSC_OPPORTUNITY_LINKED",
  "GSC_RUN_LEVEL_ONLY",
  "FIRST_PARTY_VERIFIED",
  "EDITORIAL_UNVERIFIED",
  "SYNTHETIC_TEST",
  "UNAVAILABLE",
  "CONFLICTED",
] as const;

export type SidhuEvidenceProvenanceCategory =
  (typeof SIDHU_EVIDENCE_PROVENANCE_CATEGORIES)[number];

/** Mirrors getSeoResearchRunDetail without importing the MySQL pool module. */
export type SidhuLedgerRunDetailResult =
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

export type SidhuLedgerRunDetailReader = {
  getSeoResearchRunDetail(args: { runId: string }): Promise<SidhuLedgerRunDetailResult>;
};

export type SidhuGscLinkageKind =
  | "opportunity_linked"
  | "run_level_only"
  | "absent"
  | "mismatched_scope";

export type SidhuFirstPartyVerificationKind =
  | "verified"
  | "unverified"
  | "absent"
  | "unavailable";

/**
 * @deprecated A2-10: client/harness attestations are never authoritative.
 * Kept only so forged attestation objects can be rejected explicitly in tests.
 */
export type SidhuTrustedFirstPartyAttestation = {
  evidenceId: string;
  claimNormalized: string;
  sourceType: "published_blog" | "cms_site_fact";
  sourceIdentity: {
    blogPostId?: string;
    blogSlug?: string;
    canonicalUrl?: string;
  };
  contentFingerprint: string;
  outcome: "ACCEPTED";
  verifiedAt: string;
  opportunityIdentity: string;
  issuer: "synthetic_test_harness" | string;
  expectedFingerprint?: string;
  stale?: boolean;
};

export type SidhuGscOpportunityEvidenceRef = {
  id: string;
  kind: "query_page";
  query: string;
  pageUrl: string;
};

/**
 * Exact opportunity↔GSC provenance. Query×page string coincidence alone is insufficient.
 */
export type SidhuGscOpportunityProvenance = {
  runId: string;
  decisionId: string;
  opportunityIdentity: string;
  opportunityIndex: number;
  evidenceRefs: readonly SidhuGscOpportunityEvidenceRef[];
  pack: GscUkEvidencePack;
  /** Explicit opportunity-owned evidence IDs (must match evidenceRefs[].id). */
  opportunityGscEvidenceIds: readonly string[];
};

/**
 * Already-retrieved, opportunity-scoped pack materials.
 * Callers must not forge READY / verified flags.
 */
export type SidhuOpportunityEvidenceSnapshot = {
  packInput: SeoEvidencePackInput;
  /** When true, maps to A2-7 provenance `synthetic_test` — never production authenticity. */
  syntheticTest?: boolean;
  /**
   * Legacy enum — NEVER promotes to FIRST_PARTY_VERIFIED by itself.
   */
  firstPartyVerification?: SidhuFirstPartyVerificationKind;
  /**
   * @deprecated A2-10 — never authoritative. Presence without a real verifier result fails closed.
   */
  firstPartyAttestations?: readonly SidhuTrustedFirstPartyAttestation[];
  /**
   * Optional freshness check: expected content fingerprints keyed by verifier evidenceId.
   * Mismatch → HOLD (source changed since verification expectation).
   */
  expectedFirstPartyFingerprints?: Readonly<Record<string, string>>;
  /**
   * Legacy linkage hint — `opportunity_linked` without gscOpportunityProvenance fails closed.
   */
  gscLinkage?: SidhuGscLinkageKind;
  /** Required for GSC_OPPORTUNITY_LINKED classification. */
  gscOpportunityProvenance?: SidhuGscOpportunityProvenance;
  clientReadyClaim?: unknown;
  /** Untrusted client/stored verified blobs (Blog ID, URL, verified:true, etc.). */
  clientVerifiedClaim?: unknown;
};

export type SidhuOpportunityEvidenceSnapshotReader = {
  readForValidatedDecision(args: {
    planningDraftId: string;
    decisionId: string;
    runId: string;
    opportunityIdentity: string;
    opportunityIndex: number;
  }): Promise<
    | { ok: true; snapshot: SidhuOpportunityEvidenceSnapshot }
    | {
        ok: false;
        code: "missing" | "timeout" | "error" | "identity_mismatch";
        message: string;
      }
  >;
};

export type SidhuAuthoritativeReadersDeps = {
  lineageStore: PlanningLineageStore;
  ledgerDetail: SidhuLedgerRunDetailReader;
  opportunityEvidence: SidhuOpportunityEvidenceSnapshotReader;
  /**
   * Injected read-only CMS boundary for the reused first-party verifier.
   * Required when packInput contains site_fact grounded evidence.
   */
  firstPartyCatalog?: FirstPartyVerifyCatalog;
};

export type SidhuAuthoritativeReadBudgetUsed = {
  lineageResolverInvoked: 0 | 1;
  ledgerRunDetailLookups: 0 | 1;
  opportunityEvidenceSnapshotReads: 0 | 1;
  gscPackReads: 0 | 1;
  firstPartyVerifierInvocations: 0 | 1;
};

export type SidhuFirstPartyTrustStatus =
  | "absent"
  | "unverified"
  | "synthetic_attested"
  | "verifier_accepted"
  | "verifier_unavailable"
  | "conflicted";

export type SidhuGscTrustStatus =
  | "absent"
  | "run_level_only"
  | "opportunity_linked_synthetic"
  | "unavailable"
  | "conflicted";

export type SidhuAuthoritativeEvidenceDiagnostic = {
  spec: typeof SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC;
  categories: SidhuEvidenceProvenanceCategory[];
  lineageState: SeoPlanningLineageReadState | "not_resolved";
  lineageErrorCode: string | null;
  decisionId: string | null;
  runId: string | null;
  opportunityIdentity: string | null;
  opportunityIndex: number | null;
  pipelineSnapshotIncomplete: boolean | null;
  firstPartyTrust: SidhuFirstPartyTrustStatus;
  gscTrust: SidhuGscTrustStatus;
  readBudget: typeof SIDHU_AUTHORITATIVE_READ_BUDGET;
  readBudgetUsed: SidhuAuthoritativeReadBudgetUsed;
  message: string;
};

export type SidhuAuthoritativeEvidenceResolution =
  | {
      ok: true;
      provenance: Exclude<SidhuEvidenceProvenanceKind, "unavailable">;
      packInput: SeoEvidencePackInput;
      diagnostic: SidhuAuthoritativeEvidenceDiagnostic;
    }
  | {
      ok: false;
      provenance: "unavailable";
      code: "evidence_unavailable" | "evidence_read_failure";
      message: string;
      diagnostic: SidhuAuthoritativeEvidenceDiagnostic;
    };

function emptyBudgetUsed(): SidhuAuthoritativeReadBudgetUsed {
  return {
    lineageResolverInvoked: 0,
    ledgerRunDetailLookups: 0,
    opportunityEvidenceSnapshotReads: 0,
    gscPackReads: 0,
    firstPartyVerifierInvocations: 0,
  };
}

function baseDiagnostic(
  partial: Partial<SidhuAuthoritativeEvidenceDiagnostic> & {
    categories: SidhuEvidenceProvenanceCategory[];
    message: string;
  },
  used: SidhuAuthoritativeReadBudgetUsed,
): SidhuAuthoritativeEvidenceDiagnostic {
  return {
    spec: SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC,
    lineageState: partial.lineageState ?? "not_resolved",
    lineageErrorCode: partial.lineageErrorCode ?? null,
    decisionId: partial.decisionId ?? null,
    runId: partial.runId ?? null,
    opportunityIdentity: partial.opportunityIdentity ?? null,
    opportunityIndex: partial.opportunityIndex ?? null,
    pipelineSnapshotIncomplete: partial.pipelineSnapshotIncomplete ?? null,
    firstPartyTrust: partial.firstPartyTrust ?? "absent",
    gscTrust: partial.gscTrust ?? "absent",
    readBudget: SIDHU_AUTHORITATIVE_READ_BUDGET,
    readBudgetUsed: used,
    categories: partial.categories,
    message: partial.message,
  };
}

function listSiteFactGroundedIds(packInput: SeoEvidencePackInput): string[] {
  const rows = packInput.groundedEvidence;
  if (!Array.isArray(rows)) return [];
  const ids: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { kind?: unknown; id?: unknown };
    if (rec.kind !== "site_fact") continue;
    const id = String(rec.id || "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

function rejectForgedReadyClaim(claim: unknown): string | null {
  if (claim == null) return null;
  if (typeof claim !== "object" || Array.isArray(claim)) {
    return "Forged or malformed client READY claim rejected.";
  }
  const row = claim as Record<string, unknown>;
  if (
    row.ready === true ||
    row.READY === true ||
    row.readyForDraftingReview === true ||
    row.applyEvidenceGate === "PASS_DRAFTING_REVIEW_ONLY" ||
    row.executionAuthorized === true ||
    row.verified === true ||
    row.forceReady === true
  ) {
    return "Forged caller-provided READY / verified flags are not authoritative.";
  }
  if (Object.keys(row).length > 0) {
    return "Untrusted client evidence claim object rejected.";
  }
  return null;
}

function rejectUntrustedVerifiedBlob(claim: unknown): string | null {
  if (claim == null) return null;
  if (typeof claim !== "object" || Array.isArray(claim)) {
    return "Client-generated verification record rejected.";
  }
  const row = claim as Record<string, unknown>;
  if (
    row.verified === true ||
    row.trusted === true ||
    row.firstPartyVerified === true ||
    row.source_backed === true ||
    row.grounded === true ||
    row.ready === true
  ) {
    return "Stored or client verified/trusted flags are not independent first-party verification.";
  }
  if (typeof row.blogPostId === "string" && row.blogPostId.trim()) {
    return "Blog ID alone is not first-party claim verification.";
  }
  if (typeof row.url === "string" && row.url.trim()) {
    return "Editorial or source URL alone is not first-party claim verification.";
  }
  if (Object.keys(row).length > 0) {
    return "Untrusted client verification object rejected.";
  }
  return null;
}

/**
 * Editorial notes stored on Planning — always EDITORIAL_UNVERIFIED.
 * Never promoted to verified pack inputs.
 */
export function readSidhuPlanningEditorialAsUntrustedLocal(planning: SeoPlanningDraft): {
  category: "EDITORIAL_UNVERIFIED" | "STORED_PLANNING";
  trust: typeof SEO_PLANNING_EDITORIAL_TRUST | "absent";
  hints: ReturnType<typeof editorialEvidenceAsUntrustedPackHints> | null;
  neverVerified: true;
} {
  const evidence = readSeoPlanningEditorialEvidence(planning.payload);
  const hasEditorial =
    Boolean(evidence.originalContribution.trim()) ||
    Boolean(evidence.readerBenefit.trim()) ||
    Boolean(evidence.missingEvidenceNotes.trim()) ||
    evidence.entries.length > 0;
  if (!hasEditorial) {
    return {
      category: "STORED_PLANNING",
      trust: "absent",
      hints: null,
      neverVerified: true,
    };
  }
  return {
    category: "EDITORIAL_UNVERIFIED",
    trust: SEO_PLANNING_EDITORIAL_TRUST,
    hints: editorialEvidenceAsUntrustedPackHints(evidence),
    neverVerified: true,
  };
}

/**
 * Classify an already-retrieved GSC UK pack WITHOUT treating query×page string
 * coincidence as opportunity linkage. Opportunity linkage requires
 * `assessGscOpportunityLinkageLocal` with explicit evidence-record refs.
 * Never calls the GSC API.
 */
export function classifyGscUkPackLinkageLocal(args: {
  pack: GscUkEvidencePack | null | undefined;
  runLevelGscStatus?: string | null;
  requiredQuery?: string | null;
  requiredPageUrl?: string | null;
  requiredCountryCode?: "GB";
}): {
  category: Extract<
    SidhuEvidenceProvenanceCategory,
    "GSC_OPPORTUNITY_LINKED" | "GSC_RUN_LEVEL_ONLY" | "UNAVAILABLE" | "CONFLICTED"
  >;
  linkage: SidhuGscLinkageKind;
  message: string;
} {
  const runStatus = String(args.runLevelGscStatus || "")
    .trim()
    .toUpperCase();
  const runLevelOnly =
    runStatus === "AVAILABLE" || runStatus === "OK" || runStatus === "AVAILABLE_OK";

  if (!args.pack) {
    if (runLevelOnly) {
      return {
        category: "GSC_RUN_LEVEL_ONLY",
        linkage: "run_level_only",
        message: "Run-level GSC AVAILABLE without opportunity-linked query × page evidence.",
      };
    }
    return {
      category: "UNAVAILABLE",
      linkage: "absent",
      message: "No GSC evidence pack supplied.",
    };
  }

  if (args.pack.country.code !== (args.requiredCountryCode ?? "GB")) {
    return {
      category: "CONFLICTED",
      linkage: "mismatched_scope",
      message: "GSC pack country does not match the required UK/GB scope.",
    };
  }

  if (args.pack.status !== "AVAILABLE" && args.pack.status !== "NO_ROWS") {
    if (runLevelOnly) {
      return {
        category: "GSC_RUN_LEVEL_ONLY",
        linkage: "run_level_only",
        message: "Run-level GSC flag present but pack status is not usable for opportunity linkage.",
      };
    }
    return {
      category: "UNAVAILABLE",
      linkage: "absent",
      message: `GSC pack status ${args.pack.status} is not opportunity-linked evidence.`,
    };
  }

  const query = String(args.requiredQuery || "").trim();
  const pageUrl = String(args.requiredPageUrl || "").trim();

  // A2-9: matching query/page strings alone NEVER yield opportunity_linked.
  if (query || pageUrl || runLevelOnly || args.pack.status === "AVAILABLE") {
    return {
      category: "GSC_RUN_LEVEL_ONLY",
      linkage: "run_level_only",
      message:
        "Query×page string coincidence is not authoritative opportunity linkage. Explicit evidence-record refs are required.",
    };
  }

  return {
    category: "UNAVAILABLE",
    linkage: "absent",
    message: "GSC pack lacks opportunity-linked evidence-record provenance.",
  };
}

/**
 * Assess exact opportunity-level GSC query×page provenance against lineage identities
 * and an already-retrieved bounded pack. Does not synthesize evidence IDs.
 */
export function assessGscOpportunityLinkageLocal(args: {
  provenance: SidhuGscOpportunityProvenance | null | undefined;
  expectedRunId: string;
  expectedDecisionId: string;
  expectedOpportunityIdentity: string;
  expectedOpportunityIndex: number;
  /** Optional packInput.gscEvidence rows for ID/kind consistency. */
  packInputGscEvidence?: unknown;
}): {
  ok: true;
  category: "GSC_OPPORTUNITY_LINKED";
  linkage: "opportunity_linked";
  gscTrust: "opportunity_linked_synthetic";
  message: string;
} | {
  ok: false;
  category: Extract<
    SidhuEvidenceProvenanceCategory,
    "GSC_RUN_LEVEL_ONLY" | "UNAVAILABLE" | "CONFLICTED"
  >;
  linkage: Exclude<SidhuGscLinkageKind, "opportunity_linked">;
  gscTrust: Exclude<SidhuGscTrustStatus, "opportunity_linked_synthetic">;
  message: string;
} {
  const prov = args.provenance;
  if (!prov) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      linkage: "absent",
      gscTrust: "absent",
      message: "Missing GSC opportunity provenance (evidence-record refs required).",
    };
  }

  if (prov.runId !== args.expectedRunId) {
    return {
      ok: false,
      category: "CONFLICTED",
      linkage: "mismatched_scope",
      gscTrust: "conflicted",
      message: "GSC provenance Research run id does not match the linked Ledger run.",
    };
  }
  if (prov.decisionId !== args.expectedDecisionId) {
    return {
      ok: false,
      category: "CONFLICTED",
      linkage: "mismatched_scope",
      gscTrust: "conflicted",
      message: "GSC provenance decision id does not match the linked Ledger decision.",
    };
  }
  if (
    prov.opportunityIdentity !== args.expectedOpportunityIdentity ||
    prov.opportunityIndex !== args.expectedOpportunityIndex
  ) {
    return {
      ok: false,
      category: "CONFLICTED",
      linkage: "mismatched_scope",
      gscTrust: "conflicted",
      message: "GSC provenance opportunity identity/index mismatch.",
    };
  }

  const pack = prov.pack;
  if (!pack || pack.country.code !== "GB") {
    return {
      ok: false,
      category: "CONFLICTED",
      linkage: "mismatched_scope",
      gscTrust: "conflicted",
      message: "GSC pack country/scope is not UK/GB.",
    };
  }
  if (!pack.window?.recentStart || !pack.window?.recentEnd) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      linkage: "absent",
      gscTrust: "unavailable",
      message: "GSC pack date window metadata is missing.",
    };
  }
  if (pack.status !== "AVAILABLE" && pack.status !== "NO_ROWS") {
    return {
      ok: false,
      category: "UNAVAILABLE",
      linkage: "absent",
      gscTrust: "unavailable",
      message: `GSC pack status ${pack.status} cannot support opportunity linkage.`,
    };
  }

  const refs = Array.isArray(prov.evidenceRefs) ? prov.evidenceRefs : [];
  const ownedIds = Array.isArray(prov.opportunityGscEvidenceIds)
    ? prov.opportunityGscEvidenceIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (refs.length === 0) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      linkage: "absent",
      gscTrust: "unavailable",
      message: "Missing evidence-record ID / query_page refs for opportunity GSC linkage.",
    };
  }
  if (ownedIds.length === 0) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      linkage: "absent",
      gscTrust: "unavailable",
      message: "Missing opportunity-owned GSC evidence-record IDs.",
    };
  }

  const ownedSet = new Set(ownedIds);
  const seenRefIds = new Set<string>();
  for (const ref of refs) {
    if (!ref || ref.kind !== "query_page") {
      return {
        ok: false,
        category: "CONFLICTED",
        linkage: "mismatched_scope",
        gscTrust: "conflicted",
        message: "GSC evidence kind must be query_page for opportunity linkage.",
      };
    }
    const id = String(ref.id || "").trim();
    const query = String(ref.query || "").trim();
    const pageUrl = String(ref.pageUrl || "").trim();
    if (!id || !query || !pageUrl) {
      return {
        ok: false,
        category: "UNAVAILABLE",
        linkage: "absent",
        gscTrust: "unavailable",
        message: "query_page evidence ref missing id, query, or pageUrl.",
      };
    }
    if (seenRefIds.has(id)) {
      return {
        ok: false,
        category: "CONFLICTED",
        linkage: "mismatched_scope",
        gscTrust: "conflicted",
        message: "Duplicate GSC evidence-record refs are not allowed.",
      };
    }
    seenRefIds.add(id);
    if (!ownedSet.has(id)) {
      return {
        ok: false,
        category: "CONFLICTED",
        linkage: "mismatched_scope",
        gscTrust: "conflicted",
        message: "GSC evidence-record id is not owned by this opportunity.",
      };
    }

    const exactRow = (pack.recentQueryPages || []).find((row) => {
      const keys = Array.isArray(row.keys) ? row.keys.map((k) => String(k)) : [];
      return keys[0] === query && keys[1] === pageUrl;
    });
    if (!exactRow) {
      return {
        ok: false,
        category: "CONFLICTED",
        linkage: "mismatched_scope",
        gscTrust: "conflicted",
        message:
          "query_page ref does not exactly match a bounded pack recentQueryPages row (absence is not zero-demand proof).",
      };
    }
  }

  for (const id of ownedIds) {
    if (!seenRefIds.has(id)) {
      return {
        ok: false,
        category: "CONFLICTED",
        linkage: "mismatched_scope",
        gscTrust: "conflicted",
        message: "Opportunity GSC evidence id lacks a matching query_page ref.",
      };
    }
  }

  // Optional consistency with packInput.gscEvidence rows when supplied.
  const gscRows = args.packInputGscEvidence;
  if (Array.isArray(gscRows) && gscRows.length > 0) {
    const byId = new Map<string, { kind?: string; query?: string; pageUrl?: string }>();
    for (const row of gscRows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { id?: unknown; kind?: unknown; query?: unknown; pageUrl?: unknown };
      const id = String(rec.id || "").trim();
      if (!id) continue;
      if (byId.has(id)) {
        return {
          ok: false,
          category: "CONFLICTED",
          linkage: "mismatched_scope",
          gscTrust: "conflicted",
          message: "Conflicting duplicate gscEvidence ids in pack input.",
        };
      }
      byId.set(id, {
        kind: String(rec.kind || ""),
        query: String(rec.query || ""),
        pageUrl: String(rec.pageUrl || ""),
      });
    }
    for (const ref of refs) {
      const row = byId.get(ref.id);
      if (!row) {
        return {
          ok: false,
          category: "CONFLICTED",
          linkage: "mismatched_scope",
          gscTrust: "conflicted",
          message: "Opportunity GSC ref id is missing from packInput.gscEvidence.",
        };
      }
      if (row.kind !== "query_page" || row.query !== ref.query || row.pageUrl !== ref.pageUrl) {
        return {
          ok: false,
          category: "CONFLICTED",
          linkage: "mismatched_scope",
          gscTrust: "conflicted",
          message: "packInput.gscEvidence does not match opportunity query_page provenance.",
        };
      }
    }
  }

  return {
    ok: true,
    category: "GSC_OPPORTUNITY_LINKED",
    linkage: "opportunity_linked",
    gscTrust: "opportunity_linked_synthetic",
    message:
      "Exact opportunity-owned query_page evidence refs validated against bounded GSC pack (synthetic/offline provenance only).",
  };
}

/**
 * Assess first-party site_fact trust via the reused L4A verifier.
 * Bare verified flags, client attestations, Blog IDs and editorial URLs never succeed.
 * Offline catalog DI may be synthetic — still classified SYNTHETIC_TEST at the caller.
 */
export async function assessFirstPartySiteFactTrustLocal(args: {
  planningDraftId: string;
  packInput: SeoEvidencePackInput;
  opportunityIdentity: string;
  syntheticTest: boolean;
  catalog: FirstPartyVerifyCatalog | null | undefined;
  firstPartyVerification?: SidhuFirstPartyVerificationKind;
  attestations?: readonly SidhuTrustedFirstPartyAttestation[] | null;
  expectedFingerprints?: Readonly<Record<string, string>> | null;
  clientVerifiedClaim?: unknown;
}): Promise<
  | {
      ok: true;
      firstPartyTrust: SidhuFirstPartyTrustStatus;
      emitFirstPartyVerifiedCategory: boolean;
      message: string;
      verifierInvoked: boolean;
    }
  | {
      ok: false;
      firstPartyTrust: SidhuFirstPartyTrustStatus;
      message: string;
      verifierInvoked: boolean;
    }
> {
  const siteFactIds = listSiteFactGroundedIds(args.packInput);
  const blobReject = rejectUntrustedVerifiedBlob(args.clientVerifiedClaim);
  if (blobReject) {
    return {
      ok: false,
      firstPartyTrust: "conflicted",
      message: blobReject,
      verifierInvoked: false,
    };
  }

  // Client/harness attestations are never a substitute for the reused verifier.
  if (args.attestations && args.attestations.length > 0) {
    return {
      ok: false,
      firstPartyTrust: "conflicted",
      message:
        "Client-generated or harness first-party attestations are not authoritative; the reused verifier must evaluate sources.",
      verifierInvoked: false,
    };
  }

  if (siteFactIds.length === 0) {
    if (args.firstPartyVerification === "verified") {
      return {
        ok: false,
        firstPartyTrust: "unverified",
        message: "firstPartyVerification=verified without site_fact grounded evidence is rejected.",
        verifierInvoked: false,
      };
    }
    return {
      ok: true,
      firstPartyTrust: "absent",
      emitFirstPartyVerifiedCategory: false,
      message: "No site_fact grounded evidence present.",
      verifierInvoked: false,
    };
  }

  if (args.firstPartyVerification === "verified") {
    return {
      ok: false,
      firstPartyTrust: "unverified",
      message:
        "verified flag / firstPartyVerification=verified without reused verifier execution is not independent verification.",
      verifierInvoked: false,
    };
  }

  if (args.firstPartyVerification === "unverified" || args.firstPartyVerification === "unavailable") {
    return {
      ok: false,
      firstPartyTrust:
        args.firstPartyVerification === "unavailable" ? "verifier_unavailable" : "unverified",
      message:
        args.firstPartyVerification === "unavailable"
          ? "First-party verification capability marked unavailable. HOLD."
          : "First-party site facts are present without verifier acceptance. HOLD.",
      verifierInvoked: false,
    };
  }

  if (!args.catalog) {
    return {
      ok: false,
      firstPartyTrust: "verifier_unavailable",
      message:
        "First-party site_fact grounded evidence requires the reused verifier with an injected read-only catalog. HOLD.",
      verifierInvoked: false,
    };
  }

  let verifyResult;
  try {
    verifyResult = await verifyPlanningFirstPartySiteFacts({
      planningDraftId: args.planningDraftId,
      catalog: args.catalog,
      authorized: true,
    });
  } catch {
    return {
      ok: false,
      firstPartyTrust: "verifier_unavailable",
      message: "First-party verifier threw during evaluation. HOLD.",
      verifierInvoked: true,
    };
  }

  if (verifyResult.status === "DENIED" || verifyResult.status === "FAILED") {
    return {
      ok: false,
      firstPartyTrust: "unverified",
      message: verifyResult.message || "First-party verifier denied or failed. HOLD.",
      verifierInvoked: true,
    };
  }
  if (verifyResult.status === "MISSING_DRAFT") {
    return {
      ok: false,
      firstPartyTrust: "unverified",
      message: "First-party verifier could not load the Planning draft. HOLD.",
      verifierInvoked: true,
    };
  }

  const provenanceById = new Map(
    verifyResult.provenance.map((row) => [row.evidenceId, row] as const),
  );
  const groundedIds = new Set(verifyResult.groundedEvidence.map((row) => row.id));

  if (groundedIds.size === 0) {
    return {
      ok: false,
      firstPartyTrust: "unverified",
      message:
        "No first-party site facts could be verified from published CMS content for this Planning draft. HOLD.",
      verifierInvoked: true,
    };
  }

  for (const id of siteFactIds) {
    if (!groundedIds.has(id) || !provenanceById.has(id)) {
      return {
        ok: false,
        firstPartyTrust: "conflicted",
        message:
          "Pack site_fact evidence id was not produced by the reused verifier for this Planning draft (wrong claim/source cannot be reused).",
        verifierInvoked: true,
      };
    }
    const prov = provenanceById.get(id)!;
    const expected = args.expectedFingerprints?.[id];
    if (expected && expected !== prov.contentFingerprint) {
      return {
        ok: false,
        firstPartyTrust: "conflicted",
        message: "First-party source fingerprint mismatch (source changed). HOLD.",
        verifierInvoked: true,
      };
    }
    if (!prov.matchedClaimNormalized || !prov.blogPostId || !prov.canonicalUrl) {
      return {
        ok: false,
        firstPartyTrust: "unverified",
        message: "Verifier provenance incomplete for accepted site_fact. HOLD.",
        verifierInvoked: true,
      };
    }
  }

  return {
    ok: true,
    firstPartyTrust: "verifier_accepted",
    emitFirstPartyVerifiedCategory: true,
    message: args.syntheticTest
      ? "Reused first-party verifier accepted claim-level support from injected published CMS fixtures (synthetic/offline — not live production authenticity)."
      : "Reused first-party verifier accepted claim-level support from published CMS content.",
    verifierInvoked: true,
  };
}

function validateLedgerAgainstLineage(args: {
  lineage: Extract<ResolvePlanningDecisionLineageResult, { ok: true; state: "LINKED" }>;
  detail: SidhuLedgerRunDetailResult;
}):
  | { ok: true; decision: SeoOpportunityDecisionRow; run: SeoResearchRunRow }
  | { ok: false; category: SidhuEvidenceProvenanceCategory; message: string } {
  if (!args.detail.ok) {
    if (args.detail.errorCode === "not_found") {
      return {
        ok: false,
        category: "UNAVAILABLE",
        message: "Linked Research run is missing from the Ledger detail reader.",
      };
    }
    if (args.detail.errorCode === "unavailable" || args.detail.errorCode === "query_error") {
      return {
        ok: false,
        category: "UNAVAILABLE",
        message: args.detail.errorMessage || "Ledger detail reader failed closed.",
      };
    }
    return {
      ok: false,
      category: "UNAVAILABLE",
      message: args.detail.errorMessage || "Ledger detail lookup rejected.",
    };
  }

  const run = args.detail.run;
  if (run.id !== args.lineage.researchRun.id || run.id !== args.lineage.decision.runId) {
    return {
      ok: false,
      category: "CONFLICTED",
      message: "Ledger run id disagrees with lineage Research run / decision.runId.",
    };
  }

  if (!researchRunSupportsLineage(run)) {
    if (run.pipelineRunStatus !== "OK") {
      return {
        ok: false,
        category: "UNAVAILABLE",
        message: "Research run pipeline status is unsupported for durable evidence.",
      };
    }
    return {
      ok: false,
      category: "UNAVAILABLE",
      message: "Research run is incomplete for durable evidence use.",
    };
  }

  const decision = args.detail.decisions.find((row) => row.id === args.lineage.decision.id);
  if (!decision) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      message: "Linked decision is missing from the current Ledger run detail dataset.",
    };
  }

  if (decision.runId !== run.id) {
    return {
      ok: false,
      category: "CONFLICTED",
      message: "Decision/run mismatch between Ledger detail rows.",
    };
  }

  if (
    decision.opportunityIdentity !== args.lineage.decision.opportunityIdentity ||
    decision.opportunityIndex !== args.lineage.decision.opportunityIndex
  ) {
    return {
      ok: false,
      category: "CONFLICTED",
      message: "Opportunity identity/index disagrees between lineage and Ledger detail.",
    };
  }

  if (
    !decision.opportunityIdentity ||
    !Number.isInteger(decision.opportunityIndex) ||
    decision.opportunityIndex < 0 ||
    decision.opportunityIndex >= 5
  ) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      message: "Decision opportunity identity/index is invalid.",
    };
  }

  if (decisionSnapshotIncomplete(decision) || args.lineage.pipelineSnapshotIncomplete) {
    return {
      ok: false,
      category: "UNAVAILABLE",
      message: "Linked decision pipeline snapshot is incomplete for Evidence Pack use.",
    };
  }

  return { ok: true, decision, run };
}

/**
 * Resolve opportunity-scoped evidence for a Planning draft via lineage → Ledger → snapshot.
 * Fail closed on missing schema, unlink, conflict, incomplete runs, forged READY/verified,
 * or GSC/first-party trust impersonation.
 */
export async function resolveAuthoritativeEvidencePackInputForPlanningLocal(args: {
  planningDraftId: string;
  planning: SeoPlanningDraft;
  deps: SidhuAuthoritativeReadersDeps;
}): Promise<SidhuAuthoritativeEvidenceResolution> {
  const used = emptyBudgetUsed();
  const editorial = readSidhuPlanningEditorialAsUntrustedLocal(args.planning);
  const baseCategories: SidhuEvidenceProvenanceCategory[] = ["STORED_PLANNING"];
  if (editorial.category === "EDITORIAL_UNVERIFIED") {
    baseCategories.push("EDITORIAL_UNVERIFIED");
  }

  used.lineageResolverInvoked = 1;
  let lineage: ResolvePlanningDecisionLineageResult;
  try {
    lineage = await resolvePlanningDecisionLineage({
      planningDraftId: args.planningDraftId,
      store: args.deps.lineageStore,
    });
  } catch {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_read_failure",
      message: "Planning lineage resolver failed. Evidence remains unavailable.",
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "UNAVAILABLE"],
          lineageState: "UNAVAILABLE",
          lineageErrorCode: "READ_ERROR",
          message: "Planning lineage resolver threw.",
        },
        used,
      ),
    };
  }

  if (!lineage.ok) {
    const conflicted = lineage.state === "CONFLICT";
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: lineage.errorMessage,
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, conflicted ? "CONFLICTED" : "UNAVAILABLE"],
          lineageState: lineage.state,
          lineageErrorCode: lineage.errorCode,
          message: lineage.errorMessage,
        },
        used,
      ),
    };
  }

  if (lineage.state === "UNLINKED") {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message:
        "No persisted Planning↔Decision lineage. Ledger run existence alone is not Planning provenance.",
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "LEDGER_RUN_ONLY", "UNAVAILABLE"],
          lineageState: "UNLINKED",
          message: "Planning draft is not durably linked to a Ledger decision.",
        },
        used,
      ),
    };
  }

  if (lineage.state === "INCOMPLETE") {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: lineage.reason,
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "UNAVAILABLE"],
          lineageState: "INCOMPLETE",
          decisionId: lineage.link.decisionId,
          message: lineage.reason,
        },
        used,
      ),
    };
  }

  used.ledgerRunDetailLookups = 1;
  let detail: SidhuLedgerRunDetailResult;
  try {
    detail = await args.deps.ledgerDetail.getSeoResearchRunDetail({
      runId: lineage.researchRun.id,
    });
  } catch {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_read_failure",
      message: "Ledger detail reader failed. Evidence remains unavailable.",
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "UNAVAILABLE"],
          lineageState: "LINKED",
          decisionId: lineage.decision.id,
          runId: lineage.researchRun.id,
          opportunityIdentity: lineage.decision.opportunityIdentity,
          opportunityIndex: lineage.decision.opportunityIndex,
          pipelineSnapshotIncomplete: lineage.pipelineSnapshotIncomplete,
          message: "Ledger detail reader threw.",
        },
        used,
      ),
    };
  }

  const ledgerCheck = validateLedgerAgainstLineage({ lineage, detail });
  if (!ledgerCheck.ok) {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: ledgerCheck.message,
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, ledgerCheck.category],
          lineageState: "LINKED",
          decisionId: lineage.decision.id,
          runId: lineage.researchRun.id,
          opportunityIdentity: lineage.decision.opportunityIdentity,
          opportunityIndex: lineage.decision.opportunityIndex,
          pipelineSnapshotIncomplete: lineage.pipelineSnapshotIncomplete,
          message: ledgerCheck.message,
        },
        used,
      ),
    };
  }

  used.opportunityEvidenceSnapshotReads = 1;
  let snapshotRead: Awaited<
    ReturnType<SidhuOpportunityEvidenceSnapshotReader["readForValidatedDecision"]>
  >;
  try {
    snapshotRead = await args.deps.opportunityEvidence.readForValidatedDecision({
      planningDraftId: args.planningDraftId,
      decisionId: ledgerCheck.decision.id,
      runId: ledgerCheck.run.id,
      opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
      opportunityIndex: ledgerCheck.decision.opportunityIndex,
    });
  } catch {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_read_failure",
      message: "Opportunity evidence snapshot reader failed.",
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "DURABLY_LINKED_LEDGER", "UNAVAILABLE"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          message: "Opportunity evidence snapshot reader threw.",
        },
        used,
      ),
    };
  }

  if (!snapshotRead.ok) {
    const code =
      snapshotRead.code === "timeout" || snapshotRead.code === "error"
        ? ("evidence_read_failure" as const)
        : ("evidence_unavailable" as const);
    return {
      ok: false,
      provenance: "unavailable",
      code,
      message: snapshotRead.message,
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "DURABLY_LINKED_LEDGER", "UNAVAILABLE"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          message: snapshotRead.message,
        },
        used,
      ),
    };
  }

  const snapshot = snapshotRead.snapshot;
  const forged = rejectForgedReadyClaim(snapshot.clientReadyClaim);
  if (forged) {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: forged,
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "DURABLY_LINKED_LEDGER", "CONFLICTED"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          firstPartyTrust: "conflicted",
          message: forged,
        },
        used,
      ),
    };
  }

  const packIdentity =
    String(
      snapshot.packInput.opportunityIdentity ??
        snapshot.packInput.pipeline?.opportunityIdentity ??
        "",
    ).trim() || "";
  if (packIdentity && packIdentity !== ledgerCheck.decision.opportunityIdentity) {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: "Evidence pack opportunity identity does not match the linked Ledger decision.",
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "DURABLY_LINKED_LEDGER", "CONFLICTED"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          message: "Pack opportunity identity mismatch.",
        },
        used,
      ),
    };
  }

  const packIndex = snapshot.packInput.opportunityIndex;
  if (
    typeof packIndex === "number" &&
    Number.isInteger(packIndex) &&
    packIndex !== ledgerCheck.decision.opportunityIndex
  ) {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: "Evidence pack opportunity index does not match the linked Ledger decision.",
      diagnostic: baseDiagnostic(
        {
          categories: [...baseCategories, "DURABLY_LINKED_LEDGER", "CONFLICTED"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          message: "Pack opportunity index mismatch.",
        },
        used,
      ),
    };
  }

  const categories: SidhuEvidenceProvenanceCategory[] = [
    ...baseCategories,
    "DURABLY_LINKED_LEDGER",
  ];
  if (snapshot.syntheticTest === true) {
    categories.push("SYNTHETIC_TEST");
  }

  const fpTrust = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: args.planningDraftId,
    packInput: snapshot.packInput,
    opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
    syntheticTest: snapshot.syntheticTest === true,
    catalog: args.deps.firstPartyCatalog,
    firstPartyVerification: snapshot.firstPartyVerification,
    attestations: snapshot.firstPartyAttestations,
    expectedFingerprints: snapshot.expectedFirstPartyFingerprints,
    clientVerifiedClaim: snapshot.clientVerifiedClaim,
  });
  if (fpTrust.verifierInvoked) {
    used.firstPartyVerifierInvocations = 1;
  }
  if (!fpTrust.ok) {
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: fpTrust.message,
      diagnostic: baseDiagnostic(
        {
          categories: [...categories, "UNAVAILABLE"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          firstPartyTrust: fpTrust.firstPartyTrust,
          message: fpTrust.message,
        },
        used,
      ),
    };
  }
  if (fpTrust.emitFirstPartyVerifiedCategory) {
    categories.push("FIRST_PARTY_VERIFIED");
  }

  let gscTrust: SidhuGscTrustStatus = "absent";
  const claimsOpportunityGsc =
    snapshot.gscLinkage === "opportunity_linked" ||
    Boolean(snapshot.gscOpportunityProvenance) ||
    (Array.isArray(snapshot.packInput.gscEvidence) &&
      (snapshot.packInput.gscEvidence as unknown[]).length > 0);

  if (snapshot.gscLinkage === "run_level_only") {
    categories.push("GSC_RUN_LEVEL_ONLY");
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message:
        "Run-level GSC AVAILABLE is insufficient; opportunity-linked query × page evidence refs are required.",
      diagnostic: baseDiagnostic(
        {
          categories: [...categories, "UNAVAILABLE"],
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          firstPartyTrust: fpTrust.firstPartyTrust,
          gscTrust: "run_level_only",
          message: "GSC run-level only blocked opportunity evidence.",
        },
        used,
      ),
    };
  }

  if (snapshot.gscLinkage === "mismatched_scope" && !snapshot.gscOpportunityProvenance) {
    categories.push("CONFLICTED");
    return {
      ok: false,
      provenance: "unavailable",
      code: "evidence_unavailable",
      message: "GSC evidence country/date/URL scope does not match the opportunity.",
      diagnostic: baseDiagnostic(
        {
          categories,
          lineageState: "LINKED",
          decisionId: ledgerCheck.decision.id,
          runId: ledgerCheck.run.id,
          opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
          opportunityIndex: ledgerCheck.decision.opportunityIndex,
          pipelineSnapshotIncomplete: false,
          firstPartyTrust: fpTrust.firstPartyTrust,
          gscTrust: "conflicted",
          message: "GSC scope mismatch.",
        },
        used,
      ),
    };
  }

  if (claimsOpportunityGsc) {
    used.gscPackReads = snapshot.gscOpportunityProvenance ? 1 : used.gscPackReads;
    if (snapshot.gscLinkage === "opportunity_linked" && !snapshot.gscOpportunityProvenance) {
      return {
        ok: false,
        provenance: "unavailable",
        code: "evidence_unavailable",
        message:
          "gscLinkage=opportunity_linked without explicit opportunity evidence-record provenance is rejected.",
        diagnostic: baseDiagnostic(
          {
            categories: [...categories, "UNAVAILABLE"],
            lineageState: "LINKED",
            decisionId: ledgerCheck.decision.id,
            runId: ledgerCheck.run.id,
            opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
            opportunityIndex: ledgerCheck.decision.opportunityIndex,
            pipelineSnapshotIncomplete: false,
            firstPartyTrust: fpTrust.firstPartyTrust,
            gscTrust: "unavailable",
            message: "Missing GSC opportunity provenance.",
          },
          used,
        ),
      };
    }

    const gscAssess = assessGscOpportunityLinkageLocal({
      provenance: snapshot.gscOpportunityProvenance,
      expectedRunId: ledgerCheck.run.id,
      expectedDecisionId: ledgerCheck.decision.id,
      expectedOpportunityIdentity: ledgerCheck.decision.opportunityIdentity,
      expectedOpportunityIndex: ledgerCheck.decision.opportunityIndex,
      packInputGscEvidence: snapshot.packInput.gscEvidence,
    });
    if (!gscAssess.ok) {
      categories.push(gscAssess.category);
      return {
        ok: false,
        provenance: "unavailable",
        code: "evidence_unavailable",
        message: gscAssess.message,
        diagnostic: baseDiagnostic(
          {
            categories: [...categories, "UNAVAILABLE"],
            lineageState: "LINKED",
            decisionId: ledgerCheck.decision.id,
            runId: ledgerCheck.run.id,
            opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
            opportunityIndex: ledgerCheck.decision.opportunityIndex,
            pipelineSnapshotIncomplete: false,
            firstPartyTrust: fpTrust.firstPartyTrust,
            gscTrust: gscAssess.gscTrust,
            message: gscAssess.message,
          },
          used,
        ),
      };
    }
    categories.push("GSC_OPPORTUNITY_LINKED");
    gscTrust = gscAssess.gscTrust;
  }

  const provenance: Exclude<SidhuEvidenceProvenanceKind, "unavailable"> =
    snapshot.syntheticTest === true ? "synthetic_test" : "server_owned_research";

  return {
    ok: true,
    provenance,
    packInput: snapshot.packInput,
    diagnostic: baseDiagnostic(
      {
        categories,
        lineageState: "LINKED",
        decisionId: ledgerCheck.decision.id,
        runId: ledgerCheck.run.id,
        opportunityIdentity: ledgerCheck.decision.opportunityIdentity,
        opportunityIndex: ledgerCheck.decision.opportunityIndex,
        pipelineSnapshotIncomplete: false,
        firstPartyTrust: fpTrust.firstPartyTrust,
        gscTrust,
        message:
          "Durably linked Ledger evidence snapshot accepted for H3B assessment after A2-9 provenance checks.",
      },
      used,
    ),
  };
}

/**
 * SidhuTrustedEvidenceSourceReader backed by lineage + Ledger + opportunity snapshot.
 */
export function createSidhuAuthoritativeEvidenceReaderLocal(
  deps: SidhuAuthoritativeReadersDeps,
): SidhuTrustedEvidenceSourceReader & {
  lastDiagnostic: SidhuAuthoritativeEvidenceDiagnostic | null;
} {
  const state: { lastDiagnostic: SidhuAuthoritativeEvidenceDiagnostic | null } = {
    lastDiagnostic: null,
  };
  return {
    get lastDiagnostic() {
      return state.lastDiagnostic;
    },
    async readEvidencePackInputForPlanning(args): Promise<SidhuTrustedEvidenceReadResult> {
      const resolved = await resolveAuthoritativeEvidencePackInputForPlanningLocal({
        planningDraftId: args.planningDraftId,
        planning: args.planning,
        deps,
      });
      state.lastDiagnostic = resolved.diagnostic;
      if (!resolved.ok) {
        return {
          ok: false,
          provenance: "unavailable",
          code: resolved.code,
          message: resolved.message,
        };
      }
      return {
        ok: true,
        provenance: resolved.provenance,
        packInput: resolved.packInput,
      };
    },
  };
}
