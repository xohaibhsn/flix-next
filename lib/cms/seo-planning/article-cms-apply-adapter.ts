/**
 * A2 CMS Private Apply adapter — production-shaped, INACTIVE transactional boundary.
 *
 * Mirrors MySQL handoff / A2 WIP Apply lock order:
 *   Planning FOR UPDATE → Blog FOR UPDATE (when linked) → conditional writes → audit → commit
 *
 * Compatible with an injected transaction runner that can later wrap `withTransaction(conn)`.
 * This module is NOT registered on live CmsCatalog, mysql-catalog, json-catalog, or Server Actions.
 *
 * Does NOT:
 * - open a real DB pool / execute SQL
 * - call the generic CMS post upsert path
 * - preflight-handoff an empty shell outside the Apply transaction
 * - invent durable provenance/approval schema
 *
 * Fail-closed without trusted server-side provenance + approval resolution.
 * Offline tests inject fake txn ops + in-memory trust stores only.
 */

import { emptyPost } from "@/lib/cms/blog";
import { createId } from "@/lib/cms/ids";
import { sanitizePost } from "@/lib/cms/validation";
import { normalizeGeneratedArticle } from "@/lib/cms/ai-seo/blog-article-openai";
import {
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_MESSAGE,
  isCmsWriteFreezeActive,
  type CmsWriteFreezeEnv,
} from "@/lib/cms/write-freeze";
import {
  prepareArticleApplyReadiness,
  SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES,
  type ArticleApplyReadinessBlockCode,
  type ArticleApplyReadinessResult,
} from "@/lib/cms/seo-planning/article-apply-readiness";
import {
  isTrustedArticleEvidencePackAssessment,
  type TrustedArticleEvidencePackAssessment,
} from "@/lib/cms/seo-planning/article-evidence-pack-adapter";
import { parsePrivateArticlePreview } from "@/lib/cms/seo-planning/article-generation";
import {
  fingerprintPrivateApplyContent,
  type TrustedPreviewProvenance,
  type TrustedPrivateApplyActor,
  type TrustedPrivateApplyApproval,
} from "@/lib/cms/seo-planning/article-private-apply-local";
import {
  resolveNewBlogHandoffSlug,
  seoPlanningBlogEditorPath,
} from "@/lib/cms/seo-planning/handoff";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC = "a2-cms-apply-adapter-v1" as const;

export const SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES = {
  missingSeoPermission: "SEO permission is required for private Blog Apply.",
  missingBlogPermission: "Blog permission is required for private Blog Apply.",
  provenanceUnavailable:
    "PREVIEW_PROVENANCE_UNAVAILABLE: trusted server-owned preview provenance could not be resolved.",
  provenanceExpired: "Trusted preview provenance has expired or been invalidated.",
  provenanceMismatch: "Client preview does not match trusted server-owned preview provenance.",
  missingApproval: "Trusted server-side approval receipt could not be resolved.",
  approvalRevoked: "Trusted approval receipt is revoked or expired.",
  forgedApproval: "Approval receipt does not match the authenticated admin actor.",
  staleApproval: "Approval no longer matches Planning identity, preview session, or content hash.",
  auditUnavailable:
    "Apply audit cannot participate in the same transactional commit boundary. Apply aborted.",
  applyConflict: "Another editor or Apply changed Planning/Blog state during the transaction.",
  readinessBlocked: "A2 Apply readiness blocked CMS Apply. No Blog write was performed.",
  durableUnavailable:
    "Durable server-owned preview provenance, approval receipt, audit, and CMS Apply transaction storage are not configured. Private Apply remains blocked.",
  evidencePackUnavailable: SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackUnavailable,
  evidencePackHold: SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackHold,
  untrustedEvidencePackClaim: SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.untrustedEvidencePackClaim,
  writeFreeze: CMS_WRITE_FREEZE_MESSAGE,
} as const;

export type CmsApplyAdapterErrorCode =
  | ArticleApplyReadinessBlockCode
  | "unauthorized"
  | "access_denied"
  | "PREVIEW_PROVENANCE_UNAVAILABLE"
  | "preview_provenance_expired"
  | "preview_provenance_mismatch"
  | "missing_approval"
  | "approval_revoked"
  | "forged_approval"
  | "stale_approval"
  | "audit_unavailable"
  | "apply_conflict"
  | "readiness_blocked"
  | "durable_persistence_unavailable"
  | "transaction_failed"
  | "invalid_input"
  | typeof CMS_WRITE_FREEZE_CODE;

/** Durable provenance record shape — resolved server-side, never trusted from client body alone. */
export type CmsTrustedPreviewProvenance = TrustedPreviewProvenance & {
  /** Opaque generation identity issued at A1 preview time. */
  generationId: string;
  /** ISO expiry; null means no expiry in fixture (production should set TTL). */
  expiresAt: string | null;
  /** Soft-invalidated after Planning/content change. */
  invalidated: boolean;
};

/** Durable approval receipt — resolved by receipt id, not by client approved=true. */
export type CmsTrustedApplyApproval = TrustedPrivateApplyApproval & {
  receiptId: string;
  expiresAt: string | null;
  revoked: boolean;
};

export type CmsApplyAuditRecord = {
  spec: typeof SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC;
  adminId: string;
  planningDraftId: string;
  previewSessionId: string;
  generationId: string;
  approvalReceiptId: string;
  writingFingerprint: string;
  contentFingerprint: string;
  outcome: "created" | "updated" | "noop" | "blocked" | "failed";
  postId: string | null;
  code: CmsApplyAdapterErrorCode | null;
  detail: string;
  publicationReady: false;
};

/**
 * Transactional ops — production MariaDB adapter maps these to FOR UPDATE / conditional SQL.
 * Fake implementations are for offline tests only.
 */
export type CmsApplyTxnOps = {
  /** Planning row lock (SELECT … FOR UPDATE). */
  lockPlanningForUpdate(planningDraftId: string): Promise<SeoPlanningDraft | null>;
  /** Blog row lock after Planning lock (linked path). */
  lockBlogPostForUpdate(postId: string): Promise<BlogPost | null>;
  findBlogPostBySlug(slug: string, excludePostId?: string): Promise<BlogPost | null>;
  listBlogPosts(): Promise<BlogPost[]>;
  /**
   * INSERT private draft. Must not publish. Must not use the generic CMS post upsert path.
   */
  insertPrivateBlogDraft(post: BlogPost): Promise<void>;
  /**
   * Conditional UPDATE empty handoff shell only (status=draft, published_at NULL, empty content/excerpt).
   * Returns affectedRows — 0 means conflict / race.
   */
  updateEmptyShellContent(args: {
    postId: string;
    excerpt: string;
    html: string;
  }): Promise<{ affectedRows: number }>;
  /**
   * Conditional Planning link: linked_post_id IS NULL AND archived_at IS NULL.
   */
  linkPlanningToPost(args: {
    planningDraftId: string;
    postId: string;
    updatedAt: string;
  }): Promise<{ affectedRows: number }>;
  /**
   * Same-commit audit write. Required for successful Apply in this adapter.
   * Production needs an approved schema; offline tests inject an in-memory recorder.
   */
  recordApplyAudit(audit: CmsApplyAuditRecord): Promise<void>;
  __testAfterBlogInsert?: () => void | Promise<void>;
  __testBeforeCommit?: () => void | Promise<void>;
};

export type CmsApplyTransactionRunner = {
  /**
   * Single atomic boundary. Must commit only if work resolves; roll back on throw.
   * Offline fakes simulate this; real MariaDB would use withTransaction(conn).
   */
  runInTransaction<T>(work: (ops: CmsApplyTxnOps) => Promise<T>): Promise<T>;
};

export type CmsTrustedPreviewStore = {
  getBySessionId(previewSessionId: string): Promise<CmsTrustedPreviewProvenance | null>;
};

export type CmsTrustedApprovalStore = {
  getByReceiptId(receiptId: string): Promise<CmsTrustedApplyApproval | null>;
};

export type CmsApplyAdapterSuccess = {
  ok: true;
  spec: typeof SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC;
  outcome: "created" | "updated" | "noop";
  postId: string;
  editorPath: string;
  status: "draft";
  publishedAt: null;
  publicationReady: false;
  /** Simulated / injected only — never a live CMS claim unless wired later. */
  simulatedCmsWrite: boolean;
  realCmsWrite: false;
  auditCommitted: true;
  committed: true;
  audit: CmsApplyAuditRecord;
  readiness: ArticleApplyReadinessResult;
  providerRequests: 0;
  lockOrder: readonly ["planning_for_update", "blog_for_update_if_linked", "writes", "audit"];
};

export type CmsApplyAdapterFailure = {
  ok: false;
  spec: typeof SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC;
  outcome: "blocked" | "failed";
  status: "BLOCKED";
  error: string;
  code: CmsApplyAdapterErrorCode;
  publicationReady: false;
  simulatedCmsWrite: false;
  realCmsWrite: false;
  /**
   * May be true when a blocked-attempt audit row was written in-txn without Blog mutation.
   * Never means Blog Apply committed.
   */
  auditCommitted: boolean;
  committed: false;
  audit: CmsApplyAuditRecord;
  readiness: ArticleApplyReadinessResult | null;
  providerRequests: 0;
};

export type CmsApplyAdapterResult = CmsApplyAdapterSuccess | CmsApplyAdapterFailure;

function baseAudit(partial: Partial<CmsApplyAuditRecord> & Pick<CmsApplyAuditRecord, "adminId">): CmsApplyAuditRecord {
  return {
    spec: SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
    adminId: partial.adminId,
    planningDraftId: partial.planningDraftId || "",
    previewSessionId: partial.previewSessionId || "",
    generationId: partial.generationId || "",
    approvalReceiptId: partial.approvalReceiptId || "",
    writingFingerprint: partial.writingFingerprint || "",
    contentFingerprint: partial.contentFingerprint || "",
    outcome: partial.outcome || "blocked",
    postId: partial.postId ?? null,
    code: partial.code ?? null,
    detail: (partial.detail || "").slice(0, 200),
    publicationReady: false,
  };
}

function fail(
  code: CmsApplyAdapterErrorCode,
  error: string,
  audit: CmsApplyAuditRecord,
  readiness: ArticleApplyReadinessResult | null = null,
): CmsApplyAdapterFailure {
  return {
    ok: false,
    spec: SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
    outcome: code === "transaction_failed" ? "failed" : "blocked",
    status: "BLOCKED",
    error,
    code,
    publicationReady: false,
    simulatedCmsWrite: false,
    realCmsWrite: false,
    auditCommitted: false,
    committed: false,
    audit: {
      ...audit,
      outcome: code === "transaction_failed" ? "failed" : "blocked",
      code,
      detail: error.slice(0, 200),
    },
    readiness,
    providerRequests: 0,
  };
}

function isExpired(expiresAt: string | null | undefined, nowIso: string): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= Date.parse(nowIso);
}

/**
 * Inactive CMS Apply adapter entrypoint.
 * Resolves trusted provenance/approval by opaque ids, then runs the transactional Apply protocol.
 */
export async function applyPrivateArticleViaCmsAdapter(args: {
  clientPreview: unknown;
  /** Opaque server session id from A1 generation — not proof by itself. */
  previewSessionId: string;
  /** Opaque approval receipt id — not client approved=true. */
  approvalReceiptId: string;
  actor: TrustedPrivateApplyActor;
  previewStore: CmsTrustedPreviewStore;
  approvalStore: CmsTrustedApprovalStore;
  transaction: CmsApplyTransactionRunner;
  editorialHold?: unknown;
  /**
   * @deprecated Untrusted hint — READY/HOLD/ABSENT strings never authorize Apply.
   * Prefer `trustedEvidencePack` from the H3B adapter.
   */
  evidencePackStatus?: "READY_FOR_DRAFTING_REVIEW" | "HOLD" | "ABSENT" | unknown;
  /** Server-sealed H3B assessment — plain objects are rejected. */
  trustedEvidencePack?: TrustedArticleEvidencePackAssessment | unknown;
  now?: string;
  createIdFn?: (prefix?: string) => string;
  /** Injected env for write-freeze tests; defaults to process.env. */
  writeFreezeEnv?: CmsWriteFreezeEnv;
}): Promise<CmsApplyAdapterResult> {
  const now = args.now || new Date().toISOString();
  const adminId = String(args.actor?.adminId || "").trim();
  const previewSessionId = String(args.previewSessionId || "").trim();
  const approvalReceiptId = String(args.approvalReceiptId || "").trim();

  let audit = baseAudit({ adminId, previewSessionId, approvalReceiptId });

  if (isCmsWriteFreezeActive(args.writeFreezeEnv ?? process.env)) {
    return fail(
      CMS_WRITE_FREEZE_CODE,
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.writeFreeze,
      audit,
    );
  }

  if (!adminId) {
    return fail("unauthorized", "A trusted admin actor is required.", audit);
  }
  if (!args.actor.hasSeoPermission) {
    return fail(
      "access_denied",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.missingSeoPermission,
      audit,
    );
  }
  if (!args.actor.hasBlogPermission) {
    return fail(
      "access_denied",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.missingBlogPermission,
      audit,
    );
  }

  // Fail closed before trust-store lookups or simulated Blog writes.
  // ABSENT / omitted / forged packs never authorize Apply.
  const trustedPack = isTrustedArticleEvidencePackAssessment(args.trustedEvidencePack)
    ? args.trustedEvidencePack
    : null;
  if (!trustedPack || trustedPack.applyEvidenceGate !== "PASS_DRAFTING_REVIEW_ONLY") {
    const code =
      trustedPack && trustedPack.applyEvidenceGate === "BLOCK"
        ? "evidence_pack_hold"
        : args.trustedEvidencePack != null && !trustedPack
          ? "untrusted_evidence_pack_claim"
          : args.evidencePackStatus === "READY_FOR_DRAFTING_REVIEW" ||
              args.evidencePackStatus === "HOLD"
            ? "untrusted_evidence_pack_claim"
            : "evidence_pack_unavailable";
    const message =
      code === "evidence_pack_hold"
        ? SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.evidencePackHold
        : code === "untrusted_evidence_pack_claim"
          ? SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.untrustedEvidencePackClaim
          : SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.evidencePackUnavailable;
    return fail(code, message, audit);
  }

  if (!previewSessionId) {
    return fail(
      "PREVIEW_PROVENANCE_UNAVAILABLE",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.provenanceUnavailable,
      audit,
    );
  }
  if (!approvalReceiptId) {
    return fail(
      "missing_approval",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.missingApproval,
      audit,
    );
  }

  const provenance = await args.previewStore.getBySessionId(previewSessionId);
  if (!provenance) {
    return fail(
      "PREVIEW_PROVENANCE_UNAVAILABLE",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.provenanceUnavailable,
      audit,
    );
  }
  if (provenance.invalidated || isExpired(provenance.expiresAt, now)) {
    return fail(
      "preview_provenance_expired",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.provenanceExpired,
      {
        ...audit,
        generationId: provenance.generationId,
        planningDraftId: provenance.planningDraftId,
        writingFingerprint: provenance.writingFingerprint,
        contentFingerprint: provenance.contentFingerprint,
      },
    );
  }

  const approval = await args.approvalStore.getByReceiptId(approvalReceiptId);
  if (!approval) {
    return fail(
      "missing_approval",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.missingApproval,
      {
        ...audit,
        generationId: provenance.generationId,
        planningDraftId: provenance.planningDraftId,
      },
    );
  }
  if (approval.revoked || isExpired(approval.expiresAt, now)) {
    return fail(
      "approval_revoked",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.approvalRevoked,
      {
        ...audit,
        generationId: provenance.generationId,
        planningDraftId: approval.planningDraftId,
      },
    );
  }
  if (approval.factualReviewConfirmed !== true) {
    return fail(
      "missing_factual_review",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.missingApproval,
      audit,
    );
  }
  if (approval.approvedByAdminId !== adminId) {
    return fail(
      "forged_approval",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.forgedApproval,
      audit,
    );
  }
  if (approval.previewSessionId !== previewSessionId) {
    return fail(
      "stale_approval",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.staleApproval,
      audit,
    );
  }

  const parsed = parsePrivateArticlePreview(args.clientPreview);
  if (!parsed.ok) {
    return fail("invalid_preview", parsed.error, audit);
  }
  const preview = parsed.preview;
  const sanitized = normalizeGeneratedArticle(preview.article);
  if (!sanitized) {
    return fail("unsafe_html", "Article HTML failed CMS sanitize/bounds checks.", {
      ...audit,
      planningDraftId: preview.planningDraftId,
      writingFingerprint: preview.writingFingerprint,
    });
  }
  const contentFingerprint = fingerprintPrivateApplyContent(sanitized);

  audit = baseAudit({
    adminId,
    planningDraftId: preview.planningDraftId,
    previewSessionId,
    generationId: provenance.generationId,
    approvalReceiptId,
    writingFingerprint: preview.writingFingerprint,
    contentFingerprint,
  });

  if (
    provenance.previewSessionId !== previewSessionId ||
    provenance.planningDraftId !== preview.planningDraftId ||
    provenance.planningUpdatedAt !== preview.planningUpdatedAt ||
    provenance.writingFingerprint !== preview.writingFingerprint ||
    provenance.contentFingerprint !== contentFingerprint ||
    provenance.model !== preview.model
  ) {
    return fail(
      "preview_provenance_mismatch",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.provenanceMismatch,
      audit,
    );
  }

  if (
    approval.planningDraftId !== preview.planningDraftId ||
    approval.planningUpdatedAt !== preview.planningUpdatedAt ||
    approval.writingFingerprint !== preview.writingFingerprint ||
    approval.contentFingerprint !== contentFingerprint
  ) {
    return fail(
      "stale_approval",
      SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.staleApproval,
      audit,
    );
  }

  try {
    return await args.transaction.runInTransaction(async (ops) => {
      // 1) Lock authoritative Planning (FOR UPDATE).
      const planning = await ops.lockPlanningForUpdate(preview.planningDraftId);

      // 2) Lock linked Blog when present (lock order after Planning).
      let linkedPost: BlogPost | null = null;
      if (planning?.linkedPostId) {
        linkedPost = await ops.lockBlogPostForUpdate(String(planning.linkedPostId));
      }

      // 3) Re-resolve trust under txn consistency (same stores; production may use txn-scoped reads).
      const freshProvenance = await args.previewStore.getBySessionId(previewSessionId);
      const freshApproval = await args.approvalStore.getByReceiptId(approvalReceiptId);
      if (!freshProvenance || freshProvenance.invalidated || isExpired(freshProvenance.expiresAt, now)) {
        return fail(
          freshProvenance ? "preview_provenance_expired" : "PREVIEW_PROVENANCE_UNAVAILABLE",
          freshProvenance
            ? SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.provenanceExpired
            : SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.provenanceUnavailable,
          audit,
        );
      }
      if (
        !freshApproval ||
        freshApproval.revoked ||
        isExpired(freshApproval.expiresAt, now) ||
        freshApproval.approvedByAdminId !== adminId ||
        freshApproval.contentFingerprint !== contentFingerprint
      ) {
        return fail(
          !freshApproval ? "missing_approval" : "stale_approval",
          !freshApproval
            ? SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.missingApproval
            : SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.staleApproval,
          audit,
        );
      }

      const existingPosts = await ops.listBlogPosts();
      const readiness = prepareArticleApplyReadiness({
        preview,
        planningDraft: planning,
        linkedPost,
        existingPosts,
        editorialHold: args.editorialHold,
        // Legacy hint only — sealed assessment is authoritative.
        evidencePackStatus: args.evidencePackStatus,
        trustedEvidencePack: trustedPack,
        humanApproval: {
          factualReviewConfirmed: true,
          approvedByAdminId: adminId,
          clientApprovedFlag: false,
          claimPublicationReady: false,
          claimEvidencePackComplete: false,
          claimEvidenceVerified: false,
        },
      });

      // Only readiness.ok may proceed — proposed payload on BLOCKED never authorizes writes.
      if (!readiness.ok) {
        const primary = readiness.blockingReasons[0];
        const blockedAudit: CmsApplyAuditRecord = {
          ...audit,
          outcome: "blocked",
          code: primary?.code || "readiness_blocked",
          detail: (primary?.message || SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.readinessBlocked).slice(
            0,
            200,
          ),
        };
        // Audit the block in-txn; Blog/Planning writes must not occur.
        await ops.recordApplyAudit(blockedAudit);
        return {
          ok: false as const,
          spec: SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
          outcome: "blocked" as const,
          status: "BLOCKED" as const,
          error: blockedAudit.detail,
          code: (primary?.code || "readiness_blocked") as CmsApplyAdapterErrorCode,
          publicationReady: false as const,
          simulatedCmsWrite: false as const,
          realCmsWrite: false as const,
          auditCommitted: true as const,
          committed: false as const,
          audit: blockedAudit,
          readiness,
          providerRequests: 0 as const,
        };
      }

      const proposed = readiness.proposedPrivateBlogDraft;
      const mkId = args.createIdFn || createId;

      if (proposed.mode === "idempotent_already_applied") {
        const postId = proposed.linkedPostId || linkedPost?.id || "";
        const successAudit: CmsApplyAuditRecord = {
          ...audit,
          outcome: "noop",
          postId,
          code: null,
          detail: "Idempotent no-op under Planning/Blog locks.",
        };
        await ops.recordApplyAudit(successAudit);
        if (ops.__testBeforeCommit) await ops.__testBeforeCommit();
        return {
          ok: true as const,
          spec: SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
          outcome: "noop" as const,
          postId,
          editorPath: seoPlanningBlogEditorPath(postId),
          status: "draft" as const,
          publishedAt: null,
          publicationReady: false as const,
          simulatedCmsWrite: false,
          realCmsWrite: false as const,
          auditCommitted: true as const,
          committed: true as const,
          audit: successAudit,
          readiness,
          providerRequests: 0 as const,
          lockOrder: ["planning_for_update", "blog_for_update_if_linked", "writes", "audit"] as const,
        };
      }

      if (proposed.mode === "update_linked_empty_shell") {
        const postId = proposed.linkedPostId;
        if (!postId) {
          return fail("linked_post_missing", "Linked private draft id is required.", audit, readiness);
        }
        // Conditional empty-shell UPDATE — never generic CMS post upsert.
        const updated = await ops.updateEmptyShellContent({
          postId,
          excerpt: proposed.excerpt,
          html: proposed.content,
        });
        if (!updated.affectedRows) {
          return fail(
            "apply_conflict",
            SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.applyConflict,
            audit,
            readiness,
          );
        }
        const successAudit: CmsApplyAuditRecord = {
          ...audit,
          outcome: "updated",
          postId,
          code: null,
          detail: "Updated untouched linked private handoff shell (txn).",
        };
        await ops.recordApplyAudit(successAudit);
        if (ops.__testBeforeCommit) await ops.__testBeforeCommit();
        return {
          ok: true as const,
          spec: SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
          outcome: "updated" as const,
          postId,
          editorPath: seoPlanningBlogEditorPath(postId),
          status: "draft" as const,
          publishedAt: null,
          publicationReady: false as const,
          simulatedCmsWrite: true,
          realCmsWrite: false as const,
          auditCommitted: true as const,
          committed: true as const,
          audit: successAudit,
          readiness,
          providerRequests: 0 as const,
          lockOrder: ["planning_for_update", "blog_for_update_if_linked", "writes", "audit"] as const,
        };
      }

      // create_private_draft — Blog INSERT + Planning link in same txn (handoff convention).
      const slug = resolveNewBlogHandoffSlug({
        proposedSlug: planning?.proposedSlug || proposed.slug,
        workingTitle: planning?.workingTitle || proposed.title,
      });
      const collision = await ops.findBlogPostBySlug(slug);
      if (collision) {
        return fail("slug_conflict", "That blog slug is already in use.", audit, readiness);
      }

      const base = emptyPost();
      const createdPost = sanitizePost({
        ...base,
        id: mkId("post"),
        title: proposed.title,
        slug,
        excerpt: proposed.excerpt,
        content: proposed.content,
        status: "draft",
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        categoryId: null,
        featuredImage: null,
        ogImage: null,
        seoTitle: "",
        seoDescription: "",
        focusKeyword: "",
        canonicalUrl: "",
        ogTitle: "",
        ogDescription: "",
      });

      await ops.insertPrivateBlogDraft(createdPost);
      if (ops.__testAfterBlogInsert) await ops.__testAfterBlogInsert();

      const link = await ops.linkPlanningToPost({
        planningDraftId: preview.planningDraftId,
        postId: createdPost.id,
        updatedAt: now,
      });
      if (!link.affectedRows) {
        throw new Error("SEO_AI_ARTICLE_CMS_APPLY_PLANNING_LINK_FAILED");
      }

      const successAudit: CmsApplyAuditRecord = {
        ...audit,
        outcome: "created",
        postId: createdPost.id,
        code: null,
        detail: "Created private Blog draft and Planning link in one txn.",
      };
      await ops.recordApplyAudit(successAudit);
      if (ops.__testBeforeCommit) await ops.__testBeforeCommit();

      return {
        ok: true as const,
        spec: SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
        outcome: "created" as const,
        postId: createdPost.id,
        editorPath: seoPlanningBlogEditorPath(createdPost.id),
        status: "draft" as const,
        publishedAt: null,
        publicationReady: false as const,
        simulatedCmsWrite: true,
        realCmsWrite: false as const,
        auditCommitted: true as const,
        committed: true as const,
        audit: successAudit,
        readiness,
        providerRequests: 0 as const,
        lockOrder: ["planning_for_update", "blog_for_update_if_linked", "writes", "audit"] as const,
      };
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message.slice(0, 200)
        : "CMS Apply transaction failed.";
    if (message === "SEO_AI_ARTICLE_CMS_APPLY_PLANNING_LINK_FAILED") {
      return fail("apply_conflict", SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.applyConflict, audit);
    }
    if (message === "SEO_AI_ARTICLE_CMS_APPLY_AUDIT_FAILED") {
      return fail(
        "audit_unavailable",
        SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.auditUnavailable,
        audit,
      );
    }
    if (message === "CMS_APPLY_DURABLE_TXN_UNAVAILABLE") {
      return fail(
        "durable_persistence_unavailable",
        SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_MESSAGES.durableUnavailable,
        audit,
      );
    }
    return fail("transaction_failed", message, audit);
  }
}

/**
 * Production-shaped deps until separately approved durable stores + MariaDB Apply txn exist.
 * Always fail-closed. Never backs onto memory/fake helpers.
 */
export function createDurableCmsApplyUnavailableDeps(): {
  previewStore: CmsTrustedPreviewStore;
  approvalStore: CmsTrustedApprovalStore;
  transaction: CmsApplyTransactionRunner;
} {
  return {
    previewStore: {
      async getBySessionId() {
        return null;
      },
    },
    approvalStore: {
      async getByReceiptId() {
        return null;
      },
    },
    transaction: {
      async runInTransaction() {
        throw new Error("CMS_APPLY_DURABLE_TXN_UNAVAILABLE");
      },
    },
  };
}

/**
 * Production-gated Apply entry. Does not accept injected fake stores/transactions.
 * Resolves through production DI (fail-closed unavailable deps until schema +
 * fencing + facade factory + master apply writers are authorized).
 */
export async function applyPrivateArticleViaCmsAdapterUntilDurableReady(args: {
  clientPreview: unknown;
  previewSessionId: string;
  approvalReceiptId: string;
  actor: TrustedPrivateApplyActor;
  editorialHold?: unknown;
  /**
   * @deprecated Untrusted hint — never authorizes Apply.
   */
  evidencePackStatus?: "READY_FOR_DRAFTING_REVIEW" | "HOLD" | "ABSENT" | unknown;
  /** Server-sealed H3B assessment — required for any success path. */
  trustedEvidencePack?: TrustedArticleEvidencePackAssessment | unknown;
  now?: string;
  createIdFn?: (prefix?: string) => string;
  /** Optional physical-schema probe result from a verified migration gate. */
  physicalSchemaPresent?: boolean;
}): Promise<CmsApplyAdapterResult> {
  const { resolveCmsApplyProductionDeps } = await import(
    "@/lib/cms/seo-planning/article-apply-production-di"
  );
  const deps = resolveCmsApplyProductionDeps({
    physicalSchemaPresent: args.physicalSchemaPresent === true,
    trustedEvidencePack: args.trustedEvidencePack,
    evidencePackStatus: args.evidencePackStatus,
  });
  return applyPrivateArticleViaCmsAdapter({
    clientPreview: args.clientPreview,
    previewSessionId: args.previewSessionId,
    approvalReceiptId: args.approvalReceiptId,
    actor: args.actor,
    editorialHold: args.editorialHold,
    evidencePackStatus: args.evidencePackStatus,
    trustedEvidencePack: args.trustedEvidencePack,
    now: args.now,
    createIdFn: args.createIdFn,
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
  });
}

/**
 * TEST-ONLY in-memory trust stores. Not durable. Not a production authority.
 * Do not import from production Server Actions / catalog wiring.
 */
export function createMemoryCmsTrustStores(seed?: {
  provenance?: CmsTrustedPreviewProvenance[];
  approvals?: CmsTrustedApplyApproval[];
}): {
  previewStore: CmsTrustedPreviewStore;
  approvalStore: CmsTrustedApprovalStore;
  putProvenance(row: CmsTrustedPreviewProvenance): void;
  putApproval(row: CmsTrustedApplyApproval): void;
  invalidateProvenance(sessionId: string): void;
  revokeApproval(receiptId: string): void;
} {
  const provenance = new Map((seed?.provenance || []).map((p) => [p.previewSessionId, structuredClone(p)]));
  const approvals = new Map((seed?.approvals || []).map((a) => [a.receiptId, structuredClone(a)]));
  return {
    previewStore: {
      async getBySessionId(id) {
        const row = provenance.get(id);
        return row ? structuredClone(row) : null;
      },
    },
    approvalStore: {
      async getByReceiptId(id) {
        const row = approvals.get(id);
        return row ? structuredClone(row) : null;
      },
    },
    putProvenance(row) {
      provenance.set(row.previewSessionId, structuredClone(row));
    },
    putApproval(row) {
      approvals.set(row.receiptId, structuredClone(row));
    },
    invalidateProvenance(sessionId) {
      const row = provenance.get(sessionId);
      if (row) provenance.set(sessionId, { ...row, invalidated: true });
    },
    revokeApproval(receiptId) {
      const row = approvals.get(receiptId);
      if (row) approvals.set(receiptId, { ...row, revoked: true });
    },
  };
}

/**
 * TEST-ONLY fake CMS transaction runner.
 * Simulates Planning→Blog lock order, conditional writes, audit, rollback.
 * Does not connect to MySQL/MariaDB. Not a production authority.
 */
export function createFakeCmsApplyTransaction(seed: {
  drafts: SeoPlanningDraft[];
  posts?: BlogPost[];
}): CmsApplyTransactionRunner & {
  getDraft(id: string): SeoPlanningDraft | null;
  getPost(id: string): BlogPost | null;
  listPosts(): BlogPost[];
  listAudits(): CmsApplyAuditRecord[];
  snapshot(): { drafts: SeoPlanningDraft[]; posts: BlogPost[]; audits: CmsApplyAuditRecord[] };
  lockLog: string[];
} {
  let drafts = new Map(seed.drafts.map((d) => [d.id, structuredClone(d)]));
  let posts = new Map((seed.posts || []).map((p) => [p.id, structuredClone(p)]));
  let audits: CmsApplyAuditRecord[] = [];
  const lockLog: string[] = [];
  let chain: Promise<unknown> = Promise.resolve();

  const snapshot = () => ({
    drafts: structuredClone([...drafts.values()]),
    posts: structuredClone([...posts.values()]),
    audits: structuredClone(audits),
  });

  const isEmptyShell = (post: BlogPost) => {
    const normalized = String(post.content || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const empty = new Set(["", "<p></p>", "<p><br></p>", "<p><br/></p>", "<p>&nbsp;</p>"]);
    return empty.has(normalized) && String(post.excerpt || "").trim() === "";
  };

  const api = {
    lockLog,
    getDraft(id: string) {
      const row = drafts.get(id);
      return row ? structuredClone(row) : null;
    },
    getPost(id: string) {
      const row = posts.get(id);
      return row ? structuredClone(row) : null;
    },
    listPosts() {
      return structuredClone([...posts.values()]);
    },
    listAudits() {
      return structuredClone(audits);
    },
    snapshot,
    async runInTransaction<T>(work: (ops: CmsApplyTxnOps) => Promise<T>): Promise<T> {
      const run = async () => {
        const beforeDrafts = structuredClone([...drafts.entries()]);
        const beforePosts = structuredClone([...posts.entries()]);
        const beforeAudits = structuredClone(audits);
        const liveDrafts = new Map(structuredClone([...drafts.entries()]));
        const livePosts = new Map(structuredClone([...posts.entries()]));
        const liveAudits = structuredClone(audits);
        const txnLocks: string[] = [];

        const ops: CmsApplyTxnOps = {
          async lockPlanningForUpdate(planningDraftId) {
            txnLocks.push("planning_for_update");
            lockLog.push(`planning_for_update:${planningDraftId}`);
            const row = liveDrafts.get(planningDraftId);
            return row ? structuredClone(row) : null;
          },
          async lockBlogPostForUpdate(postId) {
            txnLocks.push("blog_for_update");
            lockLog.push(`blog_for_update:${postId}`);
            const row = livePosts.get(postId);
            return row ? structuredClone(row) : null;
          },
          async findBlogPostBySlug(slug, excludePostId) {
            return (
              [...livePosts.values()].find(
                (p) => p.slug === slug && (!excludePostId || p.id !== excludePostId),
              ) || null
            );
          },
          async listBlogPosts() {
            return structuredClone([...livePosts.values()]);
          },
          async insertPrivateBlogDraft(post) {
            txnLocks.push("writes");
            if (livePosts.has(post.id)) throw new Error("Post id collision");
            if ([...livePosts.values()].some((p) => p.slug === post.slug)) {
              throw new Error("Slug collision");
            }
            if (post.status !== "draft" || post.publishedAt) {
              throw new Error("Refuse non-private insert");
            }
            livePosts.set(post.id, structuredClone(post));
          },
          async updateEmptyShellContent({ postId, excerpt, html }) {
            txnLocks.push("writes");
            const current = livePosts.get(postId);
            if (
              !current ||
              current.status !== "draft" ||
              current.publishedAt ||
              !isEmptyShell(current)
            ) {
              return { affectedRows: 0 };
            }
            livePosts.set(postId, {
              ...current,
              excerpt,
              content: html,
              status: "draft",
              publishedAt: null,
              updatedAt: new Date().toISOString(),
            });
            return { affectedRows: 1 };
          },
          async linkPlanningToPost({ planningDraftId, postId, updatedAt }) {
            txnLocks.push("writes");
            const planning = liveDrafts.get(planningDraftId);
            if (!planning || planning.linkedPostId || planning.archivedAt) {
              return { affectedRows: 0 };
            }
            liveDrafts.set(planningDraftId, {
              ...planning,
              linkedPostId: postId,
              updatedAt,
            });
            return { affectedRows: 1 };
          },
          async recordApplyAudit(audit) {
            txnLocks.push("audit");
            liveAudits.push(structuredClone(audit));
          },
        };

        try {
          const result = await work(ops);
          drafts = liveDrafts;
          posts = livePosts;
          audits = liveAudits;
          return result;
        } catch (error) {
          drafts = new Map(beforeDrafts);
          posts = new Map(beforePosts);
          audits = beforeAudits;
          throw error;
        }
      };

      const next = chain.then(run, run);
      chain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };

  return api;
}

/** TEST-ONLY fixture builder. Not durable server provenance. */
export function buildCmsApplyTrustFixtures(args: {
  preview: {
    planningDraftId: string;
    planningUpdatedAt: string;
    writingFingerprint: string;
    model: string;
    article: { title: string; excerpt: string; html: string };
  };
  adminId: string;
  previewSessionId?: string;
  approvalReceiptId?: string;
  generationId?: string;
  now?: string;
}): {
  provenance: CmsTrustedPreviewProvenance;
  approval: CmsTrustedApplyApproval;
  contentFingerprint: string;
} {
  const sanitized = normalizeGeneratedArticle(args.preview.article);
  if (!sanitized) throw new Error("Fixture article must normalize");
  const contentFingerprint = fingerprintPrivateApplyContent(sanitized);
  const previewSessionId = args.previewSessionId || "preview_session_cms_1";
  const approvalReceiptId = args.approvalReceiptId || "approval_receipt_cms_1";
  const generationId = args.generationId || "generation_cms_1";
  const approvedAt = args.now || "2026-10-21T00:00:00.000Z";
  const provenance: CmsTrustedPreviewProvenance = {
    previewSessionId,
    planningDraftId: args.preview.planningDraftId,
    planningUpdatedAt: args.preview.planningUpdatedAt,
    writingFingerprint: args.preview.writingFingerprint,
    contentFingerprint,
    model: args.preview.model,
    generationId,
    expiresAt: null,
    invalidated: false,
  };
  const approval: CmsTrustedApplyApproval = {
    receiptId: approvalReceiptId,
    planningDraftId: args.preview.planningDraftId,
    planningUpdatedAt: args.preview.planningUpdatedAt,
    writingFingerprint: args.preview.writingFingerprint,
    contentFingerprint,
    previewSessionId,
    factualReviewConfirmed: true,
    approvedByAdminId: args.adminId,
    approvedAt,
    expiresAt: null,
    revoked: false,
  };
  return { provenance, approval, contentFingerprint };
}
