/**
 * A2 Private Apply — LOCAL / OFFLINE mocked server-side boundary.
 *
 * Injected actor, trusted approval, trusted preview provenance, and an
 * in-memory transactional catalog only. Does NOT:
 * - expose a production Server Action, API route, or Apply UI button
 * - perform real MySQL / CMS / Blog I/O
 * - call OpenAI / Gemini / GSC
 * - prove MariaDB transaction safety or cross-worker exclusion
 *
 * Production activation still requires: durable preview provenance, audited
 * approval store, real RBAC session resolution, MariaDB atomic Apply, and
 * feature-gated wiring — none of which are activated here.
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
import { digestNormalizedArticleContentV1 } from "@/lib/cms/seo-planning/article-content-fingerprint";
import {
  parsePrivateArticlePreview,
  type PrivateArticlePreview,
} from "@/lib/cms/seo-planning/article-generation";
import { resolveNewBlogHandoffSlug, seoPlanningBlogEditorPath } from "@/lib/cms/seo-planning/handoff";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC = "a2-private-apply-local-v1" as const;

export const SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES = {
  missingSeoPermission: "SEO permission is required for private Blog Apply.",
  missingBlogPermission: "Blog permission is required for private Blog Apply.",
  missingApproval: "Trusted server-side human approval is required before private Blog Apply.",
  forgedApproval: "Client-only or mismatched approval cannot authorize private Blog Apply.",
  staleApproval: "Approval no longer matches the current Planning preview or article content.",
  provenanceUnavailable:
    "Trusted server-owned preview provenance is unavailable. Private Apply fails closed until durable provenance exists.",
  provenanceMismatch: "Client preview does not match trusted server-owned preview provenance.",
  readinessBlocked: "Apply readiness blocked the private Blog Apply. No draft was written.",
  transactionFailed: "The mocked Apply transaction could not complete safely. No partial state was kept.",
  writeFreeze: CMS_WRITE_FREEZE_MESSAGE,
  evidencePackUnavailable: SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackUnavailable,
} as const;

export type PrivateApplyLocalErrorCode =
  | ArticleApplyReadinessBlockCode
  | "unauthorized"
  | "access_denied"
  | "missing_approval"
  | "forged_approval"
  | "stale_approval"
  | "preview_provenance_unavailable"
  | "preview_provenance_mismatch"
  | "readiness_blocked"
  | "transaction_failed"
  | "invalid_input"
  | typeof CMS_WRITE_FREEZE_CODE;

/** Injected trusted actor — must come from server session in production; fixtures in tests. */
export type TrustedPrivateApplyActor = {
  adminId: string;
  hasSeoPermission: boolean;
  hasBlogPermission: boolean;
};

/**
 * Server-issued approval binding. Not established by client approvedByAdminId alone.
 * Tests inject this; production must load from an audited approval store.
 */
export type TrustedPrivateApplyApproval = {
  planningDraftId: string;
  planningUpdatedAt: string;
  writingFingerprint: string;
  contentFingerprint: string;
  previewSessionId: string;
  factualReviewConfirmed: true;
  approvedByAdminId: string;
  approvedAt: string;
};

/**
 * Server-owned preview provenance issued when the private preview was generated.
 * Without this record, Apply fails closed (no invented trust from client IDs).
 */
export type TrustedPreviewProvenance = {
  previewSessionId: string;
  planningDraftId: string;
  planningUpdatedAt: string;
  writingFingerprint: string;
  contentFingerprint: string;
  model: string;
};

export type PrivateApplyLocalAudit = {
  spec: typeof SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC;
  adminId: string;
  planningDraftId: string;
  writingFingerprint: string;
  contentFingerprint: string;
  previewSessionId: string | null;
  factualReviewConfirmed: boolean;
  outcome: "created" | "updated" | "noop" | "blocked" | "failed";
  postId: string | null;
  code: PrivateApplyLocalErrorCode | null;
  /** Sanitized message only — never raw HTML or secrets. */
  detail: string;
  simulatedPersistence: false;
  publicationReady: false;
};

export type PrivateApplyLocalSuccess = {
  ok: true;
  spec: typeof SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC;
  outcome: "created" | "updated" | "noop";
  postId: string;
  editorPath: string;
  status: "draft";
  publishedAt: null;
  publicationReady: false;
  /** True only for the in-memory mock store — never real CMS. */
  simulatedBlogSaved: boolean;
  realCmsWrite: false;
  committed: true;
  audit: PrivateApplyLocalAudit;
  readiness: ArticleApplyReadinessResult;
  providerRequests: 0;
};

export type PrivateApplyLocalFailure = {
  ok: false;
  spec: typeof SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC;
  outcome: "blocked" | "failed";
  error: string;
  code: PrivateApplyLocalErrorCode;
  status: "BLOCKED";
  publicationReady: false;
  simulatedBlogSaved: false;
  realCmsWrite: false;
  committed: false;
  audit: PrivateApplyLocalAudit;
  readiness: ArticleApplyReadinessResult | null;
  providerRequests: 0;
};

export type PrivateApplyLocalResult = PrivateApplyLocalSuccess | PrivateApplyLocalFailure;

export type PrivateApplyLocalTx = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getPostById(id: string): Promise<BlogPost | null>;
  listPosts(): Promise<BlogPost[]>;
  createLinkedPrivateDraft(args: {
    planningDraftId: string;
    post: BlogPost;
  }): Promise<{ post: BlogPost; planning: SeoPlanningDraft }>;
  updateLinkedPrivateDraftContent(args: {
    planningDraftId: string;
    postId: string;
    title: string;
    excerpt: string;
    html: string;
  }): Promise<BlogPost>;
};

export type PrivateApplyLocalCatalog = {
  /**
   * Single mocked atomic boundary. Implementations must roll back on throw.
   * Does not prove MariaDB / cross-worker safety.
   */
  runInTransaction<T>(fn: (tx: PrivateApplyLocalTx) => Promise<T>): Promise<T>;
};

export function fingerprintPrivateApplyContent(article: {
  title: string;
  excerpt: string;
  html: string;
}): string {
  // Canonical approved-article identity (a2-content-fingerprint-v1).
  // Callers must pass normalizeGeneratedArticle output — never raw client fields.
  return digestNormalizedArticleContentV1(article);
}

function fail(
  code: PrivateApplyLocalErrorCode,
  error: string,
  audit: PrivateApplyLocalAudit,
  readiness: ArticleApplyReadinessResult | null = null,
): PrivateApplyLocalFailure {
  return {
    ok: false,
    spec: SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC,
    outcome: code === "transaction_failed" ? "failed" : "blocked",
    error,
    code,
    status: "BLOCKED",
    publicationReady: false,
    simulatedBlogSaved: false,
    realCmsWrite: false,
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

function baseAudit(args: {
  adminId: string;
  planningDraftId: string;
  writingFingerprint: string;
  contentFingerprint: string;
  previewSessionId: string | null;
  factualReviewConfirmed: boolean;
}): PrivateApplyLocalAudit {
  return {
    spec: SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC,
    adminId: args.adminId,
    planningDraftId: args.planningDraftId,
    writingFingerprint: args.writingFingerprint,
    contentFingerprint: args.contentFingerprint,
    previewSessionId: args.previewSessionId,
    factualReviewConfirmed: args.factualReviewConfirmed,
    outcome: "blocked",
    postId: null,
    code: null,
    detail: "",
    simulatedPersistence: false,
    publicationReady: false,
  };
}

/**
 * Local mocked private Apply. Callers must inject trusted actor/approval/provenance.
 * Client preview is never trusted solely from matching IDs/timestamps.
 */
export async function applyPrivateNewBlogArticleLocal(args: {
  /** Untrusted browser/client preview payload. */
  clientPreview: unknown;
  actor: TrustedPrivateApplyActor;
  /** Null → fail closed. */
  approval: TrustedPrivateApplyApproval | null | undefined;
  /** Null → fail closed (durable provenance not available). */
  provenance: TrustedPreviewProvenance | null | undefined;
  catalog: PrivateApplyLocalCatalog;
  editorialHold?: unknown;
  /**
   * @deprecated Untrusted hint — READY/HOLD strings never authorize Apply.
   * Prefer `trustedEvidencePack` from the H3B adapter.
   */
  evidencePackStatus?: "READY_FOR_DRAFTING_REVIEW" | "HOLD" | "ABSENT" | unknown;
  /** Server-sealed H3B assessment — plain objects are rejected by readiness. */
  trustedEvidencePack?: TrustedArticleEvidencePackAssessment | unknown;
  now?: string;
  createIdFn?: (prefix?: string) => string;
  /** Injected env for write-freeze tests; defaults to process.env. */
  writeFreezeEnv?: CmsWriteFreezeEnv;
}): Promise<PrivateApplyLocalResult> {
  const adminId = String(args.actor?.adminId || "").trim();
  const auditSeed = baseAudit({
    adminId,
    planningDraftId: "",
    writingFingerprint: "",
    contentFingerprint: "",
    previewSessionId: null,
    factualReviewConfirmed: false,
  });

  if (isCmsWriteFreezeActive(args.writeFreezeEnv ?? process.env)) {
    return fail(CMS_WRITE_FREEZE_CODE, SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.writeFreeze, auditSeed);
  }

  if (!adminId) {
    return fail("unauthorized", "A trusted admin actor is required.", auditSeed);
  }
  if (!args.actor.hasSeoPermission) {
    return fail(
      "access_denied",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.missingSeoPermission,
      { ...auditSeed, adminId },
    );
  }
  if (!args.actor.hasBlogPermission) {
    return fail(
      "access_denied",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.missingBlogPermission,
      { ...auditSeed, adminId },
    );
  }

  // Fail closed before any simulated Blog write: ABSENT/omitted/forged packs never Apply.
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
        ? SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.evidencePackHold
        : code === "untrusted_evidence_pack_claim"
          ? SEO_AI_ARTICLE_APPLY_READINESS_MESSAGES.untrustedEvidencePackClaim
          : SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.evidencePackUnavailable;
    return fail(code, message, { ...auditSeed, adminId });
  }

  if (!args.provenance) {
    return fail(
      "preview_provenance_unavailable",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.provenanceUnavailable,
      { ...auditSeed, adminId },
    );
  }
  const provenance = args.provenance;

  if (!args.approval) {
    return fail(
      "missing_approval",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.missingApproval,
      {
        ...auditSeed,
        adminId,
        planningDraftId: provenance.planningDraftId,
        writingFingerprint: provenance.writingFingerprint,
        contentFingerprint: provenance.contentFingerprint,
        previewSessionId: provenance.previewSessionId,
      },
    );
  }
  const approval = args.approval;

  if (approval.factualReviewConfirmed !== true) {
    return fail(
      "missing_factual_review",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.missingApproval,
      {
        ...auditSeed,
        adminId,
        planningDraftId: approval.planningDraftId,
        previewSessionId: approval.previewSessionId,
      },
    );
  }
  if (approval.approvedByAdminId !== adminId) {
    return fail(
      "forged_approval",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.forgedApproval,
      {
        ...auditSeed,
        adminId,
        planningDraftId: approval.planningDraftId,
        previewSessionId: approval.previewSessionId,
        factualReviewConfirmed: true,
      },
    );
  }

  const parsed = parsePrivateArticlePreview(args.clientPreview);
  if (!parsed.ok) {
    return fail("invalid_preview", parsed.error, {
      ...auditSeed,
      adminId,
      planningDraftId: approval.planningDraftId,
      previewSessionId: approval.previewSessionId,
      factualReviewConfirmed: true,
    });
  }
  const preview = parsed.preview;

  const sanitized = normalizeGeneratedArticle(preview.article);
  if (!sanitized) {
    return fail(
      "unsafe_html",
      "Article HTML failed CMS sanitize/bounds checks and cannot be applied.",
      {
        ...auditSeed,
        adminId,
        planningDraftId: preview.planningDraftId,
        writingFingerprint: preview.writingFingerprint,
        previewSessionId: provenance.previewSessionId,
        factualReviewConfirmed: true,
      },
    );
  }

  const contentFingerprint = fingerprintPrivateApplyContent(sanitized);
  const auditBase = baseAudit({
    adminId,
    planningDraftId: preview.planningDraftId,
    writingFingerprint: preview.writingFingerprint,
    contentFingerprint,
    previewSessionId: provenance.previewSessionId,
    factualReviewConfirmed: true,
  });

  // Provenance must bind the client preview to a server-owned session.
  if (
    provenance.previewSessionId !== approval.previewSessionId ||
    provenance.planningDraftId !== preview.planningDraftId ||
    provenance.planningUpdatedAt !== preview.planningUpdatedAt ||
    provenance.writingFingerprint !== preview.writingFingerprint ||
    provenance.contentFingerprint !== contentFingerprint ||
    provenance.model !== preview.model
  ) {
    return fail(
      "preview_provenance_mismatch",
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.provenanceMismatch,
      auditBase,
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
      SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.staleApproval,
      auditBase,
    );
  }

  try {
    return await args.catalog.runInTransaction(async (tx) => {
      const planning = await tx.getSeoPlanningDraftById(preview.planningDraftId);
      const linkedPost = planning?.linkedPostId
        ? await tx.getPostById(planning.linkedPostId)
        : null;
      const existingPosts = await tx.listPosts();

      // Trusted approval context for readiness — never clientApprovedFlag alone.
      const readiness = prepareArticleApplyReadiness({
        preview,
        planningDraft: planning,
        linkedPost,
        existingPosts,
        editorialHold: args.editorialHold,
        evidencePackStatus: args.evidencePackStatus,
        trustedEvidencePack: args.trustedEvidencePack,
        humanApproval: {
          factualReviewConfirmed: true,
          approvedByAdminId: adminId,
          clientApprovedFlag: false,
          claimPublicationReady: false,
          claimEvidencePackComplete: false,
          claimEvidenceVerified: false,
        },
      });

      // Only ok===true may proceed. Proposed payload on BLOCKED never authorizes writes.
      if (!readiness.ok) {
        const primary = readiness.blockingReasons[0];
        return fail(
          primary?.code || "readiness_blocked",
          primary?.message || SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.readinessBlocked,
          auditBase,
          readiness,
        );
      }

      const proposed = readiness.proposedPrivateBlogDraft;
      const now = args.now || new Date().toISOString();
      const mkId = args.createIdFn || createId;

      if (proposed.mode === "idempotent_already_applied") {
        const postId = proposed.linkedPostId || linkedPost?.id || "";
        return {
          ok: true as const,
          spec: SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC,
          outcome: "noop" as const,
          postId,
          editorPath: seoPlanningBlogEditorPath(postId),
          status: "draft" as const,
          publishedAt: null,
          publicationReady: false as const,
          simulatedBlogSaved: false,
          realCmsWrite: false as const,
          committed: true as const,
          audit: {
            ...auditBase,
            outcome: "noop",
            postId,
            code: null,
            detail: "Idempotent no-op — content already matches approved preview.",
          },
          readiness,
          providerRequests: 0 as const,
        };
      }

      if (proposed.mode === "update_linked_empty_shell") {
        const postId = proposed.linkedPostId;
        if (!postId) {
          return fail("linked_post_missing", "Linked private draft id is required.", auditBase, readiness);
        }
        const updated = await tx.updateLinkedPrivateDraftContent({
          planningDraftId: preview.planningDraftId,
          postId,
          title: proposed.title,
          excerpt: proposed.excerpt,
          html: proposed.content,
        });
        return {
          ok: true as const,
          spec: SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC,
          outcome: "updated" as const,
          postId: updated.id,
          editorPath: seoPlanningBlogEditorPath(updated.id),
          status: "draft" as const,
          publishedAt: null,
          publicationReady: false as const,
          simulatedBlogSaved: true,
          realCmsWrite: false as const,
          committed: true as const,
          audit: {
            ...auditBase,
            outcome: "updated",
            postId: updated.id,
            code: null,
            detail: "Updated untouched linked private handoff shell (in-memory mock only).",
          },
          readiness,
          providerRequests: 0 as const,
        };
      }

      // create_private_draft
      const slug = resolveNewBlogHandoffSlug({
        proposedSlug: planning?.proposedSlug || proposed.slug,
        workingTitle: planning?.workingTitle || proposed.title,
      });
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

      const { post } = await tx.createLinkedPrivateDraft({
        planningDraftId: preview.planningDraftId,
        post: createdPost,
      });

      return {
        ok: true as const,
        spec: SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC,
        outcome: "created" as const,
        postId: post.id,
        editorPath: seoPlanningBlogEditorPath(post.id),
        status: "draft" as const,
        publishedAt: null,
        publicationReady: false as const,
        simulatedBlogSaved: true,
        realCmsWrite: false as const,
        committed: true as const,
        audit: {
          ...auditBase,
          outcome: "created",
          postId: post.id,
          code: null,
          detail: "Created private Blog draft and Planning link (in-memory mock only).",
        },
        readiness,
        providerRequests: 0 as const,
      };
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message.slice(0, 200)
        : SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_MESSAGES.transactionFailed;
    return fail("transaction_failed", message, auditBase);
  }
}

/**
 * In-memory transactional catalog for offline tests only.
 * Serializes Apply calls; rolls back on throw. Not production MariaDB.
 */
export function createMemoryPrivateApplyCatalog(seed: {
  drafts: SeoPlanningDraft[];
  posts?: BlogPost[];
}): PrivateApplyLocalCatalog & {
  getDraft(id: string): SeoPlanningDraft | null;
  getPost(id: string): BlogPost | null;
  listPostsSync(): BlogPost[];
  snapshot(): { drafts: SeoPlanningDraft[]; posts: BlogPost[] };
} {
  let drafts = new Map(seed.drafts.map((d) => [d.id, structuredClone(d)]));
  let posts = new Map((seed.posts || []).map((p) => [p.id, structuredClone(p)]));
  let chain: Promise<unknown> = Promise.resolve();

  const snapshot = () => ({
    drafts: structuredClone([...drafts.values()]),
    posts: structuredClone([...posts.values()]),
  });

  const api = {
    getDraft(id: string) {
      const row = drafts.get(id);
      return row ? structuredClone(row) : null;
    },
    getPost(id: string) {
      const row = posts.get(id);
      return row ? structuredClone(row) : null;
    },
    listPostsSync() {
      return structuredClone([...posts.values()]);
    },
    snapshot,
    async runInTransaction<T>(fn: (tx: PrivateApplyLocalTx) => Promise<T>): Promise<T> {
      const run = async () => {
        const beforeDrafts = structuredClone([...drafts.entries()]);
        const beforePosts = structuredClone([...posts.entries()]);
        const liveDrafts = new Map(structuredClone([...drafts.entries()]));
        const livePosts = new Map(structuredClone([...posts.entries()]));

        const tx: PrivateApplyLocalTx = {
          async getSeoPlanningDraftById(id) {
            const row = liveDrafts.get(id);
            return row ? structuredClone(row) : null;
          },
          async getPostById(id) {
            const row = livePosts.get(id);
            return row ? structuredClone(row) : null;
          },
          async listPosts() {
            return structuredClone([...livePosts.values()]);
          },
          async createLinkedPrivateDraft({ planningDraftId, post }) {
            const planning = liveDrafts.get(planningDraftId);
            if (!planning) throw new Error("Planning draft missing during create.");
            if (planning.linkedPostId) throw new Error("Planning already linked during create.");
            if (livePosts.has(post.id)) throw new Error("Post id collision during create.");
            const slugOwner = [...livePosts.values()].find((p) => p.slug === post.slug);
            if (slugOwner) throw new Error("Slug collision during create.");
            const saved = structuredClone(post);
            livePosts.set(saved.id, saved);
            const nextPlanning = structuredClone({
              ...planning,
              linkedPostId: saved.id,
              updatedAt: new Date().toISOString(),
            });
            liveDrafts.set(planningDraftId, nextPlanning);
            return { post: structuredClone(saved), planning: structuredClone(nextPlanning) };
          },
          async updateLinkedPrivateDraftContent({ planningDraftId, postId, title, excerpt, html }) {
            const planning = liveDrafts.get(planningDraftId);
            if (!planning || planning.linkedPostId !== postId) {
              throw new Error("Planning link mismatch during update.");
            }
            const current = livePosts.get(postId);
            if (!current) throw new Error("Post missing during update.");
            const next = structuredClone({
              ...current,
              title: title || current.title,
              excerpt,
              content: html,
              status: "draft" as const,
              publishedAt: null,
              updatedAt: new Date().toISOString(),
            });
            livePosts.set(postId, next);
            return structuredClone(next);
          },
        };

        try {
          const result = await fn(tx);
          drafts = liveDrafts;
          posts = livePosts;
          return result;
        } catch (error) {
          drafts = new Map(beforeDrafts);
          posts = new Map(beforePosts);
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

/** Build trusted provenance + approval fixtures from a sanitized A1 preview. */
export function buildTrustedPrivateApplyBindings(args: {
  preview: PrivateArticlePreview;
  adminId: string;
  previewSessionId?: string;
  approvedAt?: string;
}): {
  provenance: TrustedPreviewProvenance;
  approval: TrustedPrivateApplyApproval;
  contentFingerprint: string;
} {
  const sanitized = normalizeGeneratedArticle(args.preview.article);
  if (!sanitized) {
    throw new Error("Fixture preview article must normalize.");
  }
  const contentFingerprint = fingerprintPrivateApplyContent(sanitized);
  const previewSessionId = args.previewSessionId || "preview_session_test_1";
  const provenance: TrustedPreviewProvenance = {
    previewSessionId,
    planningDraftId: args.preview.planningDraftId,
    planningUpdatedAt: args.preview.planningUpdatedAt,
    writingFingerprint: args.preview.writingFingerprint,
    contentFingerprint,
    model: args.preview.model,
  };
  const approval: TrustedPrivateApplyApproval = {
    planningDraftId: args.preview.planningDraftId,
    planningUpdatedAt: args.preview.planningUpdatedAt,
    writingFingerprint: args.preview.writingFingerprint,
    contentFingerprint,
    previewSessionId,
    factualReviewConfirmed: true,
    approvedByAdminId: args.adminId,
    approvedAt: args.approvedAt || "2026-10-21T00:00:00.000Z",
  };
  return { provenance, approval, contentFingerprint };
}
