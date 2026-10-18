/**
 * L4B-4 — REAL MySQL lineage adapter acceptance.
 * Requires disposable loopback DB via tools/run-l4b4-mysql-integration.cjs.
 * Filename avoids `*.test.ts` so `npm run test:auth` never auto-runs mutations.
 * Never points at production. Provider-free. No schema ensure / version bump.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import {
  attemptEstablishPlanningDecisionLink,
  resolvePlanningDecisionLineage,
} from "../lib/cms/seo-planning-lineage";
import { createTrustedPlanningDecisionSelectionForTests } from "./seo-planning-lineage-test-harness";
import {
  createMysqlPlanningLineageStore,
  isMysqlForeignKeyParentDeleteBlocked,
} from "../lib/cms/seo-planning-lineage/mysql-store";
import {
  SEO_PLANNING_DECISION_LINKS_DDL,
  SEO_PLANNING_DECISION_LINKS_TABLE,
} from "../lib/cms/seo-planning-lineage/schema-ddl";
import { CMS_SCHEMA_STATEMENTS } from "../lib/db/schema";
import { getDbPool } from "../lib/db/pool";

const require = createRequire(import.meta.url);
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  validateDisposableMysqlTarget,
} = require("./ledger-mysql-disposable-guards.cjs") as {
  APPROVED_DB_NAME: string;
  APPROVED_PORT: string;
  validateDisposableMysqlTarget: (env: NodeJS.ProcessEnv) =>
    | { ok: true; host: string; port: string; database: string; user: string }
    | { ok: false; reason: string };
};

type SqlParam = string | number | boolean | null | Date;

function assertDisposableTarget() {
  if (String(process.env.L4B4_MYSQL_INTEGRATION || "") !== "1") {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: L4B4_MYSQL_INTEGRATION opt-in missing");
  }
  const gate = validateDisposableMysqlTarget(process.env);
  if (!gate.ok) {
    throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
  }
}

async function q<T extends RowDataPacket[]>(sql: string, params: SqlParam[] = []) {
  const [rows] = await getDbPool().query<T>(sql, params);
  return rows;
}

async function exec(sql: string, params: SqlParam[] = []) {
  await getDbPool().execute(sql, params);
}

async function assertIsolationIdentity() {
  assertDisposableTarget();
  const rows = await q<RowDataPacket[]>(
    `SELECT DATABASE() AS db, @@port AS port, @@bind_address AS bind_addr, @@version AS ver`,
  );
  assert.equal(String(rows[0].db), APPROVED_DB_NAME);
  assert.equal(String(rows[0].port), APPROVED_PORT);
  assert.equal(String(rows[0].bind_addr), "127.0.0.1");
  assert.match(String(rows[0].ver), /^8\.0\.46/);
  return String(rows[0].ver);
}

async function wipeAllTables() {
  await assertIsolationIdentity();
  await exec("SET FOREIGN_KEY_CHECKS=0");
  const tables = await q<RowDataPacket[]>(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  for (const row of tables) {
    await exec(`DROP TABLE IF EXISTS \`${String(row.name)}\``);
  }
  await exec("SET FOREIGN_KEY_CHECKS=1");
}

function parentDdlStatements(): string[] {
  return CMS_SCHEMA_STATEMENTS.filter((statement) =>
    /seo_planning_drafts|seo_research_runs|seo_opportunity_decisions/i.test(statement),
  );
}

async function applyIsolatedLineageParentsAndLinks() {
  for (const statement of parentDdlStatements()) {
    await exec(statement);
  }
  await exec(SEO_PLANNING_DECISION_LINKS_DDL);
}

async function seedRunDecisionPlanning(args: {
  runId: string;
  decisionId: string;
  planningId: string;
  topic: string;
  title: string;
  recommendation?: string;
  actorAdminId?: string;
  opportunityIndex?: number;
  includePipelineFields?: boolean;
  archived?: boolean;
}) {
  const actor = args.actorAdminId ?? "admin_shared";
  const recommendation = args.recommendation ?? "NEW_BLOG";
  const idx = args.opportunityIndex ?? 0;
  const includePipe = args.includePipelineFields !== false;

  await exec(
    `INSERT INTO seo_research_runs (
      id, created_at, completed_at, source, actor_admin_id, research_ok,
      research_error_code, pipeline_run_status, pipeline_version, pipeline_error_code,
      opportunity_count, gsc_status, durability_status
    ) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'manual', ?, 1,
      NULL, 'OK', 'v1', NULL, 1, 'OK', 'COMPLETE')`,
    [args.runId, actor],
  );

  await exec(
    `INSERT INTO seo_opportunity_decisions (
      id, run_id, opportunity_index, opportunity_identity, created_at,
      topic, working_title, research_recommendation, research_confidence,
      existing_coverage, matched_public_url, restore_path, target_post_id,
      evaluation_status, rf_verdict, rf_fingerprint, nba_action, nba_status,
      nba_autonomous_eligible, nba_fingerprint, priority_score, priority_tier,
      priority_score_version, priority_automation_selectable, priority_fingerprint,
      pipeline_fingerprint, selected, selection_source
    ) VALUES (
      ?, ?, ?, ?, UTC_TIMESTAMP(),
      ?, ?, ?, 'HIGH',
      'NONE', '', '', NULL,
      'OK', ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, 0, 'none'
    )`,
    [
      args.decisionId,
      args.runId,
      idx,
      `oid_${args.decisionId}`,
      args.topic,
      args.title,
      recommendation,
      includePipe ? "PASS_NEW_CONTENT" : null,
      includePipe ? "rf_1" : null,
      includePipe ? "NEW_BLOG" : null,
      includePipe ? "OK" : null,
      includePipe ? 1 : null,
      includePipe ? "nba_1" : null,
      includePipe ? 80 : null,
      includePipe ? "HIGH" : null,
      includePipe ? "v1" : null,
      includePipe ? 1 : null,
      includePipe ? "pri_1" : null,
      includePipe ? "pipe_1" : null,
    ],
  );

  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
      linked_post_id, created_by, payload, archived_at, created_at, updated_at
    ) VALUES (
      ?, ?, 'PLANNING', ?, ?, ?,
      ?, NULL, '', '', 'SETUP',
      NULL, ?, ?, ${args.archived ? "UTC_TIMESTAMP()" : "NULL"}, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
    [
      args.planningId,
      recommendation,
      `NEW_BLOG:fp_${args.planningId}`,
      args.topic,
      args.title,
      `slug-${args.planningId}`,
      actor,
      JSON.stringify({ kind: "l4b4-fixture" }),
    ],
  );
}

async function trusted(args: {
  planningDraftId: string;
  decisionId: string;
  researchRunId: string;
  actorAdminId?: string;
}) {
  return createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: args.planningDraftId,
    decisionId: args.decisionId,
    researchRunId: args.researchRunId,
    actorAdminId: args.actorAdminId ?? "admin_shared",
  });
}

let mysqlVersion = "";

test("0. isolation gate + disposable MySQL identity", async () => {
  mysqlVersion = await assertIsolationIdentity();
  assert.match(mysqlVersion, /^8\.0\.46/);
  assert.equal(process.env.DB_NAME, APPROVED_DB_NAME);
  assert.equal(process.env.DB_PORT, APPROVED_PORT);
  assert.equal(process.env.DB_HOST, "127.0.0.1");
});

test("1. table creation and required indexes", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  const tables = await q<RowDataPacket[]>(
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [SEO_PLANNING_DECISION_LINKS_TABLE],
  );
  assert.equal(tables.length, 1);
  const indexes = await q<RowDataPacket[]>(
    `SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [SEO_PLANNING_DECISION_LINKS_TABLE],
  );
  const names = new Set(indexes.map((r) => String(r.name)));
  assert.ok(names.has("PRIMARY"));
  assert.ok(names.has("seo_planning_decision_links_draft_unique"));
  assert.ok(names.has("seo_planning_decision_links_decision_unique"));
  assert.ok(names.has("seo_planning_decision_links_linked_at"));
});

test("2–3. Planning and Ledger decision foreign keys exist", async () => {
  const fks = await q<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS ref_table, DELETE_RULE AS del_rule
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [SEO_PLANNING_DECISION_LINKS_TABLE],
  );
  const byName = new Map(fks.map((r) => [String(r.name), r]));
  assert.equal(String(byName.get("seo_planning_decision_links_draft_fk")?.ref_table), "seo_planning_drafts");
  assert.equal(String(byName.get("seo_planning_decision_links_decision_fk")?.ref_table), "seo_opportunity_decisions");
  assert.equal(String(byName.get("seo_planning_decision_links_draft_fk")?.del_rule), "RESTRICT");
  assert.equal(String(byName.get("seo_planning_decision_links_decision_fk")?.del_rule), "RESTRICT");
});

test("4–5. unique Planning and decision constraints", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  // Shared identity fields so validation reaches UNIQUE/conflict checks (not IDENTITY_MISMATCH).
  const topic = "Unique constraint topic";
  const title = "Unique Constraint Title";
  await seedRunDecisionPlanning({
    runId: "seorun_u1",
    decisionId: "seodec_u1",
    planningId: "seoplan_u1",
    topic,
    title,
  });
  // Second decision matches Planning u1 identity (different decision id).
  await exec(
    `INSERT INTO seo_research_runs (
      id, created_at, completed_at, source, actor_admin_id, research_ok,
      research_error_code, pipeline_run_status, pipeline_version, pipeline_error_code,
      opportunity_count, gsc_status, durability_status
    ) VALUES ('seorun_u2', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'manual', 'admin_shared', 1,
      NULL, 'OK', 'v1', NULL, 1, 'OK', 'COMPLETE')`,
  );
  await exec(
    `INSERT INTO seo_opportunity_decisions (
      id, run_id, opportunity_index, opportunity_identity, created_at,
      topic, working_title, research_recommendation, research_confidence,
      existing_coverage, matched_public_url, restore_path, target_post_id,
      evaluation_status, rf_verdict, rf_fingerprint, nba_action, nba_status,
      nba_autonomous_eligible, nba_fingerprint, priority_score, priority_tier,
      priority_score_version, priority_automation_selectable, priority_fingerprint,
      pipeline_fingerprint, selected, selection_source
    ) VALUES (
      'seodec_u2', 'seorun_u2', 0, 'oid_u2', UTC_TIMESTAMP(),
      ?, ?, 'NEW_BLOG', 'HIGH',
      'NONE', '', '', NULL,
      'OK', 'PASS_NEW_CONTENT', 'rf_2', 'NEW_BLOG', 'OK',
      1, 'nba_2', 80, 'HIGH',
      'v1', 1, 'pri_2',
      'pipe_2', 0, 'none'
    )`,
    [topic, title],
  );
  // Second planning matches decision u1 identity (different planning id).
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
      linked_post_id, created_by, payload, archived_at, created_at, updated_at
    ) VALUES (
      'seoplan_u2', 'NEW_BLOG', 'PLANNING', 'NEW_BLOG:fp_seoplan_u2', ?, ?,
      'slug-seoplan-u2', NULL, '', '', 'SETUP',
      NULL, 'admin_shared', ?, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
    [topic, title, JSON.stringify({ kind: "l4b4-fixture" })],
  );

  const store = createMysqlPlanningLineageStore();
  const first = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_u1",
    decisionId: "seodec_u1",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_u1",
      decisionId: "seodec_u1",
      researchRunId: "seorun_u1",
    }),
    createLinkId: () => "seoplink_u1",
  });
  assert.equal(first.ok, true);

  // Same planning + different decision → conflict (unique planning)
  const conflictDraft = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_u1",
    decisionId: "seodec_u2",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_u1",
      decisionId: "seodec_u2",
      researchRunId: "seorun_u2",
    }),
    createLinkId: () => "seoplink_u_conflict_draft",
  });
  assert.equal(conflictDraft.ok, false);
  if (!conflictDraft.ok) assert.equal(conflictDraft.errorCode, "LINK_CONFLICT");

  // Different planning + same decision → conflict (unique decision)
  const conflictDecision = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_u2",
    decisionId: "seodec_u1",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_u2",
      decisionId: "seodec_u1",
      researchRunId: "seorun_u1",
    }),
    createLinkId: () => "seoplink_u_conflict_decision",
  });
  assert.equal(conflictDecision.ok, false);
  if (!conflictDecision.ok) assert.equal(conflictDecision.errorCode, "LINK_CONFLICT");

  const count = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(Number(count[0].c), 1);
});

test("6. valid transaction commit creates one link", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  await seedRunDecisionPlanning({
    runId: "seorun_c1",
    decisionId: "seodec_c1",
    planningId: "seoplan_c1",
    topic: "Commit topic",
    title: "Commit Title",
  });
  const store = createMysqlPlanningLineageStore();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_c1",
    decisionId: "seodec_c1",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_c1",
      decisionId: "seodec_c1",
      researchRunId: "seorun_c1",
    }),
    createLinkId: () => "seoplink_c1",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "CREATED");
  assert.equal(result.link.id, "seoplink_c1");
  const rows = await q<RowDataPacket[]>(
    `SELECT id, planning_draft_id, decision_id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].planning_draft_id), "seoplan_c1");
});

test("7. same-pair idempotency", async () => {
  const store = createMysqlPlanningLineageStore();
  const again = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_c1",
    decisionId: "seodec_c1",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_c1",
      decisionId: "seodec_c1",
      researchRunId: "seorun_c1",
    }),
    createLinkId: () => "seoplink_c1_retry",
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.status, "IDEMPOTENT");
  assert.equal(again.link.id, "seoplink_c1");
  const count = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(Number(count[0].c), 1);
});

test("8. conflicting association rejection", async () => {
  // Decision c2 must match Planning c1 identity so validation reaches LINK_CONFLICT.
  await exec(
    `INSERT INTO seo_research_runs (
      id, created_at, completed_at, source, actor_admin_id, research_ok,
      research_error_code, pipeline_run_status, pipeline_version, pipeline_error_code,
      opportunity_count, gsc_status, durability_status
    ) VALUES ('seorun_c2', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'manual', 'admin_shared', 1,
      NULL, 'OK', 'v1', NULL, 1, 'OK', 'COMPLETE')`,
  );
  await exec(
    `INSERT INTO seo_opportunity_decisions (
      id, run_id, opportunity_index, opportunity_identity, created_at,
      topic, working_title, research_recommendation, research_confidence,
      existing_coverage, matched_public_url, restore_path, target_post_id,
      evaluation_status, rf_verdict, rf_fingerprint, nba_action, nba_status,
      nba_autonomous_eligible, nba_fingerprint, priority_score, priority_tier,
      priority_score_version, priority_automation_selectable, priority_fingerprint,
      pipeline_fingerprint, selected, selection_source
    ) VALUES (
      'seodec_c2', 'seorun_c2', 0, 'oid_c2', UTC_TIMESTAMP(),
      'Commit topic', 'Commit Title', 'NEW_BLOG', 'HIGH',
      'NONE', '', '', NULL,
      'OK', 'PASS_NEW_CONTENT', 'rf_c2', 'NEW_BLOG', 'OK',
      1, 'nba_c2', 80, 'HIGH',
      'v1', 1, 'pri_c2',
      'pipe_c2', 0, 'none'
    )`,
  );
  const store = createMysqlPlanningLineageStore();
  const conflict = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_c1",
    decisionId: "seodec_c2",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_c1",
      decisionId: "seodec_c2",
      researchRunId: "seorun_c2",
    }),
    createLinkId: () => "seoplink_conflict",
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.errorCode, "LINK_CONFLICT");
});

test("9. cross-connection concurrent same-pair → exactly one link", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  await seedRunDecisionPlanning({
    runId: "seorun_race",
    decisionId: "seodec_race",
    planningId: "seoplan_race",
    topic: "Race topic",
    title: "Race Title",
  });

  const storeA = createMysqlPlanningLineageStore();
  const storeB = createMysqlPlanningLineageStore();
  const results = await Promise.all([
    attemptEstablishPlanningDecisionLink({
      planningDraftId: "seoplan_race",
      decisionId: "seodec_race",
      actorAdminId: "admin_shared",
      store: storeA,
      trustedSelection: await trusted({
        planningDraftId: "seoplan_race",
        decisionId: "seodec_race",
        researchRunId: "seorun_race",
      }),
      createLinkId: () => "seoplink_race_a",
    }),
    attemptEstablishPlanningDecisionLink({
      planningDraftId: "seoplan_race",
      decisionId: "seodec_race",
      actorAdminId: "admin_shared",
      store: storeB,
      trustedSelection: await trusted({
        planningDraftId: "seoplan_race",
        decisionId: "seodec_race",
        researchRunId: "seorun_race",
      }),
      createLinkId: () => "seoplink_race_b",
    }),
  ]);

  const ok = results.filter((r) => r.ok);
  assert.equal(ok.length, 2);
  const created = ok.filter((r) => r.ok && r.status === "CREATED");
  const idempotent = ok.filter((r) => r.ok && r.status === "IDEMPOTENT");
  assert.equal(created.length, 1);
  assert.equal(idempotent.length, 1);
  const count = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(Number(count[0].c), 1);
});

test("9b. concurrent conflicting A/X vs A/Y → at most one decision association", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  const topic = "Concurrent conflict topic";
  const title = "Concurrent Conflict Title";
  await seedRunDecisionPlanning({
    runId: "seorun_cx",
    decisionId: "seodec_cx",
    planningId: "seoplan_cx",
    topic,
    title,
  });
  await exec(
    `INSERT INTO seo_research_runs (
      id, created_at, completed_at, source, actor_admin_id, research_ok,
      research_error_code, pipeline_run_status, pipeline_version, pipeline_error_code,
      opportunity_count, gsc_status, durability_status
    ) VALUES ('seorun_cy', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'manual', 'admin_shared', 1,
      NULL, 'OK', 'v1', NULL, 1, 'OK', 'COMPLETE')`,
  );
  await exec(
    `INSERT INTO seo_opportunity_decisions (
      id, run_id, opportunity_index, opportunity_identity, created_at,
      topic, working_title, research_recommendation, research_confidence,
      existing_coverage, matched_public_url, restore_path, target_post_id,
      evaluation_status, rf_verdict, rf_fingerprint, nba_action, nba_status,
      nba_autonomous_eligible, nba_fingerprint, priority_score, priority_tier,
      priority_score_version, priority_automation_selectable, priority_fingerprint,
      pipeline_fingerprint, selected, selection_source
    ) VALUES (
      'seodec_cy', 'seorun_cy', 0, 'oid_cy', UTC_TIMESTAMP(),
      ?, ?, 'NEW_BLOG', 'HIGH',
      'NONE', '', '', NULL,
      'OK', 'PASS_NEW_CONTENT', 'rf_cy', 'NEW_BLOG', 'OK',
      1, 'nba_cy', 80, 'HIGH',
      'v1', 1, 'pri_cy',
      'pipe_cy', 0, 'none'
    )`,
    [topic, title],
  );

  const storeA = createMysqlPlanningLineageStore();
  const storeB = createMysqlPlanningLineageStore();
  const results = await Promise.all([
    attemptEstablishPlanningDecisionLink({
      planningDraftId: "seoplan_cx",
      decisionId: "seodec_cx",
      actorAdminId: "admin_shared",
      store: storeA,
      trustedSelection: await trusted({
        planningDraftId: "seoplan_cx",
        decisionId: "seodec_cx",
        researchRunId: "seorun_cx",
      }),
      createLinkId: () => "seoplink_cx",
    }),
    attemptEstablishPlanningDecisionLink({
      planningDraftId: "seoplan_cx",
      decisionId: "seodec_cy",
      actorAdminId: "admin_shared",
      store: storeB,
      trustedSelection: await trusted({
        planningDraftId: "seoplan_cx",
        decisionId: "seodec_cy",
        researchRunId: "seorun_cy",
      }),
      createLinkId: () => "seoplink_cy",
    }),
  ]);

  const created = results.filter((r) => r.ok && r.status === "CREATED");
  const failed = results.filter((r) => !r.ok);
  assert.equal(created.length, 1);
  assert.ok(failed.length >= 1);
  const count = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${SEO_PLANNING_DECISION_LINKS_TABLE} WHERE planning_draft_id = ?`,
    ["seoplan_cx"],
  );
  assert.equal(Number(count[0].c), 1);
});

test("10. transaction rollback on failure leaves no partial link", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  await seedRunDecisionPlanning({
    runId: "seorun_rb",
    decisionId: "seodec_rb",
    planningId: "seoplan_rb",
    topic: "Rollback topic",
    title: "Rollback Title",
  });

  // Force failure: insert with duplicate primary key after a successful first link.
  const store = createMysqlPlanningLineageStore();
  const first = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_rb",
    decisionId: "seodec_rb",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_rb",
      decisionId: "seodec_rb",
      researchRunId: "seorun_rb",
    }),
    createLinkId: () => "seoplink_rb",
  });
  assert.equal(first.ok, true);

  // Direct insert of a second row with same PK must fail and roll back (no extra row).
  let threw = false;
  try {
    await exec(
      `INSERT INTO ${SEO_PLANNING_DECISION_LINKS_TABLE}
        (id, planning_draft_id, decision_id, linked_by_admin_id, linked_at, selection_marker)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), 'server_research_binding')`,
      ["seoplink_rb", "seoplan_rb", "seodec_rb", "admin_shared"],
    );
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
  const count = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(Number(count[0].c), 1);
});

test("11. missing parent records rejected", async () => {
  const store = createMysqlPlanningLineageStore();
  const missing = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_missing",
    decisionId: "seodec_rb",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_missing",
      decisionId: "seodec_rb",
      researchRunId: "seorun_rb",
    }),
    createLinkId: () => "seoplink_missing",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.errorCode, "MISSING_PLANNING_DRAFT");
});

test("12. archiving a linked Planning draft remains possible", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  await seedRunDecisionPlanning({
    runId: "seorun_ar",
    decisionId: "seodec_ar",
    planningId: "seoplan_ar",
    topic: "Archive topic",
    title: "Archive Title",
  });
  const store = createMysqlPlanningLineageStore();
  const linked = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_ar",
    decisionId: "seodec_ar",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_ar",
      decisionId: "seodec_ar",
      researchRunId: "seorun_ar",
    }),
    createLinkId: () => "seoplink_ar",
  });
  assert.equal(linked.ok, true);

  await exec(
    `UPDATE seo_planning_drafts SET archived_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
    ["seoplan_ar"],
  );
  const draft = await store.getPlanningDraftById("seoplan_ar");
  assert.ok(draft?.archivedAt);
  const linkStill = await store.getLinkByPlanningDraftId("seoplan_ar");
  assert.equal(linkStill?.decisionId, "seodec_ar");
});

test("13. permanent-delete FK RESTRICT blocks linked Planning delete (compatibility blocker)", async () => {
  let blocked = false;
  try {
    await exec(`DELETE FROM seo_planning_drafts WHERE id = ?`, ["seoplan_ar"]);
  } catch (error) {
    blocked = isMysqlForeignKeyParentDeleteBlocked(error);
  }
  assert.equal(blocked, true);
  const still = await q<RowDataPacket[]>(
    `SELECT id FROM seo_planning_drafts WHERE id = ?`,
    ["seoplan_ar"],
  );
  assert.equal(still.length, 1);

  // Unlinked planning delete remains possible.
  await seedRunDecisionPlanning({
    runId: "seorun_del",
    decisionId: "seodec_del",
    planningId: "seoplan_unlinked_del",
    topic: "Unlinked delete topic",
    title: "Unlinked Delete Title",
  });
  await exec(`DELETE FROM seo_planning_drafts WHERE id = ?`, ["seoplan_unlinked_del"]);
  const gone = await q<RowDataPacket[]>(
    `SELECT id FROM seo_planning_drafts WHERE id = ?`,
    ["seoplan_unlinked_del"],
  );
  assert.equal(gone.length, 0);

  // Ledger history must not cascade-delete from Planning delete attempts.
  const decisions = await q<RowDataPacket[]>(
    `SELECT id FROM seo_opportunity_decisions WHERE id = ?`,
    ["seodec_ar"],
  );
  assert.equal(decisions.length, 1);
});

test("14. read-only lineage resolution LINKED / UNLINKED / UNAVAILABLE", async () => {
  const store = createMysqlPlanningLineageStore();
  const linked = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_ar",
    store,
  });
  assert.equal(linked.ok, true);
  if (linked.ok) {
    assert.equal(linked.state, "LINKED");
    assert.equal(linked.link.decisionId, "seodec_ar");
  }

  const unlinked = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_unlinked_del",
    store,
  });
  // Draft was deleted — still UNLINKED (no link row), not a crash.
  assert.equal(unlinked.ok, true);
  if (unlinked.ok) assert.equal(unlinked.state, "UNLINKED");

  await exec(`DROP TABLE ${SEO_PLANNING_DECISION_LINKS_TABLE}`);
  const unavailable = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_ar",
    store,
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.state, "UNAVAILABLE");
    assert.equal(unavailable.errorCode, "SCHEMA_UNAVAILABLE");
  }
  // Restore table for remaining tests.
  await exec(SEO_PLANNING_DECISION_LINKS_DDL);
});

test("15. incomplete Pipeline snapshot remains non-ready (INCOMPLETE flag on resolve)", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  await seedRunDecisionPlanning({
    runId: "seorun_inc",
    decisionId: "seodec_inc",
    planningId: "seoplan_inc",
    topic: "Incomplete topic",
    title: "Incomplete Title",
    includePipelineFields: false,
  });
  const store = createMysqlPlanningLineageStore();
  const established = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_inc",
    decisionId: "seodec_inc",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_inc",
      decisionId: "seodec_inc",
      researchRunId: "seorun_inc",
    }),
    createLinkId: () => "seoplink_inc",
  });
  assert.equal(established.ok, true);

  const resolved = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_inc",
    store,
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok && resolved.state === "LINKED") {
    assert.equal(resolved.pipelineSnapshotIncomplete, true);
  } else {
    assert.fail("expected LINKED with incomplete pipeline snapshot flag");
  }

  // Autonomy Evidence Pack is out of L4B scope on this candidate.
  // Lineage recording must not authorize auto-publish.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const proceedSrc = readFileSync(
    join(__dirname, "../lib/cms/seo-planning-lineage/proceed-integration.ts"),
    "utf8",
  );
  assert.match(proceedSrc, /RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED\s*=\s*false/);
});

test("16. trusted selection remains mandatory — no client decision-id write", async () => {
  await wipeAllTables();
  await applyIsolatedLineageParentsAndLinks();
  await seedRunDecisionPlanning({
    runId: "seorun_trust",
    decisionId: "seodec_trust",
    planningId: "seoplan_trust",
    topic: "Trust topic",
    title: "Trust Title",
  });
  const store = createMysqlPlanningLineageStore();
  const forged = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_trust",
    decisionId: "seodec_trust",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: null,
  });
  assert.equal(forged.ok, false);
  if (!forged.ok) assert.equal(forged.errorCode, "SELECTION_PROVENANCE_UNAVAILABLE");
  const count = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(Number(count[0].c), 0);
});

test("17. sanitized errors — no SQL secrets in establish failure path", async () => {
  const store = createMysqlPlanningLineageStore();
  // Valid decision-id shape that is absent from disposable MySQL (underscores are invalid).
  const missingDecisionId = "seodec_missingdec";
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_trust",
    decisionId: missingDecisionId,
    actorAdminId: "admin_shared",
    store,
    trustedSelection: await trusted({
      planningDraftId: "seoplan_trust",
      decisionId: missingDecisionId,
      researchRunId: "seorun_trust",
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.doesNotMatch(result.errorMessage, /ER_|SQLSTATE|password|secret|INSERT INTO/i);
  }
});

test("cleanup: end pool so disposable mysqld can stop cleanly", async () => {
  await getDbPool().end();
});
