/**
 * Server-only CMS reader for Decision Pipeline run context.
 * At most one Blog list + one active Planning list per call.
 * Zero writes. Do not import from Client Components.
 */

import "server-only";

import { cms } from "@/lib/cms/repository";
import { createSeoDecisionPipelineContextFromData } from "@/lib/cms/seo-decision-pipeline/context";
import type { SeoDecisionPipelineContext } from "@/lib/cms/seo-decision-pipeline/types";

/**
 * Server context builder — one Blog list + one active Planning list.
 * Read-only. Zero writes. Zero providers / GSC calls.
 */
export async function buildSeoDecisionPipelineContextFromCms(args?: {
  runId?: string;
  categoryNameById?: ReadonlyMap<string, string>;
}): Promise<SeoDecisionPipelineContext> {
  const [posts, planningDrafts, categories] = await Promise.all([
    cms.listPosts(),
    cms.listSeoPlanningDrafts({ lifecycle: "active" }),
    args?.categoryNameById ? Promise.resolve(null) : cms.listCategories(),
  ]);

  const categoryNameById =
    args?.categoryNameById ||
    new Map((categories || []).map((c) => [c.id, c.name]));

  return createSeoDecisionPipelineContextFromData({
    posts,
    planningDrafts,
    categoryNameById,
    runId: args?.runId,
  });
}
