/**
 * A2-12 — LOCAL-ONLY provenance DI composition for A2-10 readonly Sidhu preflight.
 *
 * Wires injected Planning/Blog/Ledger/lineage/opportunity-evidence/first-party
 * readers into `evaluateSidhuArticleApplyReadonlyPreflightLocal` without:
 *   - Server Actions / routes / UI
 *   - ambient cms / MySQL pool / GSC / AI clients
 *   - durable Apply / Blog writes
 *   - production Apply authorization
 *
 * Reuses existing `resolvePlanningDecisionLineage` inside A2-10 readers.
 * Does not implement a second lineage resolver or trust model.
 *
 * `executionAuthorized` is always false.
 */

import type { CurrentAdmin } from "@/lib/auth/session";
import type { PlanningLineageStore } from "@/lib/cms/seo-planning-lineage/repository";
import {
  createFirstPartyVerifyCatalogFromInjected,
  createSidhuAuthoritativePlanningCatalogFromInjected,
  createSidhuLedgerRunDetailReaderFromInjected,
  SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC,
  type SidhuInjectedFirstPartyBlogReaders,
  type SidhuInjectedLedgerRunDetailFn,
  type SidhuInjectedPlanningBlogExactReaders,
} from "@/lib/cms/seo-planning/article-sidhu-catalog-ledger-di-local";
import type {
  SidhuGscOpportunityProvenance,
  SidhuOpportunityEvidenceSnapshot,
  SidhuOpportunityEvidenceSnapshotReader,
} from "@/lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import type {
  SidhuApplyPreflightInput,
} from "@/lib/cms/seo-planning/article-sidhu-apply-preflight-local";
import {
  evaluateSidhuArticleApplyReadonlyPreflightLocal,
  SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC,
  type SidhuReadonlyPreflightBindingDeps,
  type SidhuReadonlyPreflightBindingResult,
} from "@/lib/cms/seo-planning/article-sidhu-readonly-preflight-binding-local";
import type { BlogPost } from "@/lib/cms/types";
import type { CmsWriteFreezeEnv } from "@/lib/cms/write-freeze";

export const SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC =
  "a2-12-sidhu-provenance-di-local-v1" as const;

/** Already-retrieved, opportunity-scoped materials — never fabricated by this module. */
export type SidhuStoredOpportunityEvidenceMaterials = {
  planningDraftId: string;
  decisionId: string;
  runId: string;
  opportunityIdentity: string;
  opportunityIndex: number;
  snapshot: SidhuOpportunityEvidenceSnapshot;
};

export type SidhuOpportunityEvidenceMaterialsLoadResult =
  | { ok: true; materials: SidhuStoredOpportunityEvidenceMaterials }
  | {
      ok: false;
      code: "missing" | "timeout" | "error" | "identity_mismatch";
      message: string;
    };

/**
 * Bounded loader: at most one call per validated decision identity from A2-10.
 * Must return already-stored materials; must not call GSC/AI/network.
 */
export type SidhuOpportunityEvidenceMaterialsLoader = (args: {
  planningDraftId: string;
  decisionId: string;
  runId: string;
  opportunityIdentity: string;
  opportunityIndex: number;
}) => Promise<SidhuOpportunityEvidenceMaterialsLoadResult>;

export type SidhuLiveReadonlyDiDeps = {
  /** Production: wrap getAdminSession. Tests: inject synthetic CurrentAdmin | null. */
  resolveSession: () => Promise<CurrentAdmin | null>;
  planningBlogReaders: SidhuInjectedPlanningBlogExactReaders;
  /** Required when packInput contains site_fact grounded evidence. */
  firstPartyBlogReaders?: SidhuInjectedFirstPartyBlogReaders;
  /** Injected L4B store — schema-unavailable must fail closed via existing resolver. */
  lineageStore: PlanningLineageStore;
  getLedgerRunDetail: SidhuInjectedLedgerRunDetailFn;
  loadOpportunityEvidence: SidhuOpportunityEvidenceMaterialsLoader;
  writeFreezeEnv?: CmsWriteFreezeEnv;
  listExistingPosts?: () => Promise<readonly BlogPost[]>;
};

export type SidhuReadonlyPreflightViaDiResult = SidhuReadonlyPreflightBindingResult & {
  diCatalogLedgerSpec: typeof SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC;
  diProvenanceSpec: typeof SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC;
  /** Always false — DI composition never authorizes Apply. */
  executionAuthorized: false;
};

function sanitizeEvidenceMessage(message: unknown): string {
  const raw = typeof message === "string" ? message.trim() : "";
  if (!raw) return "Opportunity evidence materials unavailable.";
  if (/password|passwd|secret|token|mysql:|errno|sqlstate|econn|access denied/i.test(raw)) {
    return "Opportunity evidence reader failed closed.";
  }
  return raw.slice(0, 240);
}

function identitiesMatch(
  left: {
    planningDraftId: string;
    decisionId: string;
    runId: string;
    opportunityIdentity: string;
    opportunityIndex: number;
  },
  right: {
    planningDraftId: string;
    decisionId: string;
    runId: string;
    opportunityIdentity: string;
    opportunityIndex: number;
  },
): boolean {
  return (
    left.planningDraftId === right.planningDraftId &&
    left.decisionId === right.decisionId &&
    left.runId === right.runId &&
    left.opportunityIdentity === right.opportunityIdentity &&
    left.opportunityIndex === right.opportunityIndex
  );
}

/**
 * Fail-closed checks for opportunity-owned GSC provenance already attached to a snapshot.
 * Does not call GSC APIs. Does not invent missing evidence refs.
 */
export function validateStoredGscOpportunityProvenanceLocal(
  provenance: SidhuGscOpportunityProvenance,
  expected: {
    decisionId: string;
    runId: string;
    opportunityIdentity: string;
    opportunityIndex: number;
  },
): { ok: true } | { ok: false; code: "identity_mismatch"; message: string } {
  if (
    provenance.runId !== expected.runId ||
    provenance.decisionId !== expected.decisionId ||
    provenance.opportunityIdentity !== expected.opportunityIdentity ||
    provenance.opportunityIndex !== expected.opportunityIndex
  ) {
    return {
      ok: false,
      code: "identity_mismatch",
      message: "GSC opportunity provenance identity disagrees with validated decision.",
    };
  }

  if (provenance.pack.country?.code !== "GB") {
    return {
      ok: false,
      code: "identity_mismatch",
      message: "GSC pack country scope must be GB for UK opportunity evidence.",
    };
  }

  const owned = new Set(provenance.opportunityGscEvidenceIds);
  if (owned.size === 0 || provenance.evidenceRefs.length === 0) {
    return {
      ok: false,
      code: "identity_mismatch",
      message:
        "Run-level GSC availability without opportunity-owned evidence references is not provenance.",
    };
  }

  for (const ref of provenance.evidenceRefs) {
    if (ref.kind !== "query_page") {
      return {
        ok: false,
        code: "identity_mismatch",
        message: "Opportunity GSC evidence must use query_page records.",
      };
    }
    if (!owned.has(ref.id)) {
      return {
        ok: false,
        code: "identity_mismatch",
        message: "GSC evidence reference is not opportunity-owned.",
      };
    }
    if (!ref.query.trim() || !ref.pageUrl.trim()) {
      return {
        ok: false,
        code: "identity_mismatch",
        message: "GSC query_page evidence is missing query or page identity.",
      };
    }
  }

  for (const id of provenance.opportunityGscEvidenceIds) {
    if (!provenance.evidenceRefs.some((ref) => ref.id === id)) {
      return {
        ok: false,
        code: "identity_mismatch",
        message: "Opportunity GSC evidence id lacks a matching query_page reference.",
      };
    }
  }

  return { ok: true };
}

/**
 * Build A2-10 opportunity evidence snapshot reader from an injected materials loader.
 * Validates decision/opportunity identity and owned GSC refs before returning the snapshot.
 */
export function createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader(
  loader: SidhuOpportunityEvidenceMaterialsLoader,
): SidhuOpportunityEvidenceSnapshotReader & { readonly callCount: number } {
  const state = { callCount: 0 };
  return {
    get callCount() {
      return state.callCount;
    },
    async readForValidatedDecision(args) {
      state.callCount += 1;
      let loaded: SidhuOpportunityEvidenceMaterialsLoadResult;
      try {
        loaded = await loader(args);
      } catch {
        return {
          ok: false,
          code: "error",
          message: "Opportunity evidence loader failed closed.",
        };
      }

      if (!loaded.ok) {
        return {
          ok: false,
          code: loaded.code,
          message: sanitizeEvidenceMessage(loaded.message),
        };
      }

      const materials = loaded.materials;
      if (!identitiesMatch(materials, args)) {
        return {
          ok: false,
          code: "identity_mismatch",
          message: "Stored opportunity evidence materials disagree with validated decision identity.",
        };
      }

      const packIdentity = materials.snapshot.packInput?.opportunityIdentity;
      const packIndex = materials.snapshot.packInput?.opportunityIndex;
      if (
        packIdentity !== args.opportunityIdentity ||
        packIndex !== args.opportunityIndex
      ) {
        return {
          ok: false,
          code: "identity_mismatch",
          message: "Evidence pack opportunity identity disagrees with validated decision.",
        };
      }

      const gsc = materials.snapshot.gscOpportunityProvenance;
      if (gsc) {
        const gscCheck = validateStoredGscOpportunityProvenanceLocal(gsc, args);
        if (!gscCheck.ok) {
          return {
            ok: false,
            code: gscCheck.code,
            message: gscCheck.message,
          };
        }
      } else if (materials.snapshot.gscLinkage === "opportunity_linked") {
        return {
          ok: false,
          code: "identity_mismatch",
          message:
            "Legacy opportunity_linked hint without gscOpportunityProvenance is not accepted.",
        };
      }

      // Client/editorial verified blobs never become trusted here — A2-10 still evaluates.
      return { ok: true, snapshot: materials.snapshot };
    },
  };
}

/**
 * Compose injected live DI deps into A2-10 `SidhuReadonlyPreflightBindingDeps`.
 */
export function buildSidhuReadonlyPreflightBindingDepsFromDi(
  deps: SidhuLiveReadonlyDiDeps,
): SidhuReadonlyPreflightBindingDeps {
  return {
    resolveSession: deps.resolveSession,
    catalog: createSidhuAuthoritativePlanningCatalogFromInjected(deps.planningBlogReaders),
    lineageStore: deps.lineageStore,
    ledgerDetail: createSidhuLedgerRunDetailReaderFromInjected(deps.getLedgerRunDetail),
    opportunityEvidence: createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader(
      deps.loadOpportunityEvidence,
    ),
    firstPartyCatalog: deps.firstPartyBlogReaders
      ? createFirstPartyVerifyCatalogFromInjected(deps.firstPartyBlogReaders)
      : undefined,
    writeFreezeEnv: deps.writeFreezeEnv,
    listExistingPosts: deps.listExistingPosts,
  };
}

/**
 * Local read-only preflight via A2-12 DI → A2-10 binding → A2-7 engine.
 * Never mutates CMS/Blog/Ledger. Never sets executionAuthorized true.
 */
export async function evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
  input: SidhuApplyPreflightInput,
  deps: SidhuLiveReadonlyDiDeps,
): Promise<SidhuReadonlyPreflightViaDiResult> {
  const bindingDeps = buildSidhuReadonlyPreflightBindingDepsFromDi(deps);
  const result = await evaluateSidhuArticleApplyReadonlyPreflightLocal(input, bindingDeps);

  if ((result as { executionAuthorized?: unknown }).executionAuthorized === true) {
    return {
      ok: false,
      spec: result.spec,
      code: "feature_disabled",
      error:
        "A2-12 DI composition rejected an unexpected executionAuthorized=true result.",
      executionAuthorized: false,
      productionWiringEnabled: false,
      blogMutationPerformed: false,
      planningMutationPerformed: false,
      durableApplyInvoked: false,
      providerRequests: 0,
      readiness: null,
      trustedEvidencePack: null,
      sessionAdminId: null,
      bindingSpec: SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC,
      readersSpec: result.readersSpec,
      preflightSpec: result.preflightSpec,
      evidenceDiagnostic: result.evidenceDiagnostic,
      diCatalogLedgerSpec: SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC,
      diProvenanceSpec: SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC,
    };
  }

  return {
    ...result,
    executionAuthorized: false,
    diCatalogLedgerSpec: SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC,
    diProvenanceSpec: SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC,
  };
}
