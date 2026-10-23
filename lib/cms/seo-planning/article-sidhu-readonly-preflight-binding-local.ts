/**
 * A2-8/A2-9 — LOCAL-ONLY composition binding authoritative readers to A2-7 Sidhu preflight.
 *
 * Supplies injected Planning/Ledger/lineage/evidence readers to
 * `evaluateSidhuArticleApplyPreflightLocal` without creating a Server Action,
 * Apply route, or production authorization path.
 *
 * A2-9/A2-10: readers enforce reused first-party verifier results and exact GSC
 * opportunity evidence-record provenance before H3B assessment.
 *
 * Successful H3B drafting-review READY never authorizes Apply execution.
 */

import {
  createSidhuAuthoritativeEvidenceReaderLocal,
  type SidhuAuthoritativeEvidenceDiagnostic,
  type SidhuAuthoritativeReadersDeps,
  type SidhuLedgerRunDetailReader,
  type SidhuOpportunityEvidenceSnapshotReader,
  SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC,
} from "@/lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import type { FirstPartyVerifyCatalog } from "@/lib/cms/seo-autonomy/first-party-site-fact-verify";
import {
  evaluateSidhuArticleApplyPreflightLocal,
  type SidhuApplyPreflightDeps,
  type SidhuApplyPreflightInput,
  type SidhuApplyPreflightResult,
  SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
} from "@/lib/cms/seo-planning/article-sidhu-apply-preflight-local";
import type {
  SidhuAuthoritativePlanningCatalog,
} from "@/lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import type { PlanningLineageStore } from "@/lib/cms/seo-planning-lineage/repository";
import type { BlogPost } from "@/lib/cms/types";
import type { CmsWriteFreezeEnv } from "@/lib/cms/write-freeze";

export const SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC =
  "a2-10-sidhu-readonly-preflight-binding-local-v1" as const;

export type SidhuReadonlyPreflightBindingDeps = {
  resolveSession: SidhuApplyPreflightDeps["resolveSession"];
  catalog: SidhuAuthoritativePlanningCatalog;
  lineageStore: PlanningLineageStore;
  ledgerDetail: SidhuLedgerRunDetailReader;
  opportunityEvidence: SidhuOpportunityEvidenceSnapshotReader;
  /** Injected read-only CMS boundary for the reused first-party verifier. */
  firstPartyCatalog?: FirstPartyVerifyCatalog;
  writeFreezeEnv?: CmsWriteFreezeEnv;
  listExistingPosts?: () => Promise<readonly BlogPost[]>;
};

export type SidhuReadonlyPreflightBindingResult = SidhuApplyPreflightResult & {
  bindingSpec: typeof SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC;
  readersSpec: typeof SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC;
  preflightSpec: typeof SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC;
  /** Always false — binding never returns Apply authorization. */
  executionAuthorized: false;
  evidenceDiagnostic: SidhuAuthoritativeEvidenceDiagnostic | null;
};

/**
 * Build A2-7 preflight deps with the authoritative evidence reader composition.
 */
export function buildSidhuReadonlyPreflightDepsLocal(
  deps: SidhuReadonlyPreflightBindingDeps,
): {
  preflightDeps: SidhuApplyPreflightDeps;
  evidenceReader: ReturnType<typeof createSidhuAuthoritativeEvidenceReaderLocal>;
  readersDeps: SidhuAuthoritativeReadersDeps;
} {
  const readersDeps: SidhuAuthoritativeReadersDeps = {
    lineageStore: deps.lineageStore,
    ledgerDetail: deps.ledgerDetail,
    opportunityEvidence: deps.opportunityEvidence,
    firstPartyCatalog: deps.firstPartyCatalog,
  };
  const evidenceReader = createSidhuAuthoritativeEvidenceReaderLocal(readersDeps);
  return {
    readersDeps,
    evidenceReader,
    preflightDeps: {
      resolveSession: deps.resolveSession,
      catalog: deps.catalog,
      evidenceReader,
      writeFreezeEnv: deps.writeFreezeEnv,
      listExistingPosts: deps.listExistingPosts,
    },
  };
}

/**
 * Local read-only preflight: authoritative readers → A2-7 engine.
 * Never mutates CMS/Blog/Ledger. Never sets executionAuthorized true.
 */
export async function evaluateSidhuArticleApplyReadonlyPreflightLocal(
  input: SidhuApplyPreflightInput,
  deps: SidhuReadonlyPreflightBindingDeps,
): Promise<SidhuReadonlyPreflightBindingResult> {
  const { preflightDeps, evidenceReader } = buildSidhuReadonlyPreflightDepsLocal(deps);
  const result = await evaluateSidhuArticleApplyPreflightLocal(input, preflightDeps);

  // Hard guarantee: binding cannot surface Apply authorization even if upstream changes.
  if ((result as { executionAuthorized?: unknown }).executionAuthorized === true) {
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
      code: "feature_disabled",
      error:
        "Readonly preflight binding rejected an unexpected executionAuthorized=true result.",
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
      readersSpec: SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC,
      preflightSpec: SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
      evidenceDiagnostic: evidenceReader.lastDiagnostic,
    };
  }

  return {
    ...result,
    executionAuthorized: false,
    bindingSpec: SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC,
    readersSpec: SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC,
    preflightSpec: SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
    evidenceDiagnostic: evidenceReader.lastDiagnostic,
  };
}
