/**
 * Future single-article publisher interface — DESIGN ONLY / INACTIVE.
 *
 * Reuses existing Blog + PrePublish QA surfaces. Does NOT:
 * - publish, unpublish, or schedule
 * - expose a Server Action or cron worker
 * - open the A2 Apply production gate
 * - bypass RBAC, budgets, or HOLD/REFRESH protection
 *
 * A separately authorized activation task must wire an implementation that
 * calls existing CMS publish helpers after PrePublish QA passes.
 */

import type { PrePublishQaResult } from "@/lib/cms/seo-prepublish-qa-types";
import type { BlogPost } from "@/lib/cms/types";

export const SEO_AI_ONESHOT_PUBLISHER_SPEC = "a2-oneshot-publisher-interface-v1" as const;

/** Compile-time OFF — env/request cannot activate. */
export const SEO_AI_ONESHOT_PUBLISHER_ACTIVATED = false as const;

export const SEO_AI_ONESHOT_PUBLISHER_OFF_MESSAGE =
  "Single-article publisher is inactive. Supervised Manual Publish remains the only publication path.";

export const SEO_AI_ONESHOT_PUBLISHER_OFF_CODE = "publisher_inactive" as const;

/** Hard per-execution ceilings for a future supervised pilot. */
export const SEO_AI_ONESHOT_PUBLISHER_LIMITS = {
  maxArticlesPerExecution: 1,
  maxPaidProviderCallsPerExecution: 0,
  requirePrePublishQaPass: true,
  allowRefreshOrRestore: false,
  allowEditorialHold: false,
  allowAutonomousRecurringSchedule: false,
} as const;

export type OneshotPublisherActor = {
  adminId: string;
  hasSeoPermission: boolean;
  hasBlogPermission: boolean;
};

export type OneshotPublisherArticleRef = {
  /** Must already be a private draft from supervised Apply — never invent posts. */
  postId: string;
  planningDraftId: string;
  contentFingerprint: string;
  recommendation: "NEW_BLOG";
};

export type OneshotPublisherBudget = {
  maxArticles: 1;
  maxPaidProviderCalls: 0;
  emergencyOff: boolean;
};

export type OneshotPublisherRequest = {
  actor: OneshotPublisherActor;
  article: OneshotPublisherArticleRef;
  budget: OneshotPublisherBudget;
  /** Opaque operator acknowledgement — not client approved=true. */
  supervisedPublicationReceiptId: string;
};

export type OneshotPublisherAudit = {
  spec: typeof SEO_AI_ONESHOT_PUBLISHER_SPEC;
  adminId: string;
  postId: string | null;
  planningDraftId: string | null;
  outcome: "published" | "blocked" | "rolled_back" | "noop";
  code: string | null;
  detail: string;
  publicationReady: false;
  recurringSchedulerTouched: false;
};

export type OneshotPublisherSuccess = {
  ok: true;
  spec: typeof SEO_AI_ONESHOT_PUBLISHER_SPEC;
  postId: string;
  status: "published";
  prePublishQa: PrePublishQaResult;
  audit: OneshotPublisherAudit;
  /** Future rollback handle — never auto-invoked here. */
  rollbackHint: {
    strategy: "revert_to_draft_status";
    previousStatus: "draft";
  };
};

export type OneshotPublisherFailure = {
  ok: false;
  spec: typeof SEO_AI_ONESHOT_PUBLISHER_SPEC;
  code:
    | typeof SEO_AI_ONESHOT_PUBLISHER_OFF_CODE
    | "unauthorized"
    | "access_denied"
    | "budget_exceeded"
    | "emergency_off"
    | "prepublish_blocked"
    | "ineligible_recommendation"
    | "hold_rejected"
    | "duplicate_publish"
    | "invalid_input";
  error: string;
  prePublishQa: PrePublishQaResult | null;
  audit: OneshotPublisherAudit;
};

export type OneshotPublisherResult = OneshotPublisherSuccess | OneshotPublisherFailure;

/**
 * Contract a future worker must satisfy. Implementations belong in a later task
 * that reuses `evaluatePrePublishQa` + existing Blog status updates.
 */
export type OneshotArticlePublisher = {
  readonly activated: false | true;
  publishOne(request: OneshotPublisherRequest): Promise<OneshotPublisherResult>;
  /**
   * Safe rollback for a prior oneshot publication by the same receipt/audit key.
   * Must not cascade to unrelated posts.
   */
  rollbackOne(args: {
    postId: string;
    supervisedPublicationReceiptId: string;
    actor: OneshotPublisherActor;
  }): Promise<OneshotPublisherResult>;
};

function inactiveAudit(partial?: Partial<OneshotPublisherAudit>): OneshotPublisherAudit {
  return {
    spec: SEO_AI_ONESHOT_PUBLISHER_SPEC,
    adminId: partial?.adminId || "",
    postId: partial?.postId ?? null,
    planningDraftId: partial?.planningDraftId ?? null,
    outcome: "blocked",
    code: SEO_AI_ONESHOT_PUBLISHER_OFF_CODE,
    detail: SEO_AI_ONESHOT_PUBLISHER_OFF_MESSAGE.slice(0, 200),
    publicationReady: false,
    recurringSchedulerTouched: false,
  };
}

/**
 * Inactive publisher stub. Always fail-closed. Never mutates Blog rows.
 */
export const inactiveOneshotArticlePublisher: OneshotArticlePublisher = {
  activated: false,
  async publishOne(request) {
    void request;
    return {
      ok: false,
      spec: SEO_AI_ONESHOT_PUBLISHER_SPEC,
      code: SEO_AI_ONESHOT_PUBLISHER_OFF_CODE,
      error: SEO_AI_ONESHOT_PUBLISHER_OFF_MESSAGE,
      prePublishQa: null,
      audit: inactiveAudit({
        adminId: String(request?.actor?.adminId || ""),
        postId: String(request?.article?.postId || "") || null,
        planningDraftId: String(request?.article?.planningDraftId || "") || null,
      }),
    };
  },
  async rollbackOne(args) {
    void args;
    return {
      ok: false,
      spec: SEO_AI_ONESHOT_PUBLISHER_SPEC,
      code: SEO_AI_ONESHOT_PUBLISHER_OFF_CODE,
      error: SEO_AI_ONESHOT_PUBLISHER_OFF_MESSAGE,
      prePublishQa: null,
      audit: inactiveAudit({
        adminId: String(args?.actor?.adminId || ""),
        postId: String(args?.postId || "") || null,
      }),
    };
  },
};

/** Guard for future wiring — rejects non-draft / published shells without publishing. */
export function oneshotPublisherRejectsPublishedPost(post: Pick<BlogPost, "status" | "publishedAt">) {
  return post.status === "published" || Boolean(post.publishedAt);
}

export function isOneshotPublisherActivated() {
  return Boolean(SEO_AI_ONESHOT_PUBLISHER_ACTIVATED);
}
