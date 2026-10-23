/**
 * Production-capable CMS Apply dependency injection.
 *
 * Replaces the hard-wired unavailable stub as the single resolution path while
 * remaining fail-closed until:
 *   1) emergency kill / master apply writers OFF (default)
 *   2) A2 durable schema registered with ensure (currently false)
 *   3) physical tables present (migration executed under Berlin authority)
 *   4) a DurableMysqlTxnFacade factory is explicitly installed (default: none)
 *
 * Never opens a pool itself. Never registers DDL. Never flips the compile-time
 * Apply production wiring constant.
 */

import {
  createDurableCmsApplyUnavailableDeps,
  type CmsApplyTransactionRunner,
  type CmsTrustedApprovalStore,
  type CmsTrustedPreviewStore,
} from "@/lib/cms/seo-planning/article-cms-apply-adapter";
import {
  A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
} from "@/lib/cms/seo-planning/article-apply-durable-schema";
import {
  createInactiveMysqlCmsApplyDeps,
  type DurableMysqlTxnFacade,
} from "@/lib/cms/seo-planning/article-apply-durable-mysql";
import { evaluateA2ApplyDurableSchemaReadiness } from "@/lib/cms/seo-planning/article-apply-schema-readiness";
import { assertSeoAutomationPathAllowed } from "@/lib/cms/seo-automation/master-control";

export const SEO_AI_ARTICLE_APPLY_PRODUCTION_DI_SPEC = "a2-apply-production-di-v1" as const;

export type CmsApplyProductionDiResolution =
  | {
      ok: false;
      spec: typeof SEO_AI_ARTICLE_APPLY_PRODUCTION_DI_SPEC;
      mode: "unavailable";
      reason: string;
      previewStore: CmsTrustedPreviewStore;
      approvalStore: CmsTrustedApprovalStore;
      transaction: CmsApplyTransactionRunner;
    }
  | {
      ok: true;
      spec: typeof SEO_AI_ARTICLE_APPLY_PRODUCTION_DI_SPEC;
      mode: "durable_mysql";
      reason: "all_gates_ready";
      previewStore: CmsTrustedPreviewStore;
      approvalStore: CmsTrustedApprovalStore;
      transaction: CmsApplyTransactionRunner;
      physicalSchemaPresent: true;
    };

type FacadeFactory = () => DurableMysqlTxnFacade;

/** Process-local factory slot — unset by default (fail-closed). */
let installedFacadeFactory: FacadeFactory | null = null;

/**
 * TEST / future activation only. Production Server Actions must not call this
 * until schema migration + worker fencing + Berlin authority are verified.
 */
export function __installCmsApplyDurableFacadeFactoryForActivation(
  factory: FacadeFactory | null,
): void {
  installedFacadeFactory = factory;
}

export function __peekCmsApplyDurableFacadeFactoryInstalled(): boolean {
  return installedFacadeFactory != null;
}

export function resolveCmsApplyProductionDeps(args?: {
  physicalSchemaPresent?: boolean;
  trustedEvidencePack?: unknown;
  evidencePackStatus?: unknown;
}): CmsApplyProductionDiResolution {
  const unavailable = (reason: string): CmsApplyProductionDiResolution => {
    const deps = createDurableCmsApplyUnavailableDeps();
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_APPLY_PRODUCTION_DI_SPEC,
      mode: "unavailable",
      reason,
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
    };
  };

  const path = assertSeoAutomationPathAllowed("apply_writers");
  if (!path.ok) {
    return unavailable(path.error);
  }

  const schema = evaluateA2ApplyDurableSchemaReadiness();
  if (!schema.ok || !Boolean(A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE)) {
    return unavailable(
      schema.ok
        ? "A2 durable schema registration flag is false."
        : schema.error,
    );
  }

  if (args?.physicalSchemaPresent !== true) {
    return unavailable(
      "Physical A2 Apply tables not verified present on target database.",
    );
  }

  if (!installedFacadeFactory) {
    return unavailable(
      "DurableMysqlTxnFacade factory is not installed. Apply writers remain fail-closed.",
    );
  }

  const facade = installedFacadeFactory();
  const wired = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: args?.trustedEvidencePack,
    evidencePackStatus: args?.evidencePackStatus,
  });

  return {
    ok: true,
    spec: SEO_AI_ARTICLE_APPLY_PRODUCTION_DI_SPEC,
    mode: "durable_mysql",
    reason: "all_gates_ready",
    previewStore: wired.previewStore,
    approvalStore: wired.approvalStore,
    transaction: wired.transaction,
    physicalSchemaPresent: true,
  };
}
