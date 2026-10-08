/**
 * Pure Decision Pipeline evaluation — Research → Refresh-First → NBA → Priority.
 * Zero I/O. Zero providers. Zero writes. Not a fifth decision engine.
 */

import { evaluateSeoRefreshFirst } from "@/lib/cms/seo-refresh-first";
import { decideSeoNextBestAction } from "@/lib/cms/seo-next-best-action";
import { scoreSeoPriority } from "@/lib/cms/seo-priority";
import type { SeoResearchOpportunity } from "@/lib/cms/ai-seo/research-schemas";
import {
  buildNextBestActionInput,
  buildPriorityInput,
  buildRefreshFirstInput,
  buildSeoDecisionOpportunityIdentity,
  buildSeoDecisionPipelineFingerprint,
  compactOpportunitySlice,
  deriveProposedSlugForNewBlog,
  ensureTargetInCandidates,
  mapResearchGscToRefreshOwnership,
  mapResearchHistoricalCandidate,
  resolveSeoDecisionPipelineTarget,
  validateResearchOpportunity,
} from "@/lib/cms/seo-decision-pipeline/adapt";
import {
  SEO_DECISION_PIPELINE_CAPS,
  SEO_DECISION_PIPELINE_VERSION,
  type SeoDecisionPipelineBatchResult,
  type SeoDecisionPipelineContext,
  type SeoDecisionPipelineResult,
} from "@/lib/cms/seo-decision-pipeline/types";

function emptyFailure(args: {
  opportunity?: SeoResearchOpportunity | null;
  evaluationStatus: "VALIDATION_ERROR" | "INTERNAL_ERROR";
  errorCode: string;
  errorMessage: string;
  opportunityIdentity?: string;
}): SeoDecisionPipelineResult {
  const slice = args.opportunity
    ? compactOpportunitySlice(args.opportunity)
    : {
        topic: "",
        workingTitle: "",
        recommendation: "SKIP",
      };
  const opportunityIdentity =
    args.opportunityIdentity ||
    (args.opportunity ? buildSeoDecisionOpportunityIdentity(args.opportunity) : "invalid");
  const pipelineFingerprint = buildSeoDecisionPipelineFingerprint({
    opportunityIdentity,
    refreshFingerprint: null,
    nbaDecisionFingerprint: null,
    priorityFingerprint: null,
  });
  return {
    pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
    pipelineFingerprint,
    evaluationStatus: args.evaluationStatus,
    opportunityIdentity,
    opportunity: slice,
    refreshFirst: null,
    nextBestAction: null,
    priority: null,
    resolvedTarget: null,
    errorCode: args.errorCode,
    errorMessage: String(args.errorMessage || "").slice(
      0,
      SEO_DECISION_PIPELINE_CAPS.errorMessage,
    ),
  };
}

/**
 * Pure single-opportunity evaluation.
 * Must perform ZERO I/O — all inputs supplied via context + opportunity.
 */
export function evaluateSeoOpportunityPipeline(
  context: SeoDecisionPipelineContext,
  opportunity: SeoResearchOpportunity,
): SeoDecisionPipelineResult {
  const validated = validateResearchOpportunity(opportunity);
  if (!validated.ok) {
    return emptyFailure({
      opportunity,
      evaluationStatus: "VALIDATION_ERROR",
      errorCode: validated.errorCode,
      errorMessage: validated.errorMessage,
    });
  }

  try {
    const opportunityIdentity = buildSeoDecisionOpportunityIdentity(opportunity);
    const proposedSlug = deriveProposedSlugForNewBlog(opportunity);

    const resolvedTarget = resolveSeoDecisionPipelineTarget({
      matchedPublicUrl: opportunity.matchedPublicUrl,
      proposedSlug,
      blogIdentities: context.blogIdentities,
    });

    const targetIdentity = resolvedTarget
      ? context.blogIdentities.find((row) => row.postId === resolvedTarget.postId) || null
      : null;

    const candidates = ensureTargetInCandidates(
      context.candidates,
      resolvedTarget,
      targetIdentity,
    );

    const gscOwnership = mapResearchGscToRefreshOwnership({
      gscEvidence: opportunity.gscEvidence,
      matchedPublicUrl: opportunity.matchedPublicUrl,
      blogIdentities: context.blogIdentities,
    });

    const historical = mapResearchHistoricalCandidate({ opportunity });

    const refreshInput = buildRefreshFirstInput({
      opportunity,
      proposedSlug,
      target: resolvedTarget,
      candidates,
      gscOwnership,
      historical,
      reservations: context.reservations,
      corpusComplete: context.corpusComplete,
    });

    const refreshFirst = evaluateSeoRefreshFirst(refreshInput);

    const nbaInput = buildNextBestActionInput({
      opportunity,
      refreshFirst,
      target: resolvedTarget,
      historical,
      opportunityIdentity,
      runId: context.source?.runId,
    });

    const nextBestAction = decideSeoNextBestAction(nbaInput);

    const priorityInput = buildPriorityInput({
      decision: nextBestAction,
      refreshFirst,
      opportunity,
      opportunityIdentity,
      runId: context.source?.runId,
    });

    const priority = scoreSeoPriority(priorityInput);

    const pipelineFingerprint = buildSeoDecisionPipelineFingerprint({
      opportunityIdentity,
      refreshFingerprint: refreshFirst.fingerprint,
      nbaDecisionFingerprint: nextBestAction.decisionFingerprint,
      priorityFingerprint: priority.priorityFingerprint,
    });

    return {
      pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
      pipelineFingerprint,
      evaluationStatus: "OK",
      opportunityIdentity,
      opportunity: compactOpportunitySlice(opportunity),
      refreshFirst,
      nextBestAction,
      priority,
      resolvedTarget,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected pipeline evaluation failure.";
    // Sanitize — never expose stacks / SQL / secrets
    const safe = String(message)
      .replace(/\b(sql|password|secret|api[_-]?key|token)\b/gi, "[redacted]")
      .slice(0, SEO_DECISION_PIPELINE_CAPS.errorMessage);
    return emptyFailure({
      opportunity,
      evaluationStatus: "INTERNAL_ERROR",
      errorCode: "internal_error",
      errorMessage: safe || "Unexpected pipeline evaluation failure.",
      opportunityIdentity: buildSeoDecisionOpportunityIdentity(opportunity),
    });
  }
}

/**
 * Batch evaluate ≤5 opportunities with per-row isolation.
 * Preserves input order. Does not sort by Priority.
 * Shared context must already be built — this function performs zero I/O.
 */
export function evaluateSeoOpportunityPipelineBatch(
  context: SeoDecisionPipelineContext,
  opportunities: readonly SeoResearchOpportunity[],
): SeoDecisionPipelineBatchResult {
  const bounded = [...(opportunities || [])].slice(
    0,
    SEO_DECISION_PIPELINE_CAPS.maxOpportunities,
  );
  const results: SeoDecisionPipelineResult[] = [];
  for (const opportunity of bounded) {
    results.push(evaluateSeoOpportunityPipeline(context, opportunity));
  }
  return {
    pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
    results,
  };
}
