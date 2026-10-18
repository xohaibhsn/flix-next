/**
 * L4B-4 — Real MySQL PlanningLineageStore adapter.
 *
 * Server-only. Disconnected from live CMS actions and repository initialization.
 * Not registered with schema ensure. Production writes remain unauthorized until
 * Berlin activates a POST_CONCURRENCY_V6 migration and delete-policy reconciliation.
 *
 * Do not import this module from client components or client-accessible barrels.
 */

import "server-only";

import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";
import { fromMysqlDateTime, toMysqlDateTime } from "@/lib/cms/mysql-migrate";
import { sanitizeSeoPlanningDraft } from "@/lib/cms/seo-planning/sanitize";
import {
  PlanningLineageConflictError,
  type PlanningLineageStore,
} from "@/lib/cms/seo-planning-lineage/repository";
import { SEO_PLANNING_DECISION_LINKS_TABLE } from "@/lib/cms/seo-planning-lineage/schema-ddl";
import type { SeoPlanningDecisionLinkRow } from "@/lib/cms/seo-planning-lineage/types";
import { mysqlDuplicateError } from "@/lib/cms/slug-change";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { getDbPool, withTransaction } from "@/lib/db/pool";

type Queryable = Pick<Pool, "execute"> | Pick<PoolConnection, "execute">;

type SqlParam = string | number | boolean | null | Date;

type PlanningPacket = RowDataPacket & {
  id: string;
  recommendation: string;
  workflow_status: string;
  fingerprint: string;
  topic: string;
  working_title: string;
  proposed_slug: string;
  target_post_id: string | null;
  matched_public_url: string;
  restore_path: string;
  search_intent: string;
  linked_post_id: string | null;
  created_by: string;
  payload: unknown;
  archived_at: unknown;
  created_at: unknown;
  updated_at: unknown;
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

type LinkPacket = RowDataPacket & {
  id: string;
  planning_draft_id: string;
  decision_id: string;
  linked_by_admin_id: string;
  linked_at: unknown;
  selection_marker: string;
};

export type MysqlPlanningLineageStoreDeps = {
  getPool?: () => Pool;
  withTransaction?: typeof withTransaction;
};

function asBool(value: number | boolean): boolean {
  return value === true || value === 1;
}

function asNullableBool(value: number | boolean | null): boolean | null {
  if (value == null) return null;
  return asBool(value);
}

function toIsoDateTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const s = String(value || "").trim();
  if (!s) return new Date(0).toISOString();
  // MySQL DATETIME "YYYY-MM-DD HH:MM:SS" → ISO
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return `${s.replace(" ", "T")}.000Z`;
  }
  try {
    return fromMysqlDateTime(value);
  } catch {
    return s;
  }
}

function toMysqlDateTimeUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 19).replace("T", " ");
  }
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through */
    }
  }
  return {};
}

function mapPlanning(row: PlanningPacket): SeoPlanningDraft {
  const archivedAt =
    row.archived_at == null || row.archived_at === ""
      ? null
      : toIsoDateTime(row.archived_at);
  return sanitizeSeoPlanningDraft({
    id: String(row.id),
    recommendation: String(row.recommendation || ""),
    workflowStatus: String(row.workflow_status || "PLANNING") as SeoPlanningDraft["workflowStatus"],
    fingerprint: String(row.fingerprint || ""),
    topic: String(row.topic || ""),
    workingTitle: String(row.working_title || ""),
    proposedSlug: String(row.proposed_slug || ""),
    targetPostId: row.target_post_id ? String(row.target_post_id) : null,
    matchedPublicUrl: String(row.matched_public_url || ""),
    restorePath: String(row.restore_path || ""),
    searchIntent: String(row.search_intent || ""),
    linkedPostId: row.linked_post_id ? String(row.linked_post_id) : null,
    createdBy: String(row.created_by || ""),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    archivedAt,
    payload: parsePayload(row.payload),
  });
}

function mapRun(row: RunPacket): SeoResearchRunRow {
  return {
    id: String(row.id),
    createdAt: toIsoDateTime(row.created_at),
    completedAt: toIsoDateTime(row.completed_at),
    source: row.source === "autonomous" ? "autonomous" : "manual",
    actorAdminId: row.actor_admin_id ? String(row.actor_admin_id) : null,
    researchOk: asBool(row.research_ok),
    researchErrorCode: row.research_error_code ? String(row.research_error_code) : null,
    pipelineRunStatus: String(row.pipeline_run_status || "") as SeoResearchRunRow["pipelineRunStatus"],
    pipelineVersion: row.pipeline_version ? String(row.pipeline_version) : null,
    pipelineErrorCode: row.pipeline_error_code ? String(row.pipeline_error_code) : null,
    opportunityCount: Number(row.opportunity_count) || 0,
    gscStatus: row.gsc_status ? String(row.gsc_status) : null,
    durabilityStatus: String(row.durability_status || "") as SeoResearchRunRow["durabilityStatus"],
  };
}

function mapDecision(row: DecisionPacket): SeoOpportunityDecisionRow {
  const selection =
    row.selection_source === "manual_proceed" || row.selection_source === "autonomous"
      ? row.selection_source
      : "none";
  return {
    id: String(row.id),
    runId: String(row.run_id),
    opportunityIndex: Number(row.opportunity_index) || 0,
    opportunityIdentity: String(row.opportunity_identity || ""),
    createdAt: toIsoDateTime(row.created_at),
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
    selectionSource: selection as SeoOpportunityDecisionRow["selectionSource"],
  };
}

function mapLink(row: LinkPacket): SeoPlanningDecisionLinkRow {
  return {
    id: String(row.id),
    planningDraftId: String(row.planning_draft_id),
    decisionId: String(row.decision_id),
    linkedByAdminId: String(row.linked_by_admin_id),
    linkedAt: toIsoDateTime(row.linked_at),
    selectionMarker:
      row.selection_marker === "server_research_binding"
        ? "server_research_binding"
        : "server_research_binding",
  };
}

function isFkParentMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const errno = "errno" in error ? Number(error.errno) : 0;
  return code === "ER_NO_REFERENCED_ROW_2" || errno === 1452;
}

function isFkChildReferenced(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const errno = "errno" in error ? Number(error.errno) : 0;
  return code === "ER_ROW_IS_REFERENCED_2" || errno === 1451;
}

async function queryOne<T extends RowDataPacket>(
  db: Queryable,
  sql: string,
  params: SqlParam[],
): Promise<T | null> {
  const [rows] = await db.execute<T[]>(sql, params);
  return rows[0] ?? null;
}

/**
 * Insert a lineage link on an already-open connection (no nested BEGIN/COMMIT).
 * Used by L4B-6 shared-transaction Proceed+link and by pool-scoped store TX.
 */
export async function insertPlanningDecisionLinkOnConnection(
  conn: PoolConnection,
  link: SeoPlanningDecisionLinkRow,
): Promise<void> {
  try {
    const [planningRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE`,
      [link.planningDraftId],
    );
    if (!planningRows[0]) {
      throw new Error("PLANNING_PARENT_MISSING");
    }

    const [decisionRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM seo_opportunity_decisions WHERE id = ? LIMIT 1 FOR UPDATE`,
      [link.decisionId],
    );
    if (!decisionRows[0]) {
      throw new Error("DECISION_PARENT_MISSING");
    }

    await conn.execute(
      `SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}
       WHERE planning_draft_id = ? OR decision_id = ?
       LIMIT 2 FOR UPDATE`,
      [link.planningDraftId, link.decisionId],
    );

    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO ${SEO_PLANNING_DECISION_LINKS_TABLE} (
         id, planning_draft_id, decision_id, linked_by_admin_id, linked_at, selection_marker
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        link.id,
        link.planningDraftId,
        link.decisionId,
        link.linkedByAdminId,
        toMysqlDateTimeUtc(link.linkedAt),
        link.selectionMarker,
      ],
    );
    if (!result.affectedRows) {
      throw new Error("LINEAGE_INSERT_NO_ROWS");
    }
  } catch (error) {
    if (error instanceof PlanningLineageConflictError) throw error;
    if (mysqlDuplicateError(error)) {
      throw new PlanningLineageConflictError();
    }
    if (isFkParentMissing(error)) {
      throw new Error("Could not persist Planning decision lineage.");
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "PLANNING_PARENT_MISSING" || message === "DECISION_PARENT_MISSING") {
      throw new Error("Could not persist Planning decision lineage.");
    }
    if (message === "LINEAGE_INSERT_NO_ROWS") {
      throw new Error("Could not persist Planning decision lineage.");
    }
    if (message === "Could not persist Planning decision lineage.") throw error;
    throw new Error("Could not persist Planning decision lineage.");
  }
}

export async function getSeoPlanningDraftByFingerprintOnConnection(
  conn: PoolConnection,
  fingerprint: string,
): Promise<SeoPlanningDraft | null> {
  const fp = String(fingerprint || "").trim();
  if (!fp) return null;
  const row = await queryOne<PlanningPacket>(
    conn,
    `SELECT id, recommendation, workflow_status, fingerprint, topic, working_title,
            proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
            linked_post_id, created_by, payload, archived_at, created_at, updated_at
     FROM seo_planning_drafts
     WHERE fingerprint = ?
     LIMIT 1
     FOR UPDATE`,
    [fp],
  );
  return row ? mapPlanning(row) : null;
}

export async function getSeoPlanningDraftByIdForUpdateOnConnection(
  conn: PoolConnection,
  id: string,
): Promise<SeoPlanningDraft | null> {
  const row = await queryOne<PlanningPacket>(
    conn,
    `SELECT id, recommendation, workflow_status, fingerprint, topic, working_title,
            proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
            linked_post_id, created_by, payload, archived_at, created_at, updated_at
     FROM seo_planning_drafts
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [id],
  );
  return row ? mapPlanning(row) : null;
}

export async function insertSeoPlanningDraftOnConnection(
  conn: PoolConnection,
  draft: SeoPlanningDraft,
): Promise<SeoPlanningDraft> {
  const safe = sanitizeSeoPlanningDraft(draft);
  if (!safe.id || !safe.fingerprint) {
    throw new Error("Planning draft requires id and fingerprint.");
  }
  const archivedAtSql = safe.archivedAt ? toMysqlDateTime(safe.archivedAt) : null;
  await conn.execute(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title, proposed_slug,
      target_post_id, matched_public_url, restore_path, search_intent, linked_post_id,
      created_by, payload, archived_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      safe.id,
      safe.recommendation,
      safe.workflowStatus,
      safe.fingerprint,
      safe.topic,
      safe.workingTitle,
      safe.proposedSlug,
      safe.targetPostId,
      safe.matchedPublicUrl,
      safe.restorePath,
      safe.searchIntent,
      safe.linkedPostId,
      safe.createdBy,
      JSON.stringify(safe.payload || {}),
      archivedAtSql,
      toMysqlDateTime(safe.createdAt),
      toMysqlDateTime(safe.updatedAt),
    ],
  );
  return safe;
}

export async function deleteSeoPlanningDraftOnConnection(
  conn: PoolConnection,
  id: string,
): Promise<void> {
  await conn.execute(`DELETE FROM seo_planning_drafts WHERE id = ?`, [id]);
}

function buildStore(db: Queryable, insertLink: (link: SeoPlanningDecisionLinkRow) => Promise<void>): PlanningLineageStore {
  return {
    async isLineageSchemaAvailable(): Promise<boolean> {
      try {
        const [rows] = await db.execute<RowDataPacket[]>(
          `SELECT 1 AS ok
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = ?
           LIMIT 1`,
          [SEO_PLANNING_DECISION_LINKS_TABLE],
        );
        return Boolean(rows[0]);
      } catch {
        return false;
      }
    },

    async getPlanningDraftById(id: string): Promise<SeoPlanningDraft | null> {
      const row = await queryOne<PlanningPacket>(
        db,
        `SELECT id, recommendation, workflow_status, fingerprint, topic, working_title,
                proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
                linked_post_id, created_by, payload, archived_at, created_at, updated_at
         FROM seo_planning_drafts
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      return row ? mapPlanning(row) : null;
    },

    async getDecisionById(id: string): Promise<SeoOpportunityDecisionRow | null> {
      const row = await queryOne<DecisionPacket>(
        db,
        `SELECT id, run_id, opportunity_index, opportunity_identity, created_at,
                topic, working_title, research_recommendation, research_confidence,
                existing_coverage, matched_public_url, restore_path, target_post_id,
                evaluation_status, rf_verdict, rf_fingerprint, nba_action, nba_status,
                nba_autonomous_eligible, nba_fingerprint, priority_score, priority_tier,
                priority_score_version, priority_automation_selectable, priority_fingerprint,
                pipeline_fingerprint, selected, selection_source
         FROM seo_opportunity_decisions
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      return row ? mapDecision(row) : null;
    },

    async getResearchRunById(id: string): Promise<SeoResearchRunRow | null> {
      const row = await queryOne<RunPacket>(
        db,
        `SELECT id, created_at, completed_at, source, actor_admin_id,
                research_ok, research_error_code, pipeline_run_status, pipeline_version,
                pipeline_error_code, opportunity_count, gsc_status, durability_status
         FROM seo_research_runs
         WHERE id = ?
         LIMIT 1`,
        [id],
      );
      return row ? mapRun(row) : null;
    },

    async getLinkByPlanningDraftId(id: string): Promise<SeoPlanningDecisionLinkRow | null> {
      const row = await queryOne<LinkPacket>(
        db,
        `SELECT id, planning_draft_id, decision_id, linked_by_admin_id, linked_at, selection_marker
         FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}
         WHERE planning_draft_id = ?
         LIMIT 1`,
        [id],
      );
      return row ? mapLink(row) : null;
    },

    async getLinkByDecisionId(id: string): Promise<SeoPlanningDecisionLinkRow | null> {
      const row = await queryOne<LinkPacket>(
        db,
        `SELECT id, planning_draft_id, decision_id, linked_by_admin_id, linked_at, selection_marker
         FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}
         WHERE decision_id = ?
         LIMIT 1`,
        [id],
      );
      return row ? mapLink(row) : null;
    },

    async insertLinkInTransaction(link: SeoPlanningDecisionLinkRow): Promise<void> {
      await insertLink(link);
    },
  };
}

/**
 * Create a PlanningLineageStore backed by MySQL pool (own short transactions per write).
 * Callers must inject this only in server/test contexts — never from browser actions.
 */
export function createMysqlPlanningLineageStore(
  deps?: MysqlPlanningLineageStoreDeps,
): PlanningLineageStore {
  const poolOf = deps?.getPool ?? getDbPool;
  const tx = deps?.withTransaction ?? withTransaction;
  return buildStore(poolOf(), async (link) => {
    await tx(async (conn) => {
      await insertPlanningDecisionLinkOnConnection(conn, link);
    });
  });
}

/**
 * L4B-6 — Store bound to an already-open connection (no nested BEGIN/COMMIT).
 * All reads/writes participate in the caller's transaction.
 */
export function createMysqlPlanningLineageStoreOnConnection(
  conn: PoolConnection,
): PlanningLineageStore {
  return buildStore(conn, async (link) => {
    await insertPlanningDecisionLinkOnConnection(conn, link);
  });
}

/** Exported for focused FK deletion tests only — not a CMS delete API. */
export function isMysqlForeignKeyParentDeleteBlocked(error: unknown): boolean {
  return isFkChildReferenced(error);
}
