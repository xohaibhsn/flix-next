/**
 * Experiment Ledger V1 — MySQL-only persistence.
 * Server-only. Never call from Client Components.
 * Does not execute Research or Decision Pipeline.
 */

import "server-only";

import type { PoolConnection } from "mysql2/promise";
import { createId } from "@/lib/cms/ids";
import { isDatabaseConfigured } from "@/lib/db/config";
import { withTransaction } from "@/lib/db/pool";
import { mapResearchSnapshotToLedgerPlan } from "@/lib/cms/seo-experiment-ledger/map";
import type {
  InsertResearchRunWithDecisionsResult,
  SeoLedgerMapInput,
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";

export type { InsertResearchRunWithDecisionsResult };

/** Local UTC MySQL DATETIME formatter — avoids importing mysql-migrate side effects. */
function toMysqlDateTime(iso: string) {
  const date = new Date(iso);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return safe.toISOString().slice(0, 19).replace("T", " ");
}

export type InsertResearchRunWithDecisionsDeps = {
  isDatabaseConfigured?: () => boolean;
  withTransaction?: typeof withTransaction;
  createRunId?: () => string;
  createDecisionId?: () => string;
  nowIso?: () => string;
};

function sanitizeWriteError(_error: unknown): { errorCode: string; errorMessage: string } {
  void _error;
  return {
    errorCode: "ledger_write_error",
    errorMessage: "Experiment Ledger persistence failed.",
  };
}

async function insertRun(conn: PoolConnection, run: SeoResearchRunRow): Promise<void> {
  await conn.execute(
    `INSERT INTO seo_research_runs (
      id, created_at, completed_at, source, actor_admin_id,
      research_ok, research_error_code, pipeline_run_status, pipeline_version,
      pipeline_error_code, opportunity_count, gsc_status, durability_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      toMysqlDateTime(run.createdAt),
      toMysqlDateTime(run.completedAt),
      run.source,
      run.actorAdminId,
      run.researchOk ? 1 : 0,
      run.researchErrorCode,
      run.pipelineRunStatus,
      run.pipelineVersion,
      run.pipelineErrorCode,
      run.opportunityCount,
      run.gscStatus,
      run.durabilityStatus,
    ],
  );
}

async function insertDecisions(
  conn: PoolConnection,
  decisions: readonly SeoOpportunityDecisionRow[],
): Promise<void> {
  if (decisions.length === 0) return;

  // Bounded batch (≤5) — single multi-row INSERT, no per-row SELECT.
  const placeholders = decisions
    .map(() => `(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .join(",");
  const values: Array<string | number | null> = [];
  for (const d of decisions) {
    values.push(
      d.id,
      d.runId,
      d.opportunityIndex,
      d.opportunityIdentity,
      toMysqlDateTime(d.createdAt),
      d.topic,
      d.workingTitle,
      d.researchRecommendation,
      d.researchConfidence,
      d.existingCoverage,
      d.matchedPublicUrl,
      d.restorePath,
      d.targetPostId,
      d.evaluationStatus,
      d.rfVerdict,
      d.rfFingerprint,
      d.nbaAction,
      d.nbaStatus,
      d.nbaAutonomousEligible == null ? null : d.nbaAutonomousEligible ? 1 : 0,
      d.nbaFingerprint,
      d.priorityScore,
      d.priorityTier,
      d.priorityScoreVersion,
      d.priorityAutomationSelectable == null
        ? null
        : d.priorityAutomationSelectable
          ? 1
          : 0,
      d.priorityFingerprint,
      d.pipelineFingerprint,
      d.selected ? 1 : 0,
      d.selectionSource,
    );
  }

  await conn.execute(
    `INSERT INTO seo_opportunity_decisions (
      id, run_id, opportunity_index, opportunity_identity, created_at,
      topic, working_title, research_recommendation, research_confidence, existing_coverage,
      matched_public_url, restore_path, target_post_id, evaluation_status,
      rf_verdict, rf_fingerprint, nba_action, nba_status, nba_autonomous_eligible, nba_fingerprint,
      priority_score, priority_tier, priority_score_version, priority_automation_selectable,
      priority_fingerprint, pipeline_fingerprint, selected, selection_source
    ) VALUES ${placeholders}`,
    values,
  );
}

/**
 * Persist one Research run and 0–5 decision rows atomically.
 * MySQL-only — returns UNAVAILABLE when DB is not configured (JSON fallback mode).
 */
export async function insertResearchRunWithDecisions(
  input: SeoLedgerMapInput,
  deps?: InsertResearchRunWithDecisionsDeps,
): Promise<InsertResearchRunWithDecisionsResult> {
  const dbConfigured = (deps?.isDatabaseConfigured ?? isDatabaseConfigured)();
  if (!dbConfigured) {
    return {
      ok: false,
      status: "UNAVAILABLE",
      errorCode: "mysql_unavailable",
      errorMessage: "Experiment Ledger requires MySQL and is skipped in JSON mode.",
    };
  }

  const mapped = mapResearchSnapshotToLedgerPlan(input, {
    createRunId: deps?.createRunId ?? (() => createId("seorun")),
    createDecisionId: deps?.createDecisionId ?? (() => createId("seodec")),
    nowIso: deps?.nowIso,
  });
  if (!mapped.ok) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
    };
  }

  const tx = deps?.withTransaction ?? withTransaction;
  try {
    await tx(async (conn) => {
      await insertRun(conn, mapped.plan.run);
      await insertDecisions(conn, mapped.plan.decisions);
    });
  } catch (error) {
    const sanitized = sanitizeWriteError(error);
    return {
      ok: false,
      status: "WRITE_ERROR",
      errorCode: sanitized.errorCode,
      errorMessage: sanitized.errorMessage,
    };
  }

  return {
    ok: true,
    status: "PERSISTED",
    runId: mapped.plan.run.id,
    decisionCount: mapped.plan.decisions.length,
  };
}
