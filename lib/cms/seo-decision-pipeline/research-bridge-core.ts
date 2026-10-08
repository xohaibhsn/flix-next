/**
 * Pure Research ↔ Decision Pipeline combination helper.
 * Zero I/O — callers inject Research result + context build + evaluate.
 * Safe for unit tests without CMS/providers/server-only.
 */

import type {
  ResearchUkOpportunitiesResult,
  ResearchUkOpportunitiesSuccess,
} from "@/lib/cms/ai-seo/research";
import type { SeoResearchOpportunity } from "@/lib/cms/ai-seo/research-schemas";
import {
  SEO_DECISION_PIPELINE_VERSION,
  type SeoDecisionPipelineBatchResult,
  type SeoDecisionPipelineContext,
  type SeoDecisionPipelineResult,
} from "@/lib/cms/seo-decision-pipeline/types";
import type {
  ResearchUkOpportunitiesWithPipelineResult,
  SeoResearchDecisionPipelineAttachment,
  SeoResearchDecisionPipelineEvaluation,
} from "@/lib/cms/seo-decision-pipeline/research-bridge-types";

function sanitizeBridgeError(error: unknown): { errorCode: string; errorMessage: string } {
  // Never echo raw CMS/provider/exception text into the action payload.
  // Keep a bounded generic message; errorCode identifies the failure class.
  void error;
  return {
    errorCode: "pipeline_context_error",
    errorMessage: "Decision pipeline context failed.",
  };
}

export function toResearchDecisionPipelineEvaluation(
  result: SeoDecisionPipelineResult,
  opportunityIndex: number,
): SeoResearchDecisionPipelineEvaluation {
  return {
    opportunityIndex,
    opportunityIdentity: result.opportunityIdentity,
    evaluationStatus: result.evaluationStatus,
    pipelineFingerprint: result.pipelineFingerprint,
    opportunity: result.opportunity,
    refreshFirst: result.refreshFirst,
    nextBestAction: result.nextBestAction,
    priority: result.priority,
    resolvedTarget: result.resolvedTarget,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  };
}

export function buildOkDecisionPipelineAttachment(
  batch: SeoDecisionPipelineBatchResult,
): SeoResearchDecisionPipelineAttachment {
  return {
    pipelineVersion: batch.pipelineVersion || SEO_DECISION_PIPELINE_VERSION,
    runStatus: "OK",
    evaluations: batch.results.map((row, index) =>
      toResearchDecisionPipelineEvaluation(row, index),
    ),
  };
}

export function buildContextErrorDecisionPipelineAttachment(
  error: unknown,
): SeoResearchDecisionPipelineAttachment {
  const sanitized = sanitizeBridgeError(error);
  return {
    pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
    runStatus: "CONTEXT_ERROR",
    evaluations: [],
    errorCode: sanitized.errorCode,
    errorMessage: sanitized.errorMessage,
  };
}

/**
 * Attach Decision Pipeline evaluations to a Research result.
 * Research failure passes through unchanged (no context build).
 * Context failure preserves Research and sets runStatus=CONTEXT_ERROR.
 */
export async function combineResearchWithDecisionPipeline(args: {
  researchResult: ResearchUkOpportunitiesResult;
  buildContext: () => SeoDecisionPipelineContext | Promise<SeoDecisionPipelineContext>;
  evaluateBatch: (
    context: SeoDecisionPipelineContext,
    opportunities: readonly SeoResearchOpportunity[],
  ) => SeoDecisionPipelineBatchResult;
}): Promise<ResearchUkOpportunitiesWithPipelineResult> {
  const researchResult = args.researchResult;
  if (!researchResult.ok) {
    return researchResult;
  }
  return attachPipelineToSuccessfulResearch({
    research: researchResult,
    buildContext: args.buildContext,
    evaluateBatch: args.evaluateBatch,
  });
}

async function attachPipelineToSuccessfulResearch(args: {
  research: ResearchUkOpportunitiesSuccess;
  buildContext: () => SeoDecisionPipelineContext | Promise<SeoDecisionPipelineContext>;
  evaluateBatch: (
    context: SeoDecisionPipelineContext,
    opportunities: readonly SeoResearchOpportunity[],
  ) => SeoDecisionPipelineBatchResult;
}): Promise<ResearchUkOpportunitiesWithPipelineResult> {
  try {
    const context = await args.buildContext();
    const batch = args.evaluateBatch(context, args.research.research.opportunities);
    return {
      ...args.research,
      decisionPipeline: buildOkDecisionPipelineAttachment(batch),
    };
  } catch (error) {
    return {
      ...args.research,
      decisionPipeline: buildContextErrorDecisionPipelineAttachment(error),
    };
  }
}
