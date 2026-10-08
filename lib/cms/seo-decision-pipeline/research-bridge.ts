/**
 * Server-only Research + Decision Pipeline bridge.
 * Existing Research once → Pipeline context once → batch evaluate.
 * Zero writes. Zero extra OpenAI/GSC calls beyond Research.
 */

import "server-only";

import { researchUkContentOpportunitiesFromCms } from "@/lib/cms/ai-seo/research-run";
import { combineResearchWithDecisionPipeline } from "@/lib/cms/seo-decision-pipeline/research-bridge-core";
import type { ResearchUkOpportunitiesWithPipelineResult } from "@/lib/cms/seo-decision-pipeline/research-bridge-types";
import { buildSeoDecisionPipelineContextFromCms } from "@/lib/cms/seo-decision-pipeline/context-cms";
import { evaluateSeoOpportunityPipelineBatch } from "@/lib/cms/seo-decision-pipeline/evaluate";

type ResearchFromCmsArgs = Parameters<typeof researchUkContentOpportunitiesFromCms>[0];

/**
 * Existing bounded Research + Decision Pipeline evaluation in one server call.
 * Preserves researchUkContentOpportunitiesFromCms for reuse.
 * Manual Research action and future autonomous orchestrator share this path.
 */
export async function researchUkContentOpportunitiesWithDecisionPipelineFromCms(
  args: ResearchFromCmsArgs & { runId?: string },
): Promise<ResearchUkOpportunitiesWithPipelineResult> {
  const { runId, ...researchArgs } = args;
  const researchResult = await researchUkContentOpportunitiesFromCms(researchArgs);

  return combineResearchWithDecisionPipeline({
    researchResult,
    buildContext: () =>
      buildSeoDecisionPipelineContextFromCms({
        runId,
      }),
    evaluateBatch: evaluateSeoOpportunityPipelineBatch,
  });
}
