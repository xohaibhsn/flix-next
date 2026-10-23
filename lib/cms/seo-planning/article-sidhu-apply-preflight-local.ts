/**
 * A2-7 — LOCAL-ONLY Sidhu Apply preflight orchestrator.
 *
 * Combines trusted session resolution, super-admin pilot RBAC, SEO+Blog
 * permissions, write-freeze, authoritative Planning load, H3B evidence
 * assessment, and existing A2 readiness — WITHOUT executing Blog Apply.
 *
 * Production contract (not wired here):
 *   resolveSession ≡ getAdminSession from lib/auth/session.ts
 *
 * Injected fake sessions prove offline authorization logic only — not live
 * cookie/session acceptance. Client-supplied actor/role/permission flags
 * never authorize. Successful preflight never grants execution while the
 * compile-time production Apply gate remains OFF.
 */

import type { CurrentAdmin } from "@/lib/auth/session";
import { adminHasPermission } from "@/lib/auth/session";
import {
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_MESSAGE,
  isCmsWriteFreezeActive,
  type CmsWriteFreezeEnv,
} from "@/lib/cms/write-freeze";
import {
  evaluateArticleApplyProductionGate,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED,
} from "@/lib/cms/seo-planning/article-apply-production-gate";
import {
  prepareArticleApplyReadiness,
  type ArticleApplyReadinessResult,
} from "@/lib/cms/seo-planning/article-apply-readiness";
import type { TrustedArticleEvidencePackAssessment } from "@/lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  assessTrustedEvidenceFromAuthoritativeReader,
  loadAuthoritativeSeoPlanningForApply,
  type SidhuAuthoritativePlanningCatalog,
  type SidhuTrustedEvidenceSourceReader,
} from "@/lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC = "a2-7-sidhu-apply-preflight-local-v1" as const;

export const SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES = {
  noSession: "A valid Sidhu admin session is required for Apply preflight.",
  inactiveSession: "Inactive or invalid Sidhu admin session cannot authorize Apply preflight.",
  expiredSession: "Expired Sidhu admin session cannot authorize Apply preflight.",
  pilotSuperAdminOnly:
    "Supervised Article Apply pilot is restricted to Super Admin pending a separate RBAC decision.",
  missingSeo: "SEO permission is required for supervised Article Apply preflight.",
  missingBlog: "Blog permission is required for supervised Article Apply preflight.",
  clientSessionOverride:
    "Client-supplied admin identity, role, or permissions cannot override the server session.",
  approvalRequired:
    "Server-owned human factual approval is required before Apply readiness can pass. A client approved=true flag is not sufficient.",
  executionDeniedWhileGateOff:
    "Local preflight cannot authorize operational Apply while production wiring remains disabled.",
} as const;

export type SidhuApplyPreflightErrorCode =
  | "unauthorized"
  | "access_denied"
  | "invalid_input"
  | "planning_not_found"
  | "planning_archived"
  | "protected_fixture"
  | "unsupported_recommendation"
  | "refresh_target_blocked"
  | "restore_blocked"
  | "internal_link_blocked"
  | "skip_blocked"
  | "ineligible"
  | "planning_stale"
  | "stale_planning"
  | "evidence_unavailable"
  | "evidence_read_failure"
  | "evidence_pack_hold"
  | "approval_required"
  | "missing_human_approval"
  | "missing_factual_review"
  | "false_ready_claim"
  | typeof CMS_WRITE_FREEZE_CODE
  | "feature_disabled"
  | "unsafe_html"
  | "invalid_preview"
  | "preview_draft_mismatch"
  | "published_blocked"
  | "blog_content_conflict"
  | "slug_conflict"
  | "duplicate_apply_risk"
  | "linked_post_missing"
  | "not_found"
  | "editorial_hold"
  | "untrusted_evidence_pack_claim"
  | "evidence_pack_unavailable";

export type SidhuApplyPreflightSessionResolver = () => Promise<CurrentAdmin | null>;

export type SidhuApplyPreflightDeps = {
  /** Production: wrap getAdminSession. Tests: inject fake CurrentAdmin | null. */
  resolveSession: SidhuApplyPreflightSessionResolver;
  catalog: SidhuAuthoritativePlanningCatalog;
  evidenceReader: SidhuTrustedEvidenceSourceReader;
  writeFreezeEnv?: CmsWriteFreezeEnv;
  /** Optional existing posts for slug/duplicate readiness checks. */
  listExistingPosts?: () => Promise<readonly BlogPost[]>;
};

export type SidhuApplyPreflightInput = {
  planningDraftId: unknown;
  /** Untrusted A1 preview shape for readiness comparison. */
  clientPreview?: unknown;
  /** Client expected Planning.updatedAt — enables stale snapshot rejection. */
  expectedPlanningUpdatedAt?: unknown;
  /**
   * Client-claimed actor / role / permissions. Never authoritative.
   * Presence of conflicting claims fails closed as session override attempt.
   */
  clientClaimedActor?: unknown;
  /**
   * Server-owned approval attestation for readiness (injected in tests / future
   * receipt store). Client `approved=true` alone is never accepted.
   */
  serverHumanApproval?: {
    factualReviewConfirmed: true;
    approvedByAdminId: string;
  } | null;
  /**
   * When true, also require production Apply wiring ON — currently always fails
   * closed with feature_disabled while the compile-time gate remains false.
   */
  requestExecutionAuthorization?: boolean;
  editorialHold?: unknown;
};

export type SidhuApplyPreflightSuccess = {
  ok: true;
  spec: typeof SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC;
  /** Always false while production wiring is OFF — preflight ≠ Apply authorization. */
  executionAuthorized: false;
  productionWiringEnabled: false;
  sessionAdminId: string;
  sessionRole: CurrentAdmin["role"];
  planningDraftId: string;
  planningUpdatedAt: string;
  evidenceProvenance: "server_owned_research" | "synthetic_test";
  trustedEvidencePack: TrustedArticleEvidencePackAssessment;
  readiness: ArticleApplyReadinessResult;
  planning: SeoPlanningDraft;
  linkedPost: BlogPost | null;
  blogMutationPerformed: false;
  planningMutationPerformed: false;
  durableApplyInvoked: false;
  providerRequests: 0;
};

export type SidhuApplyPreflightFailure = {
  ok: false;
  spec: typeof SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC;
  code: SidhuApplyPreflightErrorCode;
  error: string;
  executionAuthorized: false;
  productionWiringEnabled: false;
  blogMutationPerformed: false;
  planningMutationPerformed: false;
  durableApplyInvoked: false;
  providerRequests: 0;
  readiness: ArticleApplyReadinessResult | null;
  trustedEvidencePack: TrustedArticleEvidencePackAssessment | null;
  sessionAdminId: string | null;
};

export type SidhuApplyPreflightResult = SidhuApplyPreflightSuccess | SidhuApplyPreflightFailure;

function fail(
  code: SidhuApplyPreflightErrorCode,
  error: string,
  partial?: Partial<
    Pick<
      SidhuApplyPreflightFailure,
      "readiness" | "trustedEvidencePack" | "sessionAdminId"
    >
  >,
): SidhuApplyPreflightFailure {
  return {
    ok: false,
    spec: SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
    code,
    error,
    executionAuthorized: false,
    productionWiringEnabled: false,
    blogMutationPerformed: false,
    planningMutationPerformed: false,
    durableApplyInvoked: false,
    providerRequests: 0,
    readiness: partial?.readiness ?? null,
    trustedEvidencePack: partial?.trustedEvidencePack ?? null,
    sessionAdminId: partial?.sessionAdminId ?? null,
  };
}

function clientOverrideAttempt(clientClaimedActor: unknown, session: CurrentAdmin): boolean {
  if (clientClaimedActor == null) return false;
  if (typeof clientClaimedActor !== "object" || Array.isArray(clientClaimedActor)) return true;
  const row = clientClaimedActor as Record<string, unknown>;
  const claimedId = typeof row.adminId === "string" ? row.adminId.trim() : typeof row.id === "string" ? row.id.trim() : "";
  const claimedRole = typeof row.role === "string" ? row.role.trim() : "";
  const claimedIsAdmin = row.isAdmin === true || row.approved === true;
  if (claimedIsAdmin) return true;
  if (claimedId && claimedId !== session.id) return true;
  if (claimedRole && claimedRole !== session.role) return true;
  if (Array.isArray(row.permissions) || Array.isArray(row.effectivePermissions)) return true;
  // Empty object / non-claiming shape still treated as override attempt when provided.
  return Object.keys(row).length > 0;
}

function mapReadinessCode(code: string): SidhuApplyPreflightErrorCode {
  if (code === "stale_planning") return "planning_stale";
  return code as SidhuApplyPreflightErrorCode;
}

/**
 * Local Sidhu Apply preflight — session + Planning + evidence + A2 readiness.
 * Never invokes Blog/Planning writes or durable Apply adapters.
 */
export async function evaluateSidhuArticleApplyPreflightLocal(
  input: SidhuApplyPreflightInput,
  deps: SidhuApplyPreflightDeps,
): Promise<SidhuApplyPreflightResult> {
  void SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED;

  if (isCmsWriteFreezeActive(deps.writeFreezeEnv ?? process.env)) {
    return fail(CMS_WRITE_FREEZE_CODE, CMS_WRITE_FREEZE_MESSAGE);
  }

  const session = await deps.resolveSession();
  if (!session) {
    return fail("unauthorized", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.noSession);
  }
  if (!session.active) {
    return fail("unauthorized", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.inactiveSession, {
      sessionAdminId: session.id,
    });
  }
  if (typeof session.expiresAt === "number" && session.expiresAt <= Date.now()) {
    return fail("unauthorized", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.expiredSession, {
      sessionAdminId: session.id,
    });
  }

  if (clientOverrideAttempt(input.clientClaimedActor, session)) {
    return fail("unauthorized", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.clientSessionOverride, {
      sessionAdminId: session.id,
    });
  }

  if (session.role !== "super_admin") {
    return fail("access_denied", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.pilotSuperAdminOnly, {
      sessionAdminId: session.id,
    });
  }

  if (!adminHasPermission(session, "seo")) {
    return fail("access_denied", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.missingSeo, {
      sessionAdminId: session.id,
    });
  }
  if (!adminHasPermission(session, "blog")) {
    return fail("access_denied", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.missingBlog, {
      sessionAdminId: session.id,
    });
  }

  const loaded = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: input.planningDraftId,
    catalog: deps.catalog,
  });
  if (!loaded.ok) {
    return fail(loaded.code, loaded.error, { sessionAdminId: session.id });
  }

  const expectedUpdatedAt =
    typeof input.expectedPlanningUpdatedAt === "string"
      ? input.expectedPlanningUpdatedAt.trim()
      : "";
  if (expectedUpdatedAt && expectedUpdatedAt !== loaded.planning.updatedAt) {
    return fail("planning_stale", "Planning snapshot is stale relative to the authoritative catalog.", {
      sessionAdminId: session.id,
    });
  }

  const evidence = await assessTrustedEvidenceFromAuthoritativeReader({
    planning: loaded.planning,
    evidenceReader: deps.evidenceReader,
  });
  if (!evidence.ok) {
    return fail(evidence.code, evidence.error, {
      sessionAdminId: session.id,
      trustedEvidencePack: evidence.trustedEvidencePack,
    });
  }

  const approval = input.serverHumanApproval;
  if (
    !approval ||
    approval.factualReviewConfirmed !== true ||
    String(approval.approvedByAdminId || "").trim() !== session.id
  ) {
    return fail("approval_required", SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.approvalRequired, {
      sessionAdminId: session.id,
      trustedEvidencePack: evidence.trustedEvidencePack,
    });
  }

  const existingPosts = deps.listExistingPosts ? await deps.listExistingPosts() : [];
  const readiness = prepareArticleApplyReadiness({
    preview: input.clientPreview,
    planningDraft: loaded.planning,
    linkedPost: loaded.linkedPost,
    existingPosts,
    trustedEvidencePack: evidence.trustedEvidencePack,
    editorialHold: input.editorialHold,
    humanApproval: {
      factualReviewConfirmed: true,
      approvedByAdminId: session.id,
      clientApprovedFlag: false,
      claimPublicationReady: false,
      claimEvidencePackComplete: false,
      claimEvidenceVerified: false,
    },
  });

  if (!readiness.ok) {
    const primary = readiness.blockingReasons[0];
    return fail(
      mapReadinessCode(primary?.code || "ineligible"),
      primary?.message || "A2 Apply readiness blocked Sidhu preflight.",
      {
        sessionAdminId: session.id,
        trustedEvidencePack: evidence.trustedEvidencePack,
        readiness,
      },
    );
  }

  if (input.requestExecutionAuthorization === true) {
    const gate = evaluateArticleApplyProductionGate();
    if (!gate.ok) {
      return fail(
        "feature_disabled",
        SEO_AI_ARTICLE_SIDHU_PREFLIGHT_MESSAGES.executionDeniedWhileGateOff,
        {
          sessionAdminId: session.id,
          trustedEvidencePack: evidence.trustedEvidencePack,
          readiness,
        },
      );
    }
  }

  return {
    ok: true,
    spec: SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
    executionAuthorized: false,
    productionWiringEnabled: false,
    sessionAdminId: session.id,
    sessionRole: session.role,
    planningDraftId: loaded.planning.id,
    planningUpdatedAt: loaded.planning.updatedAt,
    evidenceProvenance: evidence.provenance,
    trustedEvidencePack: evidence.trustedEvidencePack,
    readiness,
    planning: loaded.planning,
    linkedPost: loaded.linkedPost,
    blogMutationPerformed: false,
    planningMutationPerformed: false,
    durableApplyInvoked: false,
    providerRequests: 0,
  };
}

/**
 * Documented production session resolver binding — not invoked by default.
 * Call sites that later wire Sidhu must pass this (or equivalent) into deps.
 */
export async function resolveSidhuSessionViaGetAdminSession(): Promise<CurrentAdmin | null> {
  const { getAdminSession } = await import("@/lib/auth/session");
  return getAdminSession();
}
