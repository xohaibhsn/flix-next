/**
 * Pure Experiment Ledger mapping — Research/Pipeline snapshot → persist DTOs.
 * Zero I/O. Zero providers. Does not recompute RF/NBA/Priority.
 */

import { createId } from "@/lib/cms/ids";
import type { SeoResearchOpportunity } from "@/lib/cms/ai-seo/research-schemas";
import type { SeoResearchDecisionPipelineEvaluation } from "@/lib/cms/seo-decision-pipeline/research-bridge-types";
import {
  SEO_LEDGER_CAPS,
  SEO_LEDGER_MAX_OPPORTUNITIES,
  type SeoLedgerMapInput,
  type SeoLedgerMapResult,
  type SeoOpportunityDecisionRow,
  type SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";

function trimBound(value: unknown, max: number): string {
  if (value == null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function nullableBound(value: unknown, max: number): string | null {
  const text = trimBound(value, max);
  return text ? text : null;
}

function sanitizeErrorCode(value: unknown): string | null {
  const raw = trimBound(value, SEO_LEDGER_CAPS.errorCode);
  if (!raw) return null;
  // Keep alphanumeric / underscore / hyphen only — never echo free-form secrets.
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, SEO_LEDGER_CAPS.errorCode);
  return cleaned || null;
}

function isIsoDate(value: string): boolean {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function resolveIso(value: string | undefined, fallback: string): string {
  if (value && isIsoDate(value)) return new Date(value).toISOString();
  return fallback;
}

function expectedAutomationSelectable(args: {
  nbaAction: string | null;
  autonomousEligible: boolean | null;
}): boolean {
  return args.nbaAction === "NEW_BLOG" && args.autonomousEligible === true;
}

function mapDecisionRow(args: {
  runId: string;
  createdAt: string;
  evaluation: SeoResearchDecisionPipelineEvaluation;
  researchOpp: SeoResearchOpportunity | undefined;
  createDecisionId: () => string;
}): { ok: true; row: SeoOpportunityDecisionRow } | { ok: false; errorCode: string; errorMessage: string } {
  const { evaluation, researchOpp, runId, createdAt } = args;
  const index = evaluation.opportunityIndex;
  if (!Number.isInteger(index) || index < 0 || index >= SEO_LEDGER_MAX_OPPORTUNITIES) {
    return {
      ok: false,
      errorCode: "invalid_opportunity_index",
      errorMessage: "Opportunity index out of range.",
    };
  }

  const identity = trimBound(evaluation.opportunityIdentity, SEO_LEDGER_CAPS.fingerprint);
  if (!identity) {
    return {
      ok: false,
      errorCode: "missing_opportunity_identity",
      errorMessage: "Opportunity identity is required.",
    };
  }

  const evaluationStatus = trimBound(evaluation.evaluationStatus, SEO_LEDGER_CAPS.status);
  if (!evaluationStatus) {
    return {
      ok: false,
      errorCode: "missing_evaluation_status",
      errorMessage: "Evaluation status is required.",
    };
  }

  const rf = evaluation.refreshFirst;
  const nba = evaluation.nextBestAction;
  const priority = evaluation.priority;
  const resolved = evaluation.resolvedTarget;

  const nbaAction = nba ? trimBound(nba.action, SEO_LEDGER_CAPS.recommendation) || null : null;
  const nbaAutonomous =
    nba && typeof nba.autonomousEligible === "boolean" ? nba.autonomousEligible : null;

  if (priority) {
    const score = priority.score;
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      return {
        ok: false,
        errorCode: "invalid_priority_score",
        errorMessage: "Priority score must be an integer from 0 to 100.",
      };
    }
    if (typeof priority.automationSelectable !== "boolean") {
      return {
        ok: false,
        errorCode: "invalid_automation_selectable",
        errorMessage: "Priority automationSelectable must be boolean when Priority is present.",
      };
    }
    if (nba) {
      const expected = expectedAutomationSelectable({
        nbaAction,
        autonomousEligible: nbaAutonomous,
      });
      if (priority.automationSelectable !== expected) {
        return {
          ok: false,
          errorCode: "automation_selectable_mismatch",
          errorMessage:
            "Priority automationSelectable must equal (NBA NEW_BLOG && autonomousEligible).",
        };
      }
    }
  }

  const topic =
    trimBound(researchOpp?.topic ?? evaluation.opportunity?.topic, SEO_LEDGER_CAPS.topic) ||
    trimBound(evaluation.opportunity?.topic, SEO_LEDGER_CAPS.topic);
  const workingTitle =
    trimBound(
      researchOpp?.workingTitle ?? evaluation.opportunity?.workingTitle,
      SEO_LEDGER_CAPS.workingTitle,
    ) || trimBound(evaluation.opportunity?.workingTitle, SEO_LEDGER_CAPS.workingTitle);
  const recommendation =
    trimBound(
      researchOpp?.recommendation ?? evaluation.opportunity?.recommendation,
      SEO_LEDGER_CAPS.recommendation,
    ) || "";

  const targetPostId =
    nullableBound(resolved?.postId, SEO_LEDGER_CAPS.postId) ||
    nullableBound(nba?.target && "postId" in nba.target ? nba.target.postId : null, SEO_LEDGER_CAPS.postId) ||
    nullableBound(rf?.target?.postId, SEO_LEDGER_CAPS.postId);

  return {
    ok: true,
    row: {
      id: args.createDecisionId(),
      runId,
      opportunityIndex: index,
      opportunityIdentity: identity,
      createdAt,
      topic,
      workingTitle,
      researchRecommendation: recommendation,
      researchConfidence: nullableBound(
        researchOpp?.confidence ?? evaluation.opportunity?.confidence,
        SEO_LEDGER_CAPS.confidence,
      ),
      existingCoverage: nullableBound(
        researchOpp?.existingCoverage ?? evaluation.opportunity?.existingCoverage,
        SEO_LEDGER_CAPS.coverage,
      ),
      matchedPublicUrl: trimBound(
        researchOpp?.matchedPublicUrl ?? evaluation.opportunity?.matchedPublicUrl,
        SEO_LEDGER_CAPS.url,
      ),
      restorePath: trimBound(
        researchOpp?.restorePath ?? evaluation.opportunity?.restorePath,
        SEO_LEDGER_CAPS.url,
      ),
      targetPostId,
      evaluationStatus,
      rfVerdict: rf ? nullableBound(rf.verdict, SEO_LEDGER_CAPS.status) : null,
      rfFingerprint: rf ? nullableBound(rf.fingerprint, SEO_LEDGER_CAPS.fingerprint) : null,
      nbaAction,
      nbaStatus: nba ? nullableBound(nba.status, SEO_LEDGER_CAPS.status) : null,
      nbaAutonomousEligible: nbaAutonomous,
      nbaFingerprint: nba
        ? nullableBound(nba.decisionFingerprint, SEO_LEDGER_CAPS.fingerprint)
        : null,
      priorityScore: priority ? priority.score : null,
      priorityTier: priority ? nullableBound(priority.tier, SEO_LEDGER_CAPS.confidence) : null,
      priorityScoreVersion: priority
        ? nullableBound(priority.scoreVersion, SEO_LEDGER_CAPS.version)
        : null,
      priorityAutomationSelectable: priority ? priority.automationSelectable : null,
      priorityFingerprint: priority
        ? nullableBound(priority.priorityFingerprint, SEO_LEDGER_CAPS.fingerprint)
        : null,
      pipelineFingerprint: nullableBound(evaluation.pipelineFingerprint, SEO_LEDGER_CAPS.fingerprint),
      selected: false,
      selectionSource: "none",
    },
  };
}

/**
 * Map a completed Research/Pipeline snapshot into an insert plan.
 * Does not open DB connections or call providers.
 */
export function mapResearchSnapshotToLedgerPlan(
  input: SeoLedgerMapInput,
  deps?: {
    createRunId?: () => string;
    createDecisionId?: () => string;
    nowIso?: () => string;
  },
): SeoLedgerMapResult {
  const now = (deps?.nowIso ?? (() => new Date().toISOString()))();
  const createdAt = resolveIso(input.createdAt, now);
  const completedAt = resolveIso(input.completedAt, createdAt);
  const source = input.source === "autonomous" ? "autonomous" : "manual";
  const actorAdminId = nullableBound(input.actorAdminId, SEO_LEDGER_CAPS.adminId);
  const runId = trimBound(input.runId, SEO_LEDGER_CAPS.postId) || (deps?.createRunId ?? (() => createId("seorun")))();
  const createDecisionId = deps?.createDecisionId ?? (() => createId("seodec"));

  const research = input.research;

  if (!research.ok) {
    const run: SeoResearchRunRow = {
      id: runId,
      createdAt,
      completedAt,
      source,
      actorAdminId,
      researchOk: false,
      researchErrorCode: sanitizeErrorCode(research.code) || "research_failed",
      pipelineRunStatus: "SKIPPED",
      pipelineVersion: null,
      pipelineErrorCode: null,
      opportunityCount: 0,
      gscStatus: null,
      durabilityStatus: "COMPLETE",
    };
    return { ok: true, plan: { run, decisions: [] } };
  }

  const opportunities = research.research.opportunities || [];
  if (opportunities.length > SEO_LEDGER_MAX_OPPORTUNITIES) {
    return {
      ok: false,
      errorCode: "too_many_opportunities",
      errorMessage: `At most ${SEO_LEDGER_MAX_OPPORTUNITIES} opportunities may be persisted.`,
    };
  }

  const gscStatus = nullableBound(research.research.gsc?.status, SEO_LEDGER_CAPS.status);
  const pipeline = research.decisionPipeline;

  if (!pipeline) {
    const run: SeoResearchRunRow = {
      id: runId,
      createdAt,
      completedAt,
      source,
      actorAdminId,
      researchOk: true,
      researchErrorCode: null,
      pipelineRunStatus: "SKIPPED",
      pipelineVersion: null,
      pipelineErrorCode: null,
      opportunityCount: opportunities.length,
      gscStatus,
      durabilityStatus: "COMPLETE",
    };
    return { ok: true, plan: { run, decisions: [] } };
  }

  if (pipeline.runStatus === "CONTEXT_ERROR") {
    const run: SeoResearchRunRow = {
      id: runId,
      createdAt,
      completedAt,
      source,
      actorAdminId,
      researchOk: true,
      researchErrorCode: null,
      pipelineRunStatus: "CONTEXT_ERROR",
      pipelineVersion: nullableBound(pipeline.pipelineVersion, SEO_LEDGER_CAPS.version),
      pipelineErrorCode: sanitizeErrorCode(pipeline.errorCode),
      opportunityCount: opportunities.length,
      gscStatus,
      durabilityStatus: "COMPLETE",
    };
    // Do not fabricate evaluations from Research rows alone.
    return { ok: true, plan: { run, decisions: [] } };
  }

  if (pipeline.runStatus !== "OK") {
    return {
      ok: false,
      errorCode: "unsupported_pipeline_status",
      errorMessage: "Unsupported pipeline runStatus.",
    };
  }

  const evaluations = pipeline.evaluations || [];
  if (evaluations.length > SEO_LEDGER_MAX_OPPORTUNITIES) {
    return {
      ok: false,
      errorCode: "too_many_evaluations",
      errorMessage: `At most ${SEO_LEDGER_MAX_OPPORTUNITIES} evaluations may be persisted.`,
    };
  }

  const decisions: SeoOpportunityDecisionRow[] = [];
  const seenIndexes = new Set<number>();
  for (const evaluation of evaluations) {
    if (seenIndexes.has(evaluation.opportunityIndex)) {
      return {
        ok: false,
        errorCode: "duplicate_opportunity_index",
        errorMessage: "Duplicate opportunityIndex in evaluations.",
      };
    }
    seenIndexes.add(evaluation.opportunityIndex);
    const mapped = mapDecisionRow({
      runId,
      createdAt,
      evaluation,
      researchOpp: opportunities[evaluation.opportunityIndex],
      createDecisionId,
    });
    if (!mapped.ok) return mapped;
    decisions.push(mapped.row);
  }

  // Preserve Research order for the plan (evaluations should already be ordered).
  decisions.sort((a, b) => a.opportunityIndex - b.opportunityIndex);

  const run: SeoResearchRunRow = {
    id: runId,
    createdAt,
    completedAt,
    source,
    actorAdminId,
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: nullableBound(pipeline.pipelineVersion, SEO_LEDGER_CAPS.version) || "v1",
    pipelineErrorCode: null,
    opportunityCount: opportunities.length,
    gscStatus,
    durabilityStatus: "COMPLETE",
  };

  return { ok: true, plan: { run, decisions } };
}
