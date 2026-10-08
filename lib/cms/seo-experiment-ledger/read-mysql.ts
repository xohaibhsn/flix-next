/**
 * Experiment Ledger L3 — MySQL-only READ repository.
 * Server-only. SELECT only. Never inserts/updates/migrates.
 * Does not invoke Research, GSC, or Decision Pipeline.
 */

import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getDbPool } from "@/lib/db/pool";
import {
  clampLedgerListPageSize,
  decodeLedgerListCursor,
  encodeLedgerListCursor,
  isValidLedgerRunId,
  SEO_LEDGER_DECISION_FETCH_LIMIT,
  SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE,
  toLedgerMysqlDateTime,
} from "@/lib/cms/seo-experiment-ledger/read-cursor";
import type {
  SeoLedgerDurabilityStatus,
  SeoLedgerPipelineRunStatus,
  SeoLedgerRunSource,
  SeoLedgerSelectionSource,
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";

type ExecuteRows = (
  sql: string,
  params: ReadonlyArray<string | number | null>,
) => Promise<RowDataPacket[]>;

export type SeoLedgerReadDeps = {
  isDatabaseConfigured?: () => boolean;
  execute?: ExecuteRows;
};

export type ListSeoResearchRunsResult =
  | {
      ok: true;
      runs: SeoResearchRunRow[];
      nextCursor: string | null;
      pageSize: number;
    }
  | {
      ok: false;
      errorCode: "unavailable" | "query_error" | "invalid_cursor";
      errorMessage: string;
    };

export type GetSeoResearchRunDetailResult =
  | {
      ok: true;
      run: SeoResearchRunRow;
      decisions: SeoOpportunityDecisionRow[];
      /** True when more than L1 max (5) decision rows were present. */
      decisionOverflow: boolean;
    }
  | {
      ok: false;
      errorCode: "unavailable" | "query_error" | "invalid_id" | "not_found";
      errorMessage: string;
    };

type RunPacket = RowDataPacket & {
  id: string;
  created_at: unknown;
  completed_at: unknown;
  source: string;
  actor_admin_id: string | null;
  research_ok: number | boolean;
  research_error_code: string | null;
  pipeline_run_status: string;
  pipeline_version: string | null;
  pipeline_error_code: string | null;
  opportunity_count: number;
  gsc_status: string | null;
  durability_status: string;
};

type DecisionPacket = RowDataPacket & {
  id: string;
  run_id: string;
  opportunity_index: number;
  opportunity_identity: string;
  created_at: unknown;
  topic: string;
  working_title: string;
  research_recommendation: string;
  research_confidence: string | null;
  existing_coverage: string | null;
  matched_public_url: string;
  restore_path: string;
  target_post_id: string | null;
  evaluation_status: string;
  rf_verdict: string | null;
  rf_fingerprint: string | null;
  nba_action: string | null;
  nba_status: string | null;
  nba_autonomous_eligible: number | boolean | null;
  nba_fingerprint: string | null;
  priority_score: number | null;
  priority_tier: string | null;
  priority_score_version: string | null;
  priority_automation_selectable: number | boolean | null;
  priority_fingerprint: string | null;
  pipeline_fingerprint: string | null;
  selected: number | boolean;
  selection_source: string;
};

function sanitizeReadError(
  kind: "unavailable" | "query_error",
): {
  ok: false;
  errorCode: "unavailable" | "query_error";
  errorMessage: string;
} {
  if (kind === "unavailable") {
    return {
      ok: false,
      errorCode: "unavailable",
      errorMessage: "Ledger database unavailable.",
    };
  }
  return {
    ok: false,
    errorCode: "query_error",
    errorMessage: "Unable to load Ledger history.",
  };
}

function asBool(value: number | boolean): boolean {
  return value === true || value === 1;
}

function asNullableBool(value: number | boolean | null): boolean | null {
  if (value == null) return null;
  return asBool(value);
}

function mapRunRow(row: RunPacket): SeoResearchRunRow {
  return {
    id: String(row.id),
    createdAt: toLedgerMysqlDateTime(row.created_at),
    completedAt: toLedgerMysqlDateTime(row.completed_at),
    source: (row.source === "autonomous" ? "autonomous" : "manual") as SeoLedgerRunSource,
    actorAdminId: row.actor_admin_id ? String(row.actor_admin_id) : null,
    researchOk: asBool(row.research_ok),
    researchErrorCode: row.research_error_code ? String(row.research_error_code) : null,
    pipelineRunStatus: String(row.pipeline_run_status) as SeoLedgerPipelineRunStatus,
    pipelineVersion: row.pipeline_version ? String(row.pipeline_version) : null,
    pipelineErrorCode: row.pipeline_error_code ? String(row.pipeline_error_code) : null,
    opportunityCount: Number(row.opportunity_count) || 0,
    gscStatus: row.gsc_status ? String(row.gsc_status) : null,
    durabilityStatus: String(row.durability_status) as SeoLedgerDurabilityStatus,
  };
}

function mapDecisionRow(row: DecisionPacket): SeoOpportunityDecisionRow {
  const selection =
    row.selection_source === "manual_proceed" || row.selection_source === "autonomous"
      ? row.selection_source
      : "none";
  return {
    id: String(row.id),
    runId: String(row.run_id),
    opportunityIndex: Number(row.opportunity_index) || 0,
    opportunityIdentity: String(row.opportunity_identity || ""),
    createdAt: toLedgerMysqlDateTime(row.created_at),
    topic: String(row.topic || ""),
    workingTitle: String(row.working_title || ""),
    researchRecommendation: String(row.research_recommendation || ""),
    researchConfidence: row.research_confidence ? String(row.research_confidence) : null,
    existingCoverage: row.existing_coverage ? String(row.existing_coverage) : null,
    matchedPublicUrl: String(row.matched_public_url || ""),
    restorePath: String(row.restore_path || ""),
    targetPostId: row.target_post_id ? String(row.target_post_id) : null,
    evaluationStatus: String(row.evaluation_status || ""),
    rfVerdict: row.rf_verdict ? String(row.rf_verdict) : null,
    rfFingerprint: row.rf_fingerprint ? String(row.rf_fingerprint) : null,
    nbaAction: row.nba_action ? String(row.nba_action) : null,
    nbaStatus: row.nba_status ? String(row.nba_status) : null,
    nbaAutonomousEligible: asNullableBool(row.nba_autonomous_eligible),
    nbaFingerprint: row.nba_fingerprint ? String(row.nba_fingerprint) : null,
    priorityScore: (() => {
      if (row.priority_score == null) return null;
      const n = Number(row.priority_score);
      return Number.isFinite(n) ? n : null;
    })(),
    priorityTier: row.priority_tier ? String(row.priority_tier) : null,
    priorityScoreVersion: row.priority_score_version
      ? String(row.priority_score_version)
      : null,
    priorityAutomationSelectable: asNullableBool(row.priority_automation_selectable),
    priorityFingerprint: row.priority_fingerprint
      ? String(row.priority_fingerprint)
      : null,
    pipelineFingerprint: row.pipeline_fingerprint
      ? String(row.pipeline_fingerprint)
      : null,
    selected: asBool(row.selected),
    selectionSource: selection as SeoLedgerSelectionSource,
  };
}

async function defaultExecute(
  sql: string,
  params: ReadonlyArray<string | number | null>,
): Promise<RowDataPacket[]> {
  const [rows] = await getDbPool().execute(sql, [...params]);
  return rows as RowDataPacket[];
}

const RUN_SELECT = `SELECT
  id, created_at, completed_at, source, actor_admin_id,
  research_ok, research_error_code, pipeline_run_status, pipeline_version,
  pipeline_error_code, opportunity_count, gsc_status, durability_status
FROM seo_research_runs`;

const DECISION_SELECT = `SELECT
  id, run_id, opportunity_index, opportunity_identity, created_at,
  topic, working_title, research_recommendation, research_confidence,
  existing_coverage, matched_public_url, restore_path, target_post_id,
  evaluation_status, rf_verdict, rf_fingerprint, nba_action, nba_status,
  nba_autonomous_eligible, nba_fingerprint, priority_score, priority_tier,
  priority_score_version, priority_automation_selectable, priority_fingerprint,
  pipeline_fingerprint, selected, selection_source
FROM seo_opportunity_decisions`;

/**
 * List ResearchRuns newest-first with keyset pagination.
 * Query count: 1 SELECT. No decisions N+1.
 */
export async function listSeoResearchRuns(args?: {
  cursor?: string | null;
  pageSize?: number;
  deps?: SeoLedgerReadDeps;
}): Promise<ListSeoResearchRunsResult> {
  const pageSize = clampLedgerListPageSize(
    args?.pageSize ?? SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE,
  );
  const configured = (args?.deps?.isDatabaseConfigured ?? isDatabaseConfigured)();
  if (!configured) return sanitizeReadError("unavailable");

  let cursor = null as ReturnType<typeof decodeLedgerListCursor>;
  if (args?.cursor != null && args.cursor !== "") {
    cursor = decodeLedgerListCursor(args.cursor);
    if (!cursor) {
      return {
        ok: false,
        errorCode: "invalid_cursor",
        errorMessage: "Invalid Ledger page cursor.",
      };
    }
  }

  const execute = args?.deps?.execute ?? defaultExecute;
  const limit = pageSize + 1;

  try {
    let rows: RowDataPacket[];
    if (cursor) {
      rows = await execute(
        `${RUN_SELECT}
WHERE (created_at < ?) OR (created_at = ? AND id < ?)
ORDER BY created_at DESC, id DESC
LIMIT ?`,
        [cursor.createdAt, cursor.createdAt, cursor.id, limit],
      );
    } else {
      rows = await execute(
        `${RUN_SELECT}
ORDER BY created_at DESC, id DESC
LIMIT ?`,
        [limit],
      );
    }

    const mapped = (rows as RunPacket[]).map(mapRunRow);
    const hasMore = mapped.length > pageSize;
    const page = hasMore ? mapped.slice(0, pageSize) : mapped;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeLedgerListCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return { ok: true, runs: page, nextCursor, pageSize };
  } catch {
    return sanitizeReadError("query_error");
  }
}

/**
 * Load one ResearchRun + its decisions (≤5 expected).
 * Query count: 2 SELECTs. No provider/pipeline calls.
 */
export async function getSeoResearchRunDetail(args: {
  runId: string;
  deps?: SeoLedgerReadDeps;
}): Promise<GetSeoResearchRunDetailResult> {
  if (!isValidLedgerRunId(args.runId)) {
    return {
      ok: false,
      errorCode: "invalid_id",
      errorMessage: "Invalid Research run id.",
    };
  }

  const configured = (args.deps?.isDatabaseConfigured ?? isDatabaseConfigured)();
  if (!configured) return sanitizeReadError("unavailable");

  const execute = args.deps?.execute ?? defaultExecute;

  try {
    const runRows = await execute(`${RUN_SELECT} WHERE id = ? LIMIT 1`, [args.runId]);
    const runPacket = (runRows as RunPacket[])[0];
    if (!runPacket) {
      return {
        ok: false,
        errorCode: "not_found",
        errorMessage: "Research run not found.",
      };
    }

    const decisionRows = await execute(
      `${DECISION_SELECT}
WHERE run_id = ?
ORDER BY opportunity_index ASC
LIMIT ?`,
      [args.runId, SEO_LEDGER_DECISION_FETCH_LIMIT],
    );

    const packets = decisionRows as DecisionPacket[];
    const decisionOverflow = packets.length > 5;
    const decisions = packets.slice(0, 5).map(mapDecisionRow);

    return {
      ok: true,
      run: mapRunRow(runPacket),
      decisions,
      decisionOverflow,
    };
  } catch {
    return sanitizeReadError("query_error");
  }
}
