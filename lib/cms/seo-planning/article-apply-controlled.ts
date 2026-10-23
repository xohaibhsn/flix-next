/**
 * Controlled Sidhu NEW_BLOG Article Apply orchestration.
 *
 * Connects authenticated Sidhu callers to the existing A2 foundation:
 * production gate → durable schema readiness → CMS adapter (fail-closed until
 * durable stores exist).
 *
 * Does NOT:
 * - flip SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED
 * - register DDL / run migrations
 * - trust client approved=true / applyEnabled flags
 * - overwrite published Blog content (enforced by readiness/adapter)
 * - treat REFRESH / RESTORE / HOLD as NEW_BLOG
 */

import {
  applyPrivateArticleViaCmsAdapterUntilDurableReady,
  type CmsApplyAdapterResult,
} from "@/lib/cms/seo-planning/article-cms-apply-adapter";
import {
  evaluateArticleApplyProductionGate,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_DISABLED_MESSAGE,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC,
  type ArticleApplyProductionGateResult,
} from "@/lib/cms/seo-planning/article-apply-production-gate";
import {
  A2_APPLY_SCHEMA_NOT_READY_CODE,
  A2_APPLY_SCHEMA_NOT_READY_MESSAGE,
  A2_APPLY_SCHEMA_READINESS_SPEC,
  evaluateA2ApplyDurableSchemaReadiness,
  type A2ApplySchemaReadinessResult,
} from "@/lib/cms/seo-planning/article-apply-schema-readiness";
import type { TrustedPrivateApplyActor } from "@/lib/cms/seo-planning/article-private-apply-local";
import type { TrustedArticleEvidencePackAssessment } from "@/lib/cms/seo-planning/article-evidence-pack-adapter";
import { CMS_WRITE_FREEZE_CODE } from "@/lib/cms/write-freeze";

export const SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC = "a2-controlled-sidhu-apply-v1" as const;

/**
 * Explicit bounded execution acknowledgement required in the request body when
 * (and only when) production wiring is later authorized. Not a feature flag —
 * must match exactly; client synonyms are ignored/rejected.
 */
export const SEO_AI_ARTICLE_APPLY_BOUNDED_EXECUTION_ACK =
  "sidhu-supervised-new-blog-apply-v1" as const;

export const SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES = {
  invalidInput: "Planning draft id, preview session id, and approval receipt id are required.",
  clientApprovalRejected:
    "Client approved=true is not authoritative. Use a server-issued approval receipt.",
  refreshRejected: "REFRESH targets cannot enter the supervised NEW_BLOG Apply path.",
  restoreRejected: "RESTORE_HISTORICAL plans cannot enter the supervised NEW_BLOG Apply path.",
  holdRejected: "Editorial HOLD cannot authorize supervised NEW_BLOG Apply.",
  skipRejected: "SKIP recommendations cannot enter the supervised NEW_BLOG Apply path.",
  missingExecutionAck:
    "Explicit supervised Apply execution acknowledgement is required when production wiring is enabled.",
  unauthorized: "A trusted admin actor with SEO and Blog permissions is required.",
} as const;

export type ControlledArticleApplyErrorCode =
  | typeof SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE
  | typeof A2_APPLY_SCHEMA_NOT_READY_CODE
  | typeof CMS_WRITE_FREEZE_CODE
  | "unauthorized"
  | "access_denied"
  | "invalid_input"
  | "client_approval_rejected"
  | "refresh_target_blocked"
  | "restore_blocked"
  | "editorial_hold"
  | "skip_blocked"
  | "missing_execution_ack"
  | "PREVIEW_PROVENANCE_UNAVAILABLE"
  | "missing_approval"
  | "forged_approval"
  | "stale_approval"
  | "evidence_pack_unavailable"
  | "evidence_pack_hold"
  | "untrusted_evidence_pack_claim"
  | "readiness_blocked"
  | "published_blocked"
  | "blog_content_conflict"
  | "duplicate_apply_risk"
  | "transaction_failed"
  | "invalid_preview"
  | "unsafe_html"
  | "not_found"
  | "ineligible"
  | string;

export type ControlledArticleApplyParsedInput = {
  planningDraftId: string;
  previewSessionId: string;
  approvalReceiptId: string;
  /** Untrusted browser preview payload — never sole authority. */
  clientPreview: unknown;
  executionAcknowledgement: string | null;
};

export type ControlledArticleApplyFailure = {
  ok: false;
  spec: typeof SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC;
  code: ControlledArticleApplyErrorCode;
  error: string;
  publicationReady: false;
  realCmsWrite: false;
  committed: false;
  productionWiring: ArticleApplyProductionGateResult;
  schemaReadiness: A2ApplySchemaReadinessResult | null;
  adapter: CmsApplyAdapterResult | null;
};

export type ControlledArticleApplySuccess = {
  ok: true;
  spec: typeof SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC;
  publicationReady: false;
  realCmsWrite: false;
  committed: true;
  productionWiring: Extract<ArticleApplyProductionGateResult, { ok: true }>;
  schemaReadiness: Extract<A2ApplySchemaReadinessResult, { ok: true }>;
  adapter: Extract<CmsApplyAdapterResult, { ok: true }>;
};

export type ControlledArticleApplyResult =
  | ControlledArticleApplySuccess
  | ControlledArticleApplyFailure;

function fail(
  code: ControlledArticleApplyErrorCode,
  error: string,
  extras?: {
    productionWiring?: ArticleApplyProductionGateResult;
    schemaReadiness?: A2ApplySchemaReadinessResult | null;
    adapter?: CmsApplyAdapterResult | null;
  },
): ControlledArticleApplyFailure {
  return {
    ok: false,
    spec: SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC,
    code,
    error: String(error || "").slice(0, 240),
    publicationReady: false,
    realCmsWrite: false,
    committed: false,
    productionWiring:
      extras?.productionWiring ??
      ({
        ok: false,
        spec: SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC,
        code: SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE,
        error: SEO_AI_ARTICLE_APPLY_PRODUCTION_DISABLED_MESSAGE,
        envOverrideIgnored: true,
      } satisfies ArticleApplyProductionGateResult),
    schemaReadiness: extras?.schemaReadiness ?? null,
    adapter: extras?.adapter ?? null,
  };
}

/**
 * Strip / ignore client capability claims. Never treat them as authorization.
 */
export function ignoreClientSuppliedArticleApplyFlags(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const row = raw as Record<string, unknown>;
  void row.approved;
  void row.approvedByAdminId;
  void row.applyEnabled;
  void row.productionWiring;
  void row.productionApply;
  void row.forceApply;
  void row.skipEvidence;
  void row.skipApproval;
  void row.autonomousEligible;
  void row.automationSelectable;
  void row.publicationReady;
  void row.envFlag;
  void row.__testOnly;
  void row.testInjection;
}

/**
 * Parse Sidhu Apply request. Rejects client approved=true as authority.
 * Recommendation strings on the body are informational only and cannot force NEW_BLOG.
 */
export function parseControlledArticleApplyInput(
  rawInput: unknown,
):
  | { ok: true; value: ControlledArticleApplyParsedInput }
  | { ok: false; code: ControlledArticleApplyErrorCode; error: string } {
  ignoreClientSuppliedArticleApplyFlags(rawInput);

  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return {
      ok: false,
      code: "invalid_input",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.invalidInput,
    };
  }

  const row = rawInput as Record<string, unknown>;

  if (row.approved === true || row.approved === "true" || row.approved === 1) {
    return {
      ok: false,
      code: "client_approval_rejected",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.clientApprovalRejected,
    };
  }

  const claimedRecommendation =
    typeof row.recommendation === "string" ? row.recommendation.trim().toUpperCase() : "";
  if (claimedRecommendation === "REFRESH_EXISTING" || claimedRecommendation === "REFRESH") {
    return {
      ok: false,
      code: "refresh_target_blocked",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.refreshRejected,
    };
  }
  if (claimedRecommendation === "RESTORE_HISTORICAL" || claimedRecommendation === "RESTORE") {
    return {
      ok: false,
      code: "restore_blocked",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.restoreRejected,
    };
  }
  if (claimedRecommendation === "HOLD") {
    return {
      ok: false,
      code: "editorial_hold",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.holdRejected,
    };
  }
  if (claimedRecommendation === "SKIP") {
    return {
      ok: false,
      code: "skip_blocked",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.skipRejected,
    };
  }

  const planningDraftId =
    typeof row.planningDraftId === "string" ? row.planningDraftId.trim() : "";
  const previewSessionId =
    typeof row.previewSessionId === "string" ? row.previewSessionId.trim() : "";
  const approvalReceiptId =
    typeof row.approvalReceiptId === "string" ? row.approvalReceiptId.trim() : "";
  const executionAcknowledgement =
    typeof row.executionAcknowledgement === "string"
      ? row.executionAcknowledgement.trim()
      : typeof row.boundedExecutionAck === "string"
        ? row.boundedExecutionAck.trim()
        : null;

  if (!planningDraftId || !previewSessionId || !approvalReceiptId) {
    return {
      ok: false,
      code: "invalid_input",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.invalidInput,
    };
  }

  return {
    ok: true,
    value: {
      planningDraftId,
      previewSessionId,
      approvalReceiptId,
      clientPreview: row.clientPreview ?? row.preview ?? null,
      executionAcknowledgement,
    },
  };
}

export function assertTrustedApplyActor(
  actor: TrustedPrivateApplyActor | null | undefined,
): { ok: true } | { ok: false; code: "unauthorized" | "access_denied"; error: string } {
  if (!actor || !String(actor.adminId || "").trim()) {
    return {
      ok: false,
      code: "unauthorized",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.unauthorized,
    };
  }
  if (!actor.hasSeoPermission || !actor.hasBlogPermission) {
    return {
      ok: false,
      code: "access_denied",
      error: SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.unauthorized,
    };
  }
  return { ok: true };
}

/**
 * Full controlled Apply entry used by the Sidhu Server Action.
 * Always evaluates the compile-time production gate first (fail-closed).
 */
export async function executeControlledSidhuNewBlogArticleApply(args: {
  actor: TrustedPrivateApplyActor;
  rawInput: unknown;
  editorialHold?: unknown;
  trustedEvidencePack?: TrustedArticleEvidencePackAssessment | unknown;
  evidencePackStatus?: unknown;
  now?: string;
}): Promise<ControlledArticleApplyResult> {
  const actorCheck = assertTrustedApplyActor(args.actor);
  if (!actorCheck.ok) {
    return fail(actorCheck.code, actorCheck.error);
  }

  const parsed = parseControlledArticleApplyInput(args.rawInput);
  if (!parsed.ok) {
    return fail(parsed.code, parsed.error);
  }

  const gate = evaluateArticleApplyProductionGate({
    envFlag:
      args.rawInput && typeof args.rawInput === "object"
        ? (args.rawInput as Record<string, unknown>).applyEnabled
        : undefined,
    bodyFlag: args.rawInput,
    cookieFlag: undefined,
    urlFlag: undefined,
  });

  if (!gate.ok) {
    return fail(gate.code, gate.error, { productionWiring: gate });
  }

  // Gate open path (future activation only): still require explicit acknowledgement.
  if (parsed.value.executionAcknowledgement !== SEO_AI_ARTICLE_APPLY_BOUNDED_EXECUTION_ACK) {
    return fail(
      "missing_execution_ack",
      SEO_AI_ARTICLE_CONTROLLED_APPLY_MESSAGES.missingExecutionAck,
      { productionWiring: gate },
    );
  }

  const schema = evaluateA2ApplyDurableSchemaReadiness();
  if (!schema.ok) {
    return fail(schema.code, schema.error, {
      productionWiring: gate,
      schemaReadiness: schema,
    });
  }

  // Production DI resolves durable MySQL only when master apply writers + schema
  // registration + physical tables + facade factory are authorized; otherwise
  // fail-closed unavailable deps (null provenance / missing txn).
  const adapter = await applyPrivateArticleViaCmsAdapterUntilDurableReady({
    clientPreview: parsed.value.clientPreview,
    previewSessionId: parsed.value.previewSessionId,
    approvalReceiptId: parsed.value.approvalReceiptId,
    actor: args.actor,
    editorialHold: args.editorialHold,
    trustedEvidencePack: args.trustedEvidencePack,
    evidencePackStatus: args.evidencePackStatus as
      | "READY_FOR_DRAFTING_REVIEW"
      | "HOLD"
      | "ABSENT"
      | undefined,
    now: args.now,
  });

  if (!adapter.ok) {
    return fail(adapter.code, adapter.error, {
      productionWiring: gate,
      schemaReadiness: schema,
      adapter,
    });
  }

  return {
    ok: true,
    spec: SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC,
    publicationReady: false,
    realCmsWrite: false,
    committed: true,
    productionWiring: gate,
    schemaReadiness: schema,
    adapter,
  };
}

/** Test helper surface — documents that schema readiness is independent of the gate. */
export function probeControlledApplyBlockersForDiagnostics(): {
  productionGateOpen: boolean;
  schemaRegistered: boolean;
  schemaMessage: string;
} {
  const gate = evaluateArticleApplyProductionGate();
  const schema = evaluateA2ApplyDurableSchemaReadiness();
  return {
    productionGateOpen: gate.ok === true,
    schemaRegistered: schema.ok === true,
    schemaMessage: schema.ok ? "ready" : schema.error || A2_APPLY_SCHEMA_NOT_READY_MESSAGE,
  };
}

export {
  A2_APPLY_SCHEMA_READINESS_SPEC,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC,
};
