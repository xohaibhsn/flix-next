/**
 * Controlled one-shot publisher runtime — complete validation path, activation OFF.
 *
 * Reuses Blog + PrePublish QA contracts. Never publishes while
 * SEO_AI_ONESHOT_PUBLISHER_ACTIVATED / master publisher path remain OFF.
 */

import {
  SEO_AI_ONESHOT_PUBLISHER_ACTIVATED,
  SEO_AI_ONESHOT_PUBLISHER_LIMITS,
  SEO_AI_ONESHOT_PUBLISHER_OFF_CODE,
  SEO_AI_ONESHOT_PUBLISHER_SPEC,
  inactiveOneshotArticlePublisher,
  oneshotPublisherRejectsPublishedPost,
  type OneshotArticlePublisher,
  type OneshotPublisherRequest,
  type OneshotPublisherResult,
} from "@/lib/cms/seo-planning/article-oneshot-publisher";
import { assertSeoAutomationPathAllowed } from "@/lib/cms/seo-automation/master-control";
import { authorizePilotSpend, emptyPilotUsage } from "@/lib/cms/seo-automation/budgets";
import type { BlogPost } from "@/lib/cms/types";
import type { PrePublishQaResult } from "@/lib/cms/seo-prepublish-qa-types";

export const SEO_AUTOMATION_ONESHOT_RUNTIME_SPEC = "seo-automation-oneshot-runtime-v1" as const;

export type OneshotPublisherRuntimeContext = {
  post: Pick<BlogPost, "id" | "status" | "publishedAt">;
  prePublishQa: PrePublishQaResult | null;
  publicationsUsedInPilot: number;
};

function refuse(
  request: OneshotPublisherRequest,
  error: string,
  prePublishQa: PrePublishQaResult | null,
): OneshotPublisherResult {
  return {
    ok: false,
    spec: SEO_AI_ONESHOT_PUBLISHER_SPEC,
    code: SEO_AI_ONESHOT_PUBLISHER_OFF_CODE,
    error,
    prePublishQa,
    audit: {
      spec: SEO_AI_ONESHOT_PUBLISHER_SPEC,
      adminId: String(request?.actor?.adminId || ""),
      postId: String(request?.article?.postId || "") || null,
      planningDraftId: String(request?.article?.planningDraftId || "") || null,
      outcome: "blocked",
      code: SEO_AI_ONESHOT_PUBLISHER_OFF_CODE,
      detail: error.slice(0, 200),
      publicationReady: false,
      recurringSchedulerTouched: false,
    },
  };
}

/**
 * Full preflight for one supervised publication. Always ends fail-closed while inactive.
 */
export async function evaluateAndRefuseOneshotPublication(
  request: OneshotPublisherRequest,
  ctx: OneshotPublisherRuntimeContext,
): Promise<OneshotPublisherResult> {
  if (!request?.actor?.adminId) {
    return refuse(request, "unauthorized", ctx.prePublishQa);
  }
  if (!request.actor.hasSeoPermission || !request.actor.hasBlogPermission) {
    return refuse(request, "access_denied", ctx.prePublishQa);
  }
  if (!String(request.supervisedPublicationReceiptId || "").trim()) {
    return refuse(request, "invalid_input", ctx.prePublishQa);
  }
  if (request.article.recommendation !== "NEW_BLOG") {
    return refuse(
      request,
      "REFRESH/RESTORE/HOLD cannot use the oneshot publisher.",
      ctx.prePublishQa,
    );
  }
  if (oneshotPublisherRejectsPublishedPost(ctx.post)) {
    return refuse(
      request,
      "Published Blog protection: oneshot publisher refuses overwrite.",
      ctx.prePublishQa,
    );
  }
  if (request.budget.emergencyOff || request.budget.maxArticles !== 1) {
    return refuse(request, "budget_exceeded", ctx.prePublishQa);
  }
  if (SEO_AI_ONESHOT_PUBLISHER_LIMITS.requirePrePublishQaPass) {
    if (!ctx.prePublishQa || ctx.prePublishQa.status !== "pass") {
      return refuse(request, "prepublish_blocked", ctx.prePublishQa);
    }
  }

  const path = assertSeoAutomationPathAllowed("publisher");
  if (!path.ok) {
    return refuse(request, path.error, ctx.prePublishQa);
  }

  const spend = authorizePilotSpend(
    { ...emptyPilotUsage(), supervisedPublications: ctx.publicationsUsedInPilot },
    "supervisedPublications",
    1,
  );
  if (!spend.ok) {
    return refuse(request, spend.error, ctx.prePublishQa);
  }

  void SEO_AI_ONESHOT_PUBLISHER_ACTIVATED;
  // Activation patch would call existing CMS publish helpers here.
  return inactiveOneshotArticlePublisher.publishOne(request);
}

export function getInactiveOneshotPublisher(): OneshotArticlePublisher {
  return inactiveOneshotArticlePublisher;
}
