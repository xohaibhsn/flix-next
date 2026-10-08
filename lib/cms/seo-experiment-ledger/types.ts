/**
 * Experiment Ledger V1 — pure persistence contracts.
 * MySQL-only durability surface. Safe for unit tests without server-only.
 */

import type { SeoResearchResult } from "@/lib/cms/ai-seo/research-schemas";
import type { SeoResearchDecisionPipelineAttachment } from "@/lib/cms/seo-decision-pipeline/research-bridge-types";

export const SEO_LEDGER_MAX_OPPORTUNITIES = 5 as const;

export const SEO_LEDGER_CAPS = {
  topic: 160,
  workingTitle: 180,
  url: 300,
  postId: 80,
  fingerprint: 80,
  errorCode: 80,
  recommendation: 40,
  confidence: 20,
  coverage: 20,
  status: 40,
  version: 20,
  source: 20,
  selectionSource: 40,
  adminId: 80,
} as const;

export const SEO_LEDGER_RUN_SOURCES = ["manual", "autonomous"] as const;
export type SeoLedgerRunSource = (typeof SEO_LEDGER_RUN_SOURCES)[number];

/** Pipeline attachment status for a Research run. SKIPPED = no pipeline attachment / Research failed. */
export const SEO_LEDGER_PIPELINE_RUN_STATUSES = ["OK", "CONTEXT_ERROR", "SKIPPED"] as const;
export type SeoLedgerPipelineRunStatus = (typeof SEO_LEDGER_PIPELINE_RUN_STATUSES)[number];

/** Only written for successfully committed rows. Persistence failures are not DB rows. */
export const SEO_LEDGER_DURABILITY_STATUSES = ["COMPLETE"] as const;
export type SeoLedgerDurabilityStatus = (typeof SEO_LEDGER_DURABILITY_STATUSES)[number];

export const SEO_LEDGER_SELECTION_SOURCES = ["none", "manual_proceed", "autonomous"] as const;
export type SeoLedgerSelectionSource = (typeof SEO_LEDGER_SELECTION_SOURCES)[number];

/**
 * Bounded Research + optional Pipeline snapshot for Ledger mapping.
 * Caller supplies an already-completed Bridge/action result — never executes Research.
 */
export type SeoLedgerResearchSnapshot =
  | {
      ok: true;
      research: SeoResearchResult;
      decisionPipeline?: SeoResearchDecisionPipelineAttachment | null;
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };

export type SeoLedgerMapInput = {
  source?: SeoLedgerRunSource;
  actorAdminId?: string | null;
  research: SeoLedgerResearchSnapshot;
  /** ISO timestamps; defaults applied by mapper when omitted. */
  createdAt?: string;
  completedAt?: string;
  runId?: string;
};

export type SeoResearchRunRow = {
  id: string;
  createdAt: string;
  completedAt: string;
  source: SeoLedgerRunSource;
  actorAdminId: string | null;
  researchOk: boolean;
  researchErrorCode: string | null;
  pipelineRunStatus: SeoLedgerPipelineRunStatus;
  pipelineVersion: string | null;
  pipelineErrorCode: string | null;
  opportunityCount: number;
  gscStatus: string | null;
  durabilityStatus: SeoLedgerDurabilityStatus;
};

export type SeoOpportunityDecisionRow = {
  id: string;
  runId: string;
  opportunityIndex: number;
  opportunityIdentity: string;
  createdAt: string;
  topic: string;
  workingTitle: string;
  researchRecommendation: string;
  researchConfidence: string | null;
  existingCoverage: string | null;
  matchedPublicUrl: string;
  restorePath: string;
  targetPostId: string | null;
  evaluationStatus: string;
  rfVerdict: string | null;
  rfFingerprint: string | null;
  nbaAction: string | null;
  nbaStatus: string | null;
  nbaAutonomousEligible: boolean | null;
  nbaFingerprint: string | null;
  priorityScore: number | null;
  priorityTier: string | null;
  priorityScoreVersion: string | null;
  priorityAutomationSelectable: boolean | null;
  priorityFingerprint: string | null;
  pipelineFingerprint: string | null;
  selected: boolean;
  selectionSource: SeoLedgerSelectionSource;
};

export type SeoLedgerPersistPlan = {
  run: SeoResearchRunRow;
  decisions: SeoOpportunityDecisionRow[];
};

export type SeoLedgerMapResult =
  | { ok: true; plan: SeoLedgerPersistPlan }
  | { ok: false; errorCode: string; errorMessage: string };

/** Result of MySQL insertResearchRunWithDecisions (declared pure for action typing). */
export type InsertResearchRunWithDecisionsResult =
  | {
      ok: true;
      status: "PERSISTED";
      runId: string;
      decisionCount: number;
    }
  | {
      ok: false;
      status: "UNAVAILABLE" | "VALIDATION_ERROR" | "WRITE_ERROR";
      errorCode: string;
      errorMessage: string;
    };
