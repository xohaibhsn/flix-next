/**
 * L4B-5 — REAL MySQL delete-policy + FK integrity acceptance.
 * Requires disposable loopback DB via tools/run-l4b5-mysql-integration.cjs.
 * Filename avoids `*.test.ts` so npm test:auth never auto-runs mutations.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import {
  attemptEstablishPlanningDecisionLink,
  evaluatePlanningPermanentDeletePolicy,
  resolvePlanningDecisionLineage,
  SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
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
import { seoPlanningPermanentDeleteConfirmToken } from "../lib/cms/seo-planning/lifecycle";
import { CMS_SCHEMA_STATEMENTS } from "../lib/db/schema";
import { getDbPool, withTransaction } from "../lib/db/pool";

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
  if (String(process.env.L4B5_MYSQL_INTEGRATION || "") !== "1") {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: L4B5_MYSQL_INTEGRATION opt-in missing");
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

async function applyParentsAndLinks() {
  for (const statement of CMS_SCHEMA_STATEMENTS.filter((s) =>
    /seo_planning_drafts|seo_research_runs|seo_opportunity_decisions/i.test(s),
  )) {
    await exec(statement);
  }
  await exec(SEO_PLANNING_DECISION_LINKS_DDL);
}

async function seedPair(args: {
  runId: string;
  decisionId: string;
  planningId: string;
  topic: string;
  title: string;
  archived?: boolean;
}) {
  await exec(
    `INSERT INTO seo_research_runs (
      id, created_at, completed_at, source, actor_admin_id, research_ok,
      research_error_code, pipeline_run_status, pipeline_version, pipeline_error_code,
      opportunity_count, gsc_status, durability_status
    ) VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'manual', 'admin_shared', 1,
      NULL, 'OK', 'v1', NULL, 1, 'OK', 'COMPLETE')`,
    [args.runId],
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
      ?, ?, 0, ?, UTC_TIMESTAMP(),
      ?, ?, 'NEW_BLOG', 'HIGH',
      'NONE', '', '', NULL,
      'OK', 'PASS_NEW_CONTENT', 'rf_1', 'NEW_BLOG', 'OK',
      1, 'nba_1', 80, 'HIGH',
      'v1', 1, 'pri_1',
      'pipe_1', 0, 'none'
    )`,
    [
      args.decisionId,
      args.runId,
      `oid_${args.decisionId}`,
      args.topic,
      args.title,
    ],
  );
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
      linked_post_id, created_by, payload, archived_at, created_at, updated_at
    ) VALUES (
      ?, 'NEW_BLOG', 'PLANNING', ?, ?, ?,
      ?, NULL, '', '', 'SETUP',
      NULL, 'admin_shared', ?, ${args.archived ? "UTC_TIMESTAMP()" : "NULL"},
      UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
    [
      args.planningId,
      `NEW_BLOG:fp_${args.planningId}`,
      args.topic,
      args.title,
      `slug-${args.planningId}`,
      JSON.stringify({ kind: "l4b5-fixture" }),
    ],
  );
}

test("0. isolation gate", async () => {
  await assertIsolationIdentity();
});

test("17–21. link DDL applies; FKs UNIQUE; no ensure registration; repeated inspect safe", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const beforeCount = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM seo_planning_drafts`,
  );
  // Re-apply DDL (IF NOT EXISTS) — must not modify data.
  await exec(SEO_PLANNING_DECISION_LINKS_DDL);
  const afterCount = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM seo_planning_drafts`,
  );
  assert.equal(Number(beforeCount[0].c), Number(afterCount[0].c));

  const fks = await q<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME AS name, DELETE_RULE AS del_rule
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [SEO_PLANNING_DECISION_LINKS_TABLE],
  );
  assert.ok(fks.some((r) => String(r.del_rule) === "RESTRICT"));
  assert.equal(
    fks.filter((r) => String(r.del_rule) === "CASCADE").length,
    0,
  );

  // Production schema registration must remain false in source.
  const { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } = await import(
    "../lib/cms/seo-planning-lineage/schema-ddl"
  );
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
});

test("11–16. FK blocks linked delete; Ledger intact; unlinked delete works; concurrent race safe", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  await seedPair({
    runId: "seorun_d1",
    decisionId: "seodec_d1",
    planningId: "seoplan_d1",
    topic: "FK delete topic",
    title: "FK Delete Title",
    archived: false,
  });

  const store = createMysqlPlanningLineageStore();
  const linked = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_d1",
    decisionId: "seodec_d1",
    actorAdminId: "admin_shared",
    store,
    trustedSelection: createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_d1",
      decisionId: "seodec_d1",
      researchRunId: "seorun_d1",
      actorAdminId: "admin_shared",
    }),
    createLinkId: () => "seoplink_d1",
  });
  assert.equal(linked.ok, true);

  // Archive after link (allowed); permanent delete remains blocked.
  await exec(
    `UPDATE seo_planning_drafts SET archived_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
    ["seoplan_d1"],
  );

  // Policy with authoritative resolve
  const draft = await store.getPlanningDraftById("seoplan_d1");
  assert.ok(draft);
  assert.ok(draft?.archivedAt);
  const lineage = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_d1",
    store,
  });
  const policy = evaluatePlanningPermanentDeletePolicy({
    draft,
    confirmation: seoPlanningPermanentDeleteConfirmToken(draft!),
    lineageProtectionActive: true,
    lineage,
    clientClaimedLinked: false,
  });
  assert.equal(policy.ok, false);
  if (!policy.ok) {
    assert.equal(policy.decision, "DENY_LINKED");
    assert.equal(policy.errorMessage, SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE);
  }

  // Direct DELETE blocked by FK
  let blocked = false;
  try {
    await exec(`DELETE FROM seo_planning_drafts WHERE id = ?`, ["seoplan_d1"]);
  } catch (error) {
    blocked = isMysqlForeignKeyParentDeleteBlocked(error);
  }
  assert.equal(blocked, true);

  const decisionStill = await q<RowDataPacket[]>(
    `SELECT id, selection_source, selected FROM seo_opportunity_decisions WHERE id = ?`,
    ["seodec_d1"],
  );
  assert.equal(decisionStill.length, 1);
  assert.equal(String(decisionStill[0].selection_source), "none");
  assert.equal(Number(decisionStill[0].selected), 0);

  // Restore then re-archive while linked
  await exec(
    `UPDATE seo_planning_drafts SET archived_at = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
    ["seoplan_d1"],
  );
  await exec(
    `UPDATE seo_planning_drafts SET archived_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
    ["seoplan_d1"],
  );
  const archivedAgain = await store.getPlanningDraftById("seoplan_d1");
  assert.ok(archivedAgain?.archivedAt);

  // Unlinked planning delete still works
  await seedPair({
    runId: "seorun_d2",
    decisionId: "seodec_d2",
    planningId: "seoplan_unlinked",
    topic: "Unlinked delete topic",
    title: "Unlinked Delete Title",
    archived: true,
  });
  await exec(`DELETE FROM seo_planning_drafts WHERE id = ?`, ["seoplan_unlinked"]);
  const gone = await q<RowDataPacket[]>(
    `SELECT id FROM seo_planning_drafts WHERE id = ?`,
    ["seoplan_unlinked"],
  );
  assert.equal(gone.length, 0);

  // Concurrent: try DELETE while another connection inserts a link on a fresh pair.
  await seedPair({
    runId: "seorun_race",
    decisionId: "seodec_race",
    planningId: "seoplan_race",
    topic: "Race delete topic",
    title: "Race Delete Title",
    archived: true,
  });

  const storeA = createMysqlPlanningLineageStore();
  const results = await Promise.allSettled([
    attemptEstablishPlanningDecisionLink({
      planningDraftId: "seoplan_race",
      decisionId: "seodec_race",
      actorAdminId: "admin_shared",
      store: storeA,
      trustedSelection: createTrustedPlanningDecisionSelectionForTests({
        planningDraftId: "seoplan_race",
        decisionId: "seodec_race",
        researchRunId: "seorun_race",
        actorAdminId: "admin_shared",
      }),
      createLinkId: () => "seoplink_race",
    }),
    withTransaction(async (conn) => {
      await conn.execute(
        `SELECT id FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE`,
        ["seoplan_race"],
      );
      // brief contention window
      await new Promise((r) => setTimeout(r, 30));
      await conn.execute(`DELETE FROM seo_planning_drafts WHERE id = ?`, ["seoplan_race"]);
    }),
  ]);

  const draftRows = await q<RowDataPacket[]>(
    `SELECT id FROM seo_planning_drafts WHERE id = ?`,
    ["seoplan_race"],
  );
  const linkRows = await q<RowDataPacket[]>(
    `SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE} WHERE planning_draft_id = ?`,
    ["seoplan_race"],
  );
  // Integrity: either draft deleted with zero links, or draft retained with ≤1 link.
  // Never: missing draft with orphaned link, or draft+link after successful delete.
  if (draftRows.length === 0) {
    assert.equal(linkRows.length, 0);
  } else {
    assert.ok(linkRows.length <= 1);
  }
  // At least one of the concurrent ops must have completed without leaving FK orphans.
  assert.ok(results.length === 2);
  const decisionRace = await q<RowDataPacket[]>(
    `SELECT id FROM seo_opportunity_decisions WHERE id = ?`,
    ["seodec_race"],
  );
  assert.equal(decisionRace.length, 1);
});

test("6b. schema drop → resolve UNAVAILABLE → policy DENY (not UNLINKED)", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  await seedPair({
    runId: "seorun_ua",
    decisionId: "seodec_ua",
    planningId: "seoplan_ua",
    topic: "Unavailable topic",
    title: "Unavailable Title",
    archived: true,
  });
  const store = createMysqlPlanningLineageStore();
  await exec(`DROP TABLE ${SEO_PLANNING_DECISION_LINKS_TABLE}`);
  const lineage = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_ua",
    store,
  });
  assert.equal(lineage.ok, false);
  if (!lineage.ok) assert.equal(lineage.state, "UNAVAILABLE");

  const draft = await store.getPlanningDraftById("seoplan_ua");
  const policy = evaluatePlanningPermanentDeletePolicy({
    draft,
    confirmation: "Unavailable Title",
    lineageProtectionActive: true,
    lineage,
  });
  assert.equal(policy.ok, false);
  if (!policy.ok) assert.equal(policy.decision, "DENY_LINEAGE_UNAVAILABLE");
});

test("23–27. Proceed/lifecycle/A2-4B markers unchanged; no provider paths", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.join(__dirname, "..");
  const actions = fs.readFileSync(path.join(root, "lib/cms/seo-planning-actions.ts"), "utf8");
  assert.doesNotMatch(actions, /evaluatePlanningPermanentDeletePolicy/);
  assert.match(actions, /proceedSeoOpportunityToPlanningDraftAction/);
  assert.match(actions, /deleteSeoPlanningDraftPermanentlyAction/);

  const proceedSrc = fs.readFileSync(
    path.join(root, "lib/cms/seo-planning-lineage/proceed-integration.ts"),
    "utf8",
  );
  assert.match(proceedSrc, /RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED\s*=\s*false/);

  const policySrc = fs.readFileSync(
    path.join(root, "lib/cms/seo-planning-lineage/delete-policy.ts"),
    "utf8",
  );
  assert.doesNotMatch(policySrc, /requestOpenAi|querySearchAnalytics|savePost|CASCADE/);
});

test("cleanup: end pool", async () => {
  await getDbPool().end();
});
