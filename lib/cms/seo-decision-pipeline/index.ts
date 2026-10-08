/**
 * SEO Decision Pipeline Adapter V1 — public exports.
 * Composes Research → Refresh-First → NBA → Priority.
 * Zero providers / GSC API / writes.
 *
 * Server-only modules (do not import from this barrel):
 * - `./context-cms` — CMS context builder
 * - `./research-bridge` — Research + Pipeline server wrapper
 */

export {
  SEO_DECISION_PIPELINE_CAPS,
  SEO_DECISION_PIPELINE_EVALUATION_STATUSES,
  SEO_DECISION_PIPELINE_VERSION,
  type SeoDecisionPipelineBatchResult,
  type SeoDecisionPipelineBlogIdentity,
  type SeoDecisionPipelineContext,
  type SeoDecisionPipelineEvaluationStatus,
  type SeoDecisionPipelineGscEvidence,
  type SeoDecisionPipelineOpportunityInput,
  type SeoDecisionPipelineOpportunitySlice,
  type SeoDecisionPipelineResolvedTarget,
  type SeoDecisionPipelineResult,
  type SeoDecisionPipelineVersion,
} from "@/lib/cms/seo-decision-pipeline/types";

export {
  buildNextBestActionInput,
  buildPriorityInput,
  buildRefreshFirstInput,
  buildSeoDecisionOpportunityIdentity,
  buildSeoDecisionPipelineFingerprint,
  compactOpportunitySlice,
  deriveProposedSlugForNewBlog,
  ensureTargetInCandidates,
  extractDraftBlogReservations,
  extractPlanningReservationKeys,
  mapResearchGscToPriorityEvidence,
  mapResearchGscToRefreshOwnership,
  mapResearchHistoricalCandidate,
  normalizeDecisionPipelinePath,
  resolveSeoDecisionPipelineTarget,
  validateResearchOpportunity,
} from "@/lib/cms/seo-decision-pipeline/adapt";

export {
  createSeoDecisionPipelineContextFromData,
  projectBlogIdentities,
} from "@/lib/cms/seo-decision-pipeline/context";

export {
  evaluateSeoOpportunityPipeline,
  evaluateSeoOpportunityPipelineBatch,
} from "@/lib/cms/seo-decision-pipeline/evaluate";

export {
  SEO_RESEARCH_DECISION_PIPELINE_RUN_STATUSES,
  type ResearchUkOpportunitiesWithPipelineResult,
  type ResearchUkOpportunitiesWithPipelineSuccess,
  type SeoResearchDecisionPipelineAttachment,
  type SeoResearchDecisionPipelineEvaluation,
  type SeoResearchDecisionPipelineRunStatus,
} from "@/lib/cms/seo-decision-pipeline/research-bridge-types";

export {
  buildContextErrorDecisionPipelineAttachment,
  buildOkDecisionPipelineAttachment,
  combineResearchWithDecisionPipeline,
  toResearchDecisionPipelineEvaluation,
} from "@/lib/cms/seo-decision-pipeline/research-bridge-core";
