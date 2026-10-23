/**
 * A2 durable Apply — inactive MariaDB storage + transaction orchestration.
 *
 * Implements CmsTrustedPreviewStore / CmsTrustedApprovalStore / CmsApplyTransactionRunner
 * using parameterized SQL compatible with existing txn lock order:
 *   Planning FOR UPDATE → Preview FOR UPDATE → Approval FOR UPDATE → Blog FOR UPDATE → writes → audit
 *
 * INACTIVE: this module never opens a DB pool or calls the shared txn helper.
 * Callers must inject a DurableMysqlTxnFacade. Production catalog/actions must not wire this yet.
 *
 * When physicalSchemaPresent=false, trust lookups fail closed (null) matching
 * PREVIEW_PROVENANCE_UNAVAILABLE / missing_approval on the CMS Apply adapter.
 */

import { emptyPost } from "@/lib/cms/blog";
import { sanitizePost } from "@/lib/cms/validation";
import {
  A2_APPLY_APPROVAL_TABLE,
  A2_APPLY_AUDIT_TABLE,
  A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
  A2_APPLY_PREVIEW_TABLE,
} from "@/lib/cms/seo-planning/article-apply-durable-schema";
import {
  type CmsApplyAuditRecord,
  type CmsApplyTransactionRunner,
  type CmsApplyTxnOps,
  type CmsTrustedApplyApproval,
  type CmsTrustedApprovalStore,
  type CmsTrustedPreviewProvenance,
  type CmsTrustedPreviewStore,
} from "@/lib/cms/seo-planning/article-cms-apply-adapter";
import { SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES } from "@/lib/cms/seo-planning/article-apply-readiness";
import {
  isTrustedArticleEvidencePackAssessment,
  type TrustedArticleEvidencePackAssessment,
} from "@/lib/cms/seo-planning/article-evidence-pack-adapter";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const A2_APPLY_DURABLE_MYSQL_SPEC = "a2-apply-durable-mysql-v1" as const;

/** Exported SQL templates — always use `?` placeholders (injection-resistant binding). */
export const A2_APPLY_DURABLE_SQL = {
  selectPreviewBySession: `SELECT preview_session_id, planning_draft_id, planning_updated_at, writing_fingerprint, content_fingerprint, generation_id, model, title, excerpt, html, created_at, expires_at, invalidated FROM ${A2_APPLY_PREVIEW_TABLE} WHERE preview_session_id = ? LIMIT 1`,
  lockPreviewBySession: `SELECT preview_session_id, planning_draft_id, planning_updated_at, writing_fingerprint, content_fingerprint, generation_id, model, title, excerpt, html, created_at, expires_at, invalidated FROM ${A2_APPLY_PREVIEW_TABLE} WHERE preview_session_id = ? LIMIT 1 FOR UPDATE`,
  selectApprovalByReceipt: `SELECT receipt_id, preview_session_id, planning_draft_id, planning_updated_at, writing_fingerprint, content_fingerprint, approved_by_admin_id, factual_review_confirmed, approved_at, expires_at, revoked FROM ${A2_APPLY_APPROVAL_TABLE} WHERE receipt_id = ? LIMIT 1`,
  lockApprovalByReceipt: `SELECT receipt_id, preview_session_id, planning_draft_id, planning_updated_at, writing_fingerprint, content_fingerprint, approved_by_admin_id, factual_review_confirmed, approved_at, expires_at, revoked FROM ${A2_APPLY_APPROVAL_TABLE} WHERE receipt_id = ? LIMIT 1 FOR UPDATE`,
  lockPlanning: `SELECT id, recommendation, workflow_status, fingerprint, topic, working_title, proposed_slug, target_post_id, matched_public_url, restore_path, search_intent, linked_post_id, created_by, payload, archived_at, created_at, updated_at FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE`,
  lockBlog: `SELECT id, title, slug, excerpt, content, category_id, featured_image, status, featured, published_at, seo_title, seo_description, focus_keyword, canonical_url, robots_index, robots_follow, og_title, og_description, og_image, sitemap_include, created_at, updated_at FROM blog_posts WHERE id = ? LIMIT 1 FOR UPDATE`,
  findSlug: `SELECT id FROM blog_posts WHERE slug = ? AND id <> ? LIMIT 1`,
  listPosts: `SELECT id, title, slug, excerpt, content, category_id, featured_image, status, featured, published_at, seo_title, seo_description, focus_keyword, canonical_url, robots_index, robots_follow, og_title, og_description, og_image, sitemap_include, created_at, updated_at FROM blog_posts`,
  insertPost: `INSERT INTO blog_posts (id, title, slug, excerpt, content, category_id, featured_image, status, featured, published_at, seo_title, seo_description, focus_keyword, canonical_url, robots_index, robots_follow, og_title, og_description, og_image, sitemap_include) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  updateEmptyShell: `UPDATE blog_posts SET excerpt = ?, content = ?, status = 'draft', published_at = NULL, updated_at = ? WHERE id = ? AND status = 'draft' AND published_at IS NULL AND content IN ('', '<p></p>', '<p><br></p>', '<p><br/></p>', '<p>&nbsp;</p>') AND TRIM(excerpt) = ''`,
  linkPlanning: `UPDATE seo_planning_drafts SET linked_post_id = ?, updated_at = ? WHERE id = ? AND linked_post_id IS NULL AND archived_at IS NULL`,
  insertAudit: `INSERT INTO ${A2_APPLY_AUDIT_TABLE} (apply_operation_key, planning_draft_id, post_id, preview_session_id, approval_receipt_id, generation_id, admin_id, writing_fingerprint, content_fingerprint, outcome, result_code, detail, publication_ready, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  selectAuditByKey: `SELECT apply_operation_key, outcome, post_id FROM ${A2_APPLY_AUDIT_TABLE} WHERE apply_operation_key = ? LIMIT 1`,
} as const;

export type DurableMysqlRow = Record<string, unknown>;

export type DurableMysqlExecutor = {
  query(sql: string, params: unknown[]): Promise<DurableMysqlRow[]>;
  execute(sql: string, params: unknown[]): Promise<{ affectedRows: number }>;
};

/**
 * Injected facade — production would wrap the shared MariaDB pool + txn helper.
 * This module never constructs a real pool.
 */
export type DurableMysqlTxnFacade = {
  /** Read connection for pre-txn trust lookup (still injected / fake in tests). */
  queryOutsideTxn(sql: string, params: unknown[]): Promise<DurableMysqlRow[]>;
  runInTransaction<T>(work: (exec: DurableMysqlExecutor) => Promise<T>): Promise<T>;
};

export type InactiveMysqlEvidenceAuthorization =
  | { ok: true; trustedEvidencePack: TrustedArticleEvidencePackAssessment }
  | {
      ok: false;
      code: "evidence_pack_unavailable" | "evidence_pack_hold" | "untrusted_evidence_pack_claim";
      message: string;
    };

/**
 * Fail-closed Evidence Pack gate for inactive durable Apply.
 * Does not open a connection or read READY strings as authorization.
 * Call before (or as part of) durable txn acquisition.
 */
export function authorizeInactiveMysqlApplyTrustedEvidencePack(
  trustedEvidencePack: unknown,
  evidencePackStatus?: unknown,
): InactiveMysqlEvidenceAuthorization {
  const trustedPack = isTrustedArticleEvidencePackAssessment(trustedEvidencePack)
    ? trustedEvidencePack
    : null;
  if (trustedPack && trustedPack.applyEvidenceGate === "PASS_DRAFTING_REVIEW_ONLY") {
    return { ok: true, trustedEvidencePack: trustedPack };
  }
  const code =
    trustedPack && trustedPack.applyEvidenceGate === "BLOCK"
      ? "evidence_pack_hold"
      : trustedEvidencePack != null && !trustedPack
        ? "untrusted_evidence_pack_claim"
        : evidencePackStatus === "READY_FOR_DRAFTING_REVIEW" || evidencePackStatus === "HOLD"
          ? "untrusted_evidence_pack_claim"
          : "evidence_pack_unavailable";
  const message =
    code === "evidence_pack_hold"
      ? SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackHold
      : code === "untrusted_evidence_pack_claim"
        ? SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.untrustedEvidencePackClaim
        : SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackUnavailable;
  return { ok: false, code, message };
}

export type InactiveMysqlCmsApplyDepsOptions = {
  facade: DurableMysqlTxnFacade;
  /**
   * Physical tables present on the target DB.
   * false → fail-closed trust lookups (schema not migrated).
   */
  physicalSchemaPresent: boolean;
  /**
   * Sealed H3B assessment required before any durable Apply txn opens.
   * Omitted / ABSENT / forged / HOLD → runInTransaction fails closed with no SQL.
   * Trust-store lookups (preview/approval) remain available for offline fixtures.
   */
  trustedEvidencePack?: TrustedArticleEvidencePackAssessment | unknown;
  /**
   * @deprecated Untrusted hint — READY/HOLD strings never authorize durable txn.
   */
  evidencePackStatus?: "READY_FOR_DRAFTING_REVIEW" | "HOLD" | "ABSENT" | unknown;
  /** Optional Apply operation key factory for durable idempotency. */
  buildOperationKey?: (args: {
    planningDraftId: string;
    previewSessionId: string;
    contentFingerprint: string;
  }) => string;
};

function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function toMysqlDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19).replace("T", " ");
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function mapPreviewRow(row: DurableMysqlRow): CmsTrustedPreviewProvenance {
  return {
    previewSessionId: asString(row.preview_session_id),
    planningDraftId: asString(row.planning_draft_id),
    planningUpdatedAt: asString(row.planning_updated_at),
    writingFingerprint: asString(row.writing_fingerprint),
    contentFingerprint: asString(row.content_fingerprint),
    model: asString(row.model),
    generationId: asString(row.generation_id),
    expiresAt: row.expires_at == null || row.expires_at === "" ? null : asString(row.expires_at),
    invalidated: asBool(row.invalidated),
  };
}

export function mapApprovalRow(row: DurableMysqlRow): CmsTrustedApplyApproval {
  return {
    receiptId: asString(row.receipt_id),
    previewSessionId: asString(row.preview_session_id),
    planningDraftId: asString(row.planning_draft_id),
    planningUpdatedAt: asString(row.planning_updated_at),
    writingFingerprint: asString(row.writing_fingerprint),
    contentFingerprint: asString(row.content_fingerprint),
    approvedByAdminId: asString(row.approved_by_admin_id),
    factualReviewConfirmed: true,
    approvedAt: asString(row.approved_at),
    expiresAt: row.expires_at == null || row.expires_at === "" ? null : asString(row.expires_at),
    revoked: asBool(row.revoked),
  };
}

export function mapPlanningRow(row: DurableMysqlRow): SeoPlanningDraft {
  return {
    id: asString(row.id),
    recommendation: asString(row.recommendation),
    workflowStatus: asString(row.workflow_status) as SeoPlanningDraft["workflowStatus"],
    fingerprint: asString(row.fingerprint),
    topic: asString(row.topic),
    workingTitle: asString(row.working_title),
    proposedSlug: asString(row.proposed_slug),
    targetPostId: row.target_post_id == null || row.target_post_id === "" ? null : asString(row.target_post_id),
    matchedPublicUrl: asString(row.matched_public_url),
    restorePath: asString(row.restore_path),
    searchIntent: asString(row.search_intent),
    linkedPostId: row.linked_post_id == null || row.linked_post_id === "" ? null : asString(row.linked_post_id),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    archivedAt: row.archived_at == null || row.archived_at === "" ? null : asString(row.archived_at),
    payload: parsePayload(row.payload),
  };
}

export function mapPostRow(row: DurableMysqlRow): BlogPost {
  const featuredImage =
    typeof row.featured_image === "string"
      ? (() => {
          try {
            return JSON.parse(row.featured_image as string);
          } catch {
            return null;
          }
        })()
      : (row.featured_image as BlogPost["featuredImage"]) ?? null;
  const ogImage =
    typeof row.og_image === "string"
      ? (() => {
          try {
            return JSON.parse(row.og_image as string);
          } catch {
            return null;
          }
        })()
      : (row.og_image as BlogPost["ogImage"]) ?? null;

  return sanitizePost({
    ...emptyPost(),
    id: asString(row.id),
    title: asString(row.title),
    slug: asString(row.slug),
    excerpt: asString(row.excerpt),
    content: asString(row.content, "<p></p>"),
    categoryId: row.category_id == null || row.category_id === "" ? null : asString(row.category_id),
    featuredImage,
    status: asString(row.status, "draft") as BlogPost["status"],
    featured: asBool(row.featured),
    publishedAt: row.published_at == null || row.published_at === "" ? null : asString(row.published_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    seoTitle: asString(row.seo_title),
    seoDescription: asString(row.seo_description),
    focusKeyword: asString(row.focus_keyword),
    canonicalUrl: asString(row.canonical_url),
    robotsIndex: row.robots_index == null ? true : asBool(row.robots_index),
    robotsFollow: row.robots_follow == null ? true : asBool(row.robots_follow),
    ogTitle: asString(row.og_title),
    ogDescription: asString(row.og_description),
    ogImage,
    sitemapInclude: row.sitemap_include == null ? true : asBool(row.sitemap_include),
  });
}

function assertParameterized(sql: string) {
  // Guard against accidental string concatenation of untrusted values into SQL text.
  if (sql.includes("${") || sql.includes("` +") || sql.includes("'+")) {
    throw new Error("A2 durable SQL must use bound parameters only.");
  }
}

/**
 * Build inactive MariaDB-backed deps for applyPrivateArticleViaCmsAdapter.
 * Never opens a real pool. physicalSchemaPresent=false → fail-closed trust.
 * Durable Apply txns additionally require a sealed H3B Evidence Pack assessment.
 */
export function createInactiveMysqlCmsApplyDeps(options: InactiveMysqlCmsApplyDepsOptions): {
  previewStore: CmsTrustedPreviewStore;
  approvalStore: CmsTrustedApprovalStore;
  transaction: CmsApplyTransactionRunner;
  spec: typeof A2_APPLY_DURABLE_MYSQL_SPEC;
  schemaRegisteredWithEnsure: typeof A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE;
  physicalSchemaPresent: boolean;
  evidenceAuthorization: InactiveMysqlEvidenceAuthorization;
} {
  void A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE;
  const schemaOk = options.physicalSchemaPresent === true;
  const evidenceAuthorization = authorizeInactiveMysqlApplyTrustedEvidencePack(
    options.trustedEvidencePack,
    options.evidencePackStatus,
  );

  const previewStore: CmsTrustedPreviewStore = {
    async getBySessionId(previewSessionId) {
      if (!schemaOk) return null;
      const id = String(previewSessionId || "").trim();
      if (!id) return null;
      assertParameterized(A2_APPLY_DURABLE_SQL.selectPreviewBySession);
      const rows = await options.facade.queryOutsideTxn(
        A2_APPLY_DURABLE_SQL.selectPreviewBySession,
        [id],
      );
      return rows[0] ? mapPreviewRow(rows[0]) : null;
    },
  };

  const approvalStore: CmsTrustedApprovalStore = {
    async getByReceiptId(receiptId) {
      if (!schemaOk) return null;
      const id = String(receiptId || "").trim();
      if (!id) return null;
      assertParameterized(A2_APPLY_DURABLE_SQL.selectApprovalByReceipt);
      const rows = await options.facade.queryOutsideTxn(
        A2_APPLY_DURABLE_SQL.selectApprovalByReceipt,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      if (!asBool(row.factual_review_confirmed)) return null;
      return mapApprovalRow(row);
    },
  };

  const transaction: CmsApplyTransactionRunner = {
    async runInTransaction(work) {
      if (!schemaOk) {
        throw new Error("CMS_APPLY_DURABLE_TXN_UNAVAILABLE");
      }
      // Evidence gate before any durable connection / mutation work.
      if (!evidenceAuthorization.ok) {
        throw new Error(
          `A2_INACTIVE_MYSQL_EVIDENCE_UNAUTHORIZED:${evidenceAuthorization.code}`,
        );
      }
      return options.facade.runInTransaction(async (exec) => {
        const ops = createMysqlCmsApplyTxnOps(exec, options.buildOperationKey);
        return work(ops);
      });
    },
  };

  return {
    previewStore,
    approvalStore,
    transaction,
    spec: A2_APPLY_DURABLE_MYSQL_SPEC,
    schemaRegisteredWithEnsure: A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
    physicalSchemaPresent: schemaOk,
    evidenceAuthorization,
  };
}

function createMysqlCmsApplyTxnOps(
  exec: DurableMysqlExecutor,
  buildOperationKey?: InactiveMysqlCmsApplyDepsOptions["buildOperationKey"],
): CmsApplyTxnOps {
  return {
    async lockPlanningForUpdate(planningDraftId) {
      assertParameterized(A2_APPLY_DURABLE_SQL.lockPlanning);
      const rows = await exec.query(A2_APPLY_DURABLE_SQL.lockPlanning, [planningDraftId]);
      return rows[0] ? mapPlanningRow(rows[0]) : null;
    },
    async lockBlogPostForUpdate(postId) {
      assertParameterized(A2_APPLY_DURABLE_SQL.lockBlog);
      const rows = await exec.query(A2_APPLY_DURABLE_SQL.lockBlog, [postId]);
      return rows[0] ? mapPostRow(rows[0]) : null;
    },
    async findBlogPostBySlug(slug, excludePostId = "") {
      assertParameterized(A2_APPLY_DURABLE_SQL.findSlug);
      const rows = await exec.query(A2_APPLY_DURABLE_SQL.findSlug, [slug, excludePostId || ""]);
      if (!rows[0]) return null;
      // Minimal identity for collision detection; full row not required.
      return mapPostRow({
        id: rows[0].id,
        title: "",
        slug,
        excerpt: "",
        content: "<p></p>",
        status: "draft",
        published_at: null,
      });
    },
    async listBlogPosts() {
      assertParameterized(A2_APPLY_DURABLE_SQL.listPosts);
      const rows = await exec.query(A2_APPLY_DURABLE_SQL.listPosts, []);
      return rows.map(mapPostRow);
    },
    async insertPrivateBlogDraft(post) {
      if (post.status !== "draft" || post.publishedAt) {
        throw new Error("Refuse non-private Blog insert");
      }
      assertParameterized(A2_APPLY_DURABLE_SQL.insertPost);
      await exec.execute(A2_APPLY_DURABLE_SQL.insertPost, [
        post.id,
        post.title,
        post.slug,
        post.excerpt,
        post.content,
        post.categoryId,
        JSON.stringify(post.featuredImage),
        post.featured ? 1 : 0,
        post.seoTitle,
        post.seoDescription,
        post.focusKeyword,
        post.canonicalUrl,
        post.robotsIndex ? 1 : 0,
        post.robotsFollow ? 1 : 0,
        post.ogTitle,
        post.ogDescription,
        JSON.stringify(post.ogImage),
        post.sitemapInclude ? 1 : 0,
      ]);
    },
    async updateEmptyShellContent({ postId, excerpt, html }) {
      assertParameterized(A2_APPLY_DURABLE_SQL.updateEmptyShell);
      const result = await exec.execute(A2_APPLY_DURABLE_SQL.updateEmptyShell, [
        excerpt,
        html,
        toMysqlDateTime(new Date().toISOString()),
        postId,
      ]);
      return { affectedRows: result.affectedRows };
    },
    async linkPlanningToPost({ planningDraftId, postId, updatedAt }) {
      assertParameterized(A2_APPLY_DURABLE_SQL.linkPlanning);
      const result = await exec.execute(A2_APPLY_DURABLE_SQL.linkPlanning, [
        postId,
        toMysqlDateTime(updatedAt),
        planningDraftId,
      ]);
      return { affectedRows: result.affectedRows };
    },
    async recordApplyAudit(audit: CmsApplyAuditRecord) {
      assertParameterized(A2_APPLY_DURABLE_SQL.insertAudit);
      const key =
        buildOperationKey?.({
          planningDraftId: audit.planningDraftId,
          previewSessionId: audit.previewSessionId,
          contentFingerprint: audit.contentFingerprint,
        }) ||
        `apply:${audit.planningDraftId}:${audit.previewSessionId}:${audit.contentFingerprint}:${audit.outcome}`;
      await exec.execute(A2_APPLY_DURABLE_SQL.insertAudit, [
        key,
        audit.planningDraftId,
        audit.postId,
        audit.previewSessionId,
        audit.approvalReceiptId,
        audit.generationId,
        audit.adminId,
        audit.writingFingerprint,
        audit.contentFingerprint,
        audit.outcome,
        audit.code,
        audit.detail.slice(0, 200),
        toMysqlDateTime(new Date().toISOString()),
      ]);
    },
  };
}

/**
 * Lock preview + approval inside an open txn (after Planning lock).
 * Used by tests / future wiring; optional helper for stricter concurrency.
 */
export async function lockPreviewAndApprovalInTxn(
  exec: DurableMysqlExecutor,
  args: { previewSessionId: string; approvalReceiptId: string },
): Promise<{
  preview: CmsTrustedPreviewProvenance | null;
  approval: CmsTrustedApplyApproval | null;
}> {
  assertParameterized(A2_APPLY_DURABLE_SQL.lockPreviewBySession);
  assertParameterized(A2_APPLY_DURABLE_SQL.lockApprovalByReceipt);
  const previewRows = await exec.query(A2_APPLY_DURABLE_SQL.lockPreviewBySession, [
    args.previewSessionId,
  ]);
  const approvalRows = await exec.query(A2_APPLY_DURABLE_SQL.lockApprovalByReceipt, [
    args.approvalReceiptId,
  ]);
  return {
    preview: previewRows[0] ? mapPreviewRow(previewRows[0]) : null,
    approval:
      approvalRows[0] && asBool(approvalRows[0].factual_review_confirmed)
        ? mapApprovalRow(approvalRows[0])
        : null,
  };
}

/**
 * In-memory fake MariaDB facade for offline tests of parameterized SQL orchestration.
 * Not a production authority. Simulates rollback on throw.
 */
export function createFakeDurableMysqlFacade(seed?: {
  previews?: DurableMysqlRow[];
  approvals?: DurableMysqlRow[];
  planning?: DurableMysqlRow[];
  posts?: DurableMysqlRow[];
  audits?: DurableMysqlRow[];
}): DurableMysqlTxnFacade & {
  lockLog: string[];
  sqlLog: Array<{ sql: string; params: unknown[] }>;
  snapshot(): {
    previews: DurableMysqlRow[];
    approvals: DurableMysqlRow[];
    planning: DurableMysqlRow[];
    posts: DurableMysqlRow[];
    audits: DurableMysqlRow[];
  };
} {
  let previews = new Map(
    (seed?.previews || []).map((r) => [asString(r.preview_session_id), { ...r }]),
  );
  let approvals = new Map((seed?.approvals || []).map((r) => [asString(r.receipt_id), { ...r }]));
  let planning = new Map((seed?.planning || []).map((r) => [asString(r.id), { ...r }]));
  let posts = new Map((seed?.posts || []).map((r) => [asString(r.id), { ...r }]));
  let audits = new Map(
    (seed?.audits || []).map((r) => [asString(r.apply_operation_key), { ...r }]),
  );
  const lockLog: string[] = [];
  const sqlLog: Array<{ sql: string; params: unknown[] }> = [];
  let chain: Promise<unknown> = Promise.resolve();

  const snapshot = () => ({
    previews: [...previews.values()].map((r) => ({ ...r })),
    approvals: [...approvals.values()].map((r) => ({ ...r })),
    planning: [...planning.values()].map((r) => ({ ...r })),
    posts: [...posts.values()].map((r) => ({ ...r })),
    audits: [...audits.values()].map((r) => ({ ...r })),
  });

  function runQuery(
    live: {
      previews: Map<string, DurableMysqlRow>;
      approvals: Map<string, DurableMysqlRow>;
      planning: Map<string, DurableMysqlRow>;
      posts: Map<string, DurableMysqlRow>;
      audits: Map<string, DurableMysqlRow>;
    },
    sql: string,
    params: unknown[],
  ): DurableMysqlRow[] {
    sqlLog.push({ sql, params: [...params] });
    if (sql.includes(`FROM ${A2_APPLY_PREVIEW_TABLE}`) && sql.includes("preview_session_id = ?")) {
      if (sql.includes("FOR UPDATE")) lockLog.push(`preview_for_update:${params[0]}`);
      const row = live.previews.get(asString(params[0]));
      return row ? [{ ...row }] : [];
    }
    if (sql.includes(`FROM ${A2_APPLY_APPROVAL_TABLE}`) && sql.includes("receipt_id = ?")) {
      if (sql.includes("FOR UPDATE")) lockLog.push(`approval_for_update:${params[0]}`);
      const row = live.approvals.get(asString(params[0]));
      return row ? [{ ...row }] : [];
    }
    if (sql.includes("FROM seo_planning_drafts") && sql.includes("FOR UPDATE")) {
      lockLog.push(`planning_for_update:${params[0]}`);
      const row = live.planning.get(asString(params[0]));
      return row ? [{ ...row }] : [];
    }
    if (sql.includes("FROM blog_posts WHERE id = ?") && sql.includes("FOR UPDATE")) {
      lockLog.push(`blog_for_update:${params[0]}`);
      const row = live.posts.get(asString(params[0]));
      return row ? [{ ...row }] : [];
    }
    if (sql.includes("FROM blog_posts WHERE slug = ?")) {
      const slug = asString(params[0]);
      const exclude = asString(params[1]);
      const hit = [...live.posts.values()].find(
        (p) => asString(p.slug) === slug && asString(p.id) !== exclude,
      );
      return hit ? [{ id: hit.id }] : [];
    }
    if (sql.includes("FROM blog_posts") && !sql.includes("WHERE")) {
      return [...live.posts.values()].map((r) => ({ ...r }));
    }
    if (sql.includes(`FROM ${A2_APPLY_AUDIT_TABLE}`) && sql.includes("apply_operation_key = ?")) {
      const row = live.audits.get(asString(params[0]));
      return row ? [{ ...row }] : [];
    }
    return [];
  }

  function runExecute(
    live: {
      previews: Map<string, DurableMysqlRow>;
      approvals: Map<string, DurableMysqlRow>;
      planning: Map<string, DurableMysqlRow>;
      posts: Map<string, DurableMysqlRow>;
      audits: Map<string, DurableMysqlRow>;
    },
    sql: string,
    params: unknown[],
  ): { affectedRows: number } {
    sqlLog.push({ sql, params: [...params] });
    if (sql.startsWith("INSERT INTO blog_posts")) {
      const id = asString(params[0]);
      if (live.posts.has(id)) throw new Error("duplicate post id");
      live.posts.set(id, {
        id,
        title: params[1],
        slug: params[2],
        excerpt: params[3],
        content: params[4],
        category_id: params[5],
        featured_image: params[6],
        status: "draft",
        featured: params[7],
        published_at: null,
        seo_title: params[8],
        seo_description: params[9],
        focus_keyword: params[10],
        canonical_url: params[11],
        robots_index: params[12],
        robots_follow: params[13],
        og_title: params[14],
        og_description: params[15],
        og_image: params[16],
        sitemap_include: params[17],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE blog_posts SET excerpt")) {
      const postId = asString(params[3]);
      const current = live.posts.get(postId);
      if (!current || asString(current.status) !== "draft" || current.published_at) {
        return { affectedRows: 0 };
      }
      const content = asString(current.content).replace(/\s+/g, "").toLowerCase();
      const empty = new Set(["", "<p></p>", "<p><br></p>", "<p><br/></p>", "<p>&nbsp;</p>"]);
      if (!empty.has(content) || asString(current.excerpt).trim() !== "") {
        return { affectedRows: 0 };
      }
      live.posts.set(postId, {
        ...current,
        excerpt: params[0],
        content: params[1],
        status: "draft",
        published_at: null,
        updated_at: params[2],
      });
      return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE seo_planning_drafts SET linked_post_id")) {
      const planningId = asString(params[2]);
      const row = live.planning.get(planningId);
      if (!row || row.linked_post_id || row.archived_at) return { affectedRows: 0 };
      live.planning.set(planningId, {
        ...row,
        linked_post_id: params[0],
        updated_at: params[1],
      });
      return { affectedRows: 1 };
    }
    if (sql.startsWith(`INSERT INTO ${A2_APPLY_AUDIT_TABLE}`)) {
      const key = asString(params[0]);
      if (live.audits.has(key)) throw new Error("SEO_AI_ARTICLE_CMS_APPLY_AUDIT_FAILED");
      live.audits.set(key, {
        apply_operation_key: key,
        planning_draft_id: params[1],
        post_id: params[2],
        preview_session_id: params[3],
        approval_receipt_id: params[4],
        generation_id: params[5],
        admin_id: params[6],
        writing_fingerprint: params[7],
        content_fingerprint: params[8],
        outcome: params[9],
        result_code: params[10],
        detail: params[11],
        publication_ready: 0,
        created_at: params[12],
      });
      return { affectedRows: 1 };
    }
    return { affectedRows: 0 };
  }

  return {
    lockLog,
    sqlLog,
    snapshot,
    async queryOutsideTxn(sql, params) {
      return runQuery(
        { previews, approvals, planning, posts, audits },
        sql,
        params,
      );
    },
    async runInTransaction(work) {
      const run = async () => {
        const before = {
          previews: new Map([...previews.entries()].map(([k, v]) => [k, { ...v }])),
          approvals: new Map([...approvals.entries()].map(([k, v]) => [k, { ...v }])),
          planning: new Map([...planning.entries()].map(([k, v]) => [k, { ...v }])),
          posts: new Map([...posts.entries()].map(([k, v]) => [k, { ...v }])),
          audits: new Map([...audits.entries()].map(([k, v]) => [k, { ...v }])),
        };
        const live = {
          previews: new Map([...previews.entries()].map(([k, v]) => [k, { ...v }])),
          approvals: new Map([...approvals.entries()].map(([k, v]) => [k, { ...v }])),
          planning: new Map([...planning.entries()].map(([k, v]) => [k, { ...v }])),
          posts: new Map([...posts.entries()].map(([k, v]) => [k, { ...v }])),
          audits: new Map([...audits.entries()].map(([k, v]) => [k, { ...v }])),
        };
        const exec: DurableMysqlExecutor = {
          async query(sql, params) {
            return runQuery(live, sql, params);
          },
          async execute(sql, params) {
            return runExecute(live, sql, params);
          },
        };
        try {
          const result = await work(exec);
          previews = live.previews;
          approvals = live.approvals;
          planning = live.planning;
          posts = live.posts;
          audits = live.audits;
          return result;
        } catch (error) {
          previews = before.previews;
          approvals = before.approvals;
          planning = before.planning;
          posts = before.posts;
          audits = before.audits;
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
}
