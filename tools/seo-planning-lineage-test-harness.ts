/**
 * Test-only lineage fixtures and disposable transactional wrappers.
 * Never import from production CMS actions or barrels.
 *
 * Trusted selections are minted only through the genuine production path:
 * prepareTrustedResearchProceedSelection → tryMintTrustedPlanningDecisionSelection.
 * This module does not write into a shared production registrar.
 *
 * Transactional MySQL tests call runTransactional* via this harness — not the
 * closed production entrypoints in transactional-integration.ts.
 */

import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import {
  prepareTrustedResearchProceedSelection,
  tryMintTrustedPlanningDecisionSelection,
  type TrustedPlanningDecisionSelection,
} from "../lib/cms/seo-planning-lineage";
import {
  runTransactionalProtectedPermanentDelete,
  runTransactionalTrustedProceedAndLink,
  type TransactionalProceedAndLinkResult,
  type TransactionalProtectedDeleteResult,
} from "../lib/cms/seo-planning-lineage/transactional-execution";
import { SEO_PLANNING_LINEAGE_CAPS } from "../lib/cms/seo-planning-lineage/types";
import { sanitizeText } from "../lib/cms/validation";

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function fixtureRun(args: {
  researchRunId: string;
  actorAdminId: string;
}): SeoResearchRunRow {
  return {
    id: args.researchRunId,
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: args.actorAdminId,
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: "v1",
    pipelineErrorCode: null,
    opportunityCount: 1,
    gscStatus: "OK",
    durabilityStatus: "COMPLETE",
  };
}

function fixtureDecision(args: {
  decisionId: string;
  researchRunId: string;
  topic?: string;
  workingTitle?: string;
}): SeoOpportunityDecisionRow {
  const topic = args.topic || "Fixture lineage topic for UK IPTV planning";
  const workingTitle = args.workingTitle || "Fixture Lineage Working Title";
  return {
    id: args.decisionId,
    runId: args.researchRunId,
    opportunityIndex: 0,
    opportunityIdentity: `oid_${trimField(args.decisionId, 40)}`,
    createdAt: "2026-10-06T00:00:00.000Z",
    topic,
    workingTitle,
    researchRecommendation: "NEW_BLOG",
    researchConfidence: "HIGH",
    existingCoverage: "NONE",
    matchedPublicUrl: "",
    restorePath: "",
    targetPostId: null,
    evaluationStatus: "OK",
    rfVerdict: "PASS_NEW_CONTENT",
    rfFingerprint: "rf_fixture",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_fixture",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_fixture",
    pipelineFingerprint: "pipe_fixture",
    selected: false,
    selectionSource: "none",
  };
}

/**
 * Mint a production-trusted selection via genuine prepare + tryMint.
 * Uses a deterministic in-memory Ledger reader — never a shared registry add().
 */
export async function createTrustedPlanningDecisionSelectionForTests(args: {
  planningDraftId: string;
  decisionId: string;
  researchRunId: string;
  actorAdminId: string;
  boundAt?: string;
  topic?: string;
  workingTitle?: string;
}): Promise<TrustedPlanningDecisionSelection> {
  const planningDraftId = trimField(args.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id);
  const decisionId = trimField(args.decisionId, SEO_PLANNING_LINEAGE_CAPS.id);
  const researchRunId = trimField(args.researchRunId, SEO_PLANNING_LINEAGE_CAPS.id);
  const actorAdminId = trimField(args.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId);

  const run = fixtureRun({ researchRunId, actorAdminId });
  const decision = fixtureDecision({
    decisionId,
    researchRunId,
    topic: args.topic,
    workingTitle: args.workingTitle,
  });

  const prepared = await prepareTrustedResearchProceedSelection({
    actor: { authorized: true, adminId: actorAdminId },
    ledgerRunId: researchRunId,
    opportunityIndex: 0,
    decisionId,
    displayedOpportunity: {
      topic: decision.topic,
      workingTitle: decision.workingTitle,
      recommendation: decision.researchRecommendation,
    },
    ledgerReader: {
      async getSeoResearchRunDetail() {
        return {
          ok: true,
          run,
          decisions: [decision],
          decisionOverflow: false,
        };
      },
    },
  });
  if (!prepared.ok) {
    throw new Error(
      `Test prepare failed: ${prepared.errorCode} ${prepared.errorMessage}`,
    );
  }

  const minted = tryMintTrustedPlanningDecisionSelection({
    planningDraftId,
    decisionId,
    researchRunId,
    actorAdminId,
    serverResearchBinding: prepared.preparation,
  });
  if (!minted.ok) {
    throw new Error(`Test mint failed: ${minted.errorCode} ${minted.errorMessage}`);
  }

  if (args.boundAt) {
    // boundAt is diagnostic-only on the trusted object; mint always sets now.
    // Callers that assert exact boundAt should not rely on fixture shortcut.
    void args.boundAt;
  }
  return minted.selection;
}

/** Disposable MySQL Proceed+link — bypasses closed production facade. */
export function executeTransactionalTrustedProceedAndLinkForTests(
  args: Parameters<typeof runTransactionalTrustedProceedAndLink>[0],
): Promise<TransactionalProceedAndLinkResult> {
  return runTransactionalTrustedProceedAndLink(args);
}

/** Disposable MySQL protected delete — bypasses closed production facade. */
export function executeTransactionalProtectedPermanentDeleteForTests(
  args: Parameters<typeof runTransactionalProtectedPermanentDelete>[0],
): Promise<TransactionalProtectedDeleteResult> {
  return runTransactionalProtectedPermanentDelete(args);
}
