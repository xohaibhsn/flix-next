/**
 * Research ↔ Decision Pipeline bridge — serializable attachment contracts.
 * Pure types only. Safe for action return typing without server-only imports.
 */

import type {
  ResearchUkOpportunitiesFailure,
  ResearchUkOpportunitiesSuccess,
} from "@/lib/cms/ai-seo/research";
import type {
  SeoDecisionPipelineEvaluationStatus,
  SeoDecisionPipelineResult,
  SeoDecisionPipelineVersion,
} from "@/lib/cms/seo-decision-pipeline/types";

export const SEO_RESEARCH_DECISION_PIPELINE_RUN_STATUSES = ["OK", "CONTEXT_ERROR"] as const;
export type SeoResearchDecisionPipelineRunStatus =
  (typeof SEO_RESEARCH_DECISION_PIPELINE_RUN_STATUSES)[number];

/** One opportunity evaluation row returned with Research (bounded / serializable). */
export type SeoResearchDecisionPipelineEvaluation = {
  /** Index into Research `opportunities` (same order). */
  opportunityIndex: number;
  opportunityIdentity: string;
  evaluationStatus: SeoDecisionPipelineEvaluationStatus;
  pipelineFingerprint: string;
  /** Compact opportunity identity slice from Adapter (not full Research row). */
  opportunity: SeoDecisionPipelineResult["opportunity"];
  refreshFirst: SeoDecisionPipelineResult["refreshFirst"];
  nextBestAction: SeoDecisionPipelineResult["nextBestAction"];
  priority: SeoDecisionPipelineResult["priority"];
  resolvedTarget: SeoDecisionPipelineResult["resolvedTarget"];
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Run-level Decision Pipeline attachment on a successful Research result.
 * Additive — existing clients that only read `research` keep working.
 */
export type SeoResearchDecisionPipelineAttachment = {
  pipelineVersion: SeoDecisionPipelineVersion;
  runStatus: SeoResearchDecisionPipelineRunStatus;
  evaluations: SeoResearchDecisionPipelineEvaluation[];
  errorCode?: string;
  errorMessage?: string;
};

export type ResearchUkOpportunitiesWithPipelineSuccess = ResearchUkOpportunitiesSuccess & {
  decisionPipeline: SeoResearchDecisionPipelineAttachment;
};

export type ResearchUkOpportunitiesWithPipelineResult =
  | ResearchUkOpportunitiesWithPipelineSuccess
  | ResearchUkOpportunitiesFailure;
