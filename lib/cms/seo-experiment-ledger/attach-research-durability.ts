/**
 * Experiment Ledger L2 — attach durability metadata to a completed Research Bridge result.
 * Pure / DI-friendly. Does not import database drivers, providers, or GSC.
 * Never re-runs Research or Decision Pipeline.
 */

import type { ResearchUkOpportunitiesWithPipelineResult } from "@/lib/cms/seo-decision-pipeline/research-bridge-types";
import type {
  InsertResearchRunWithDecisionsResult,
  SeoLedgerMapInput,
  SeoLedgerResearchSnapshot,
  SeoLedgerRunSource,
} from "@/lib/cms/seo-experiment-ledger/types";

/** Client-safe durability fields additive on the Research action result. */
export type ResearchLedgerDurabilityMeta = {
  ledgerPersisted?: boolean;
  ledgerStatus?: "PERSISTED" | "UNAVAILABLE" | "VALIDATION_ERROR" | "WRITE_ERROR";
  ledgerRunId?: string;
  ledgerDecisionCount?: number;
  ledgerErrorCode?: string;
};

export type ResearchWithLedgerDurability = ResearchUkOpportunitiesWithPipelineResult &
  ResearchLedgerDurabilityMeta;

/**
 * Map a completed Bridge result into the L1 Ledger research snapshot.
 * Does not mutate the Bridge result.
 */
export function bridgeResultToLedgerSnapshot(
  result: ResearchUkOpportunitiesWithPipelineResult,
): SeoLedgerResearchSnapshot {
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
    };
  }
  return {
    ok: true,
    research: result.research,
    decisionPipeline: result.decisionPipeline,
  };
}

/** Sanitize persist outcome into serializable action metadata (no SQL/message leakage). */
export function durabilityMetaFromPersistResult(
  persist: InsertResearchRunWithDecisionsResult,
): ResearchLedgerDurabilityMeta {
  if (persist.ok) {
    return {
      ledgerPersisted: true,
      ledgerStatus: "PERSISTED",
      ledgerRunId: persist.runId,
      ledgerDecisionCount: persist.decisionCount,
    };
  }
  return {
    ledgerPersisted: false,
    ledgerStatus: persist.status,
    ledgerErrorCode: persist.errorCode,
  };
}

function unexpectedDurabilityMeta(): ResearchLedgerDurabilityMeta {
  return {
    ledgerPersisted: false,
    ledgerStatus: "WRITE_ERROR",
    ledgerErrorCode: "ledger_unexpected_error",
  };
}

/**
 * Attempt Ledger persistence exactly once for a completed Bridge result.
 * Always returns the original Research/Pipeline payload; durability is additive only.
 * Ledger failure never converts Research success into failure (or vice versa).
 */
export async function attachLedgerDurabilityToResearchResult(args: {
  researchResult: ResearchUkOpportunitiesWithPipelineResult;
  actorAdminId: string;
  source?: SeoLedgerRunSource;
  createdAt: string;
  completedAt: string;
  persist: (input: SeoLedgerMapInput) => Promise<InsertResearchRunWithDecisionsResult>;
}): Promise<ResearchWithLedgerDurability> {
  const researchResult = args.researchResult;
  try {
    const persistResult = await args.persist({
      source: args.source ?? "manual",
      actorAdminId: args.actorAdminId,
      research: bridgeResultToLedgerSnapshot(researchResult),
      createdAt: args.createdAt,
      completedAt: args.completedAt,
    });
    return {
      ...researchResult,
      ...durabilityMetaFromPersistResult(persistResult),
    };
  } catch {
    return {
      ...researchResult,
      ...unexpectedDurabilityMeta(),
    };
  }
}

/**
 * One authorized Research Bridge invocation + one Ledger persistence attempt.
 * Inject Research and persist so unit tests never touch providers or MySQL.
 */
export async function runResearchBridgeThenPersistLedger(args: {
  actorAdminId: string;
  source?: SeoLedgerRunSource;
  runResearch: () => Promise<ResearchUkOpportunitiesWithPipelineResult>;
  persist: (input: SeoLedgerMapInput) => Promise<InsertResearchRunWithDecisionsResult>;
  nowIso?: () => string;
}): Promise<ResearchWithLedgerDurability> {
  const nowIso = args.nowIso ?? (() => new Date().toISOString());
  const createdAt = nowIso();
  const researchResult = await args.runResearch();
  const completedAt = nowIso();
  return attachLedgerDurabilityToResearchResult({
    researchResult,
    actorAdminId: args.actorAdminId,
    source: args.source ?? "manual",
    createdAt,
    completedAt,
    persist: args.persist,
  });
}
