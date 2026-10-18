/**
 * L4B-6 — REAL MySQL transactional Proceed+link & protected delete acceptance.
 * Requires tools/run-l4b6-mysql-integration.cjs. Not auto-run by test:auth.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import type { ResearchProceedLedgerReader } from "../lib/cms/seo-planning-lineage";
import type { SeoPlanningCatalog } from "../lib/cms/seo-planning/proceed";
import {
  SEO_PLANNING_DECISION_LINKS_DDL,
  SEO_PLANNING_DECISION_LINKS_TABLE,
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
} from "../lib/cms/seo-planning-lineage/schema-ddl";
import {
  archiveSeoPlanningDraftOnConnectionForTests,
  executeTransactionalProtectedPermanentDelete,
  executeTransactionalTrustedProceedAndLink,
} from "../lib/cms/seo-planning-lineage/transactional-integration";
import {
  createL4B6TestHarnessActivationForTests,
  createTrustedPlanningDecisionSelectionForTests,
} from "./seo-planning-lineage-test-harness";
import { createMysqlPlanningLineageStore } from "../lib/cms/seo-planning-lineage/mysql-store";
import { CMS_SCHEMA_STATEMENTS } from "../lib/db/schema";
import { getDbPool, withTransaction } from "../lib/db/pool";
import { buildSeoPlanningFingerprint } from "../lib/cms/seo-planning/fingerprint";
import { slugify } from "../lib/cms/slug";

const require = createRequire(import.meta.url);
const root = path.join(__dirname, "..");
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

const HARNESS = createL4B6TestHarnessActivationForTests();

function assertDisposableTarget() {
  if (String(process.env.L4B6_MYSQL_INTEGRATION || "") !== "1") {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: L4B6_MYSQL_INTEGRATION opt-in missing");
  }
  const gate = validateDisposableMysqlTarget(process.env);
  if (!gate.ok) throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
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

function runRow(id: string, actor = "admin_shared"): SeoResearchRunRow {
  return {
    id,
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: actor,
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

function decisionRow(args: {
  id: string;
  runId: string;
  topic: string;
  title: string;
  index?: number;
}): SeoOpportunityDecisionRow {
  return {
    id: args.id,
    runId: args.runId,
    opportunityIndex: args.index ?? 0,
    opportunityIdentity: `oid_${args.id}`,
    createdAt: "2026-10-06T00:00:01.000Z",
    topic: args.topic,
    workingTitle: args.title,
    researchRecommendation: "NEW_BLOG",
    researchConfidence: "HIGH",
    existingCoverage: "NONE",
    matchedPublicUrl: "",
    restorePath: "",
    targetPostId: null,
    evaluationStatus: "OK",
    rfVerdict: "PASS_NEW_CONTENT",
    rfFingerprint: "rf_1",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_1",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_1",
    pipelineFingerprint: "pipe_1",
    selected: false,
    selectionSource: "none",
  };
}

async function seedLedger(args: {
  runId: string;
  decisionId: string;
  topic: string;
  title: string;
  actor?: string;
  index?: number;
}) {
  const actor = args.actor ?? "admin_shared";
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
      args.index ?? 0,
      `oid_${args.decisionId}`,
      args.topic,
      args.title,
    ],
  );
}

function readerFor(run: SeoResearchRunRow, decisions: SeoOpportunityDecisionRow[]): ResearchProceedLedgerReader {
  return {
    async getSeoResearchRunDetail({ runId }) {
      if (runId !== run.id) {
        return { ok: false, errorCode: "not_found", errorMessage: "Research run not found." };
      }
      return { ok: true, run, decisions, decisionOverflow: false };
    },
  };
}

function emptyCatalog(): SeoPlanningCatalog {
  return {
    listPosts: async () => [],
    listPages: async () => [],
    listCategories: async () => [],
    listActiveRedirects: async () => [],
    getSeoPlanningDraftByFingerprint: async () => null,
    saveSeoPlanningDraft: async () => {
      throw new Error("catalog save must not be used for L4B-6 atomic path");
    },
  };
}

const editorial = {
  searchIntent: "SETUP",
  whyNow: "Seasonal UK demand.",
  webEvidence: "Setup guides emphasize Wi-Fi steps.",
  suggestedAngle: "Checklist angle.",
  nextStep: "Draft checklist.",
};

test("0. isolation gate", async () => {
  await assertIsolationIdentity();
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
});

test("1–3. valid selection creates Planning + committed LINKED lineage", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Atomic proceed topic";
  const title = "Atomic Proceed Title";
  await seedLedger({
    runId: "seorun_a1",
    decisionId: "seodec_a1",
    topic,
    title,
  });
  const run = runRow("seorun_a1");
  const decision = decisionRow({ id: "seodec_a1", runId: "seorun_a1", topic, title });

  const result = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_a1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(run, [decision]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_a1",
    createLinkIdFn: () => "seoplink_a1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  assert.equal(result.linkageStatus, "LINKED");
  assert.equal(result.planningDraftId, "seoplan_a1");
  assert.equal(result.decisionId, "seodec_a1");
  assert.equal(result.linkId, "seoplink_a1");

  const drafts = await q<RowDataPacket[]>(`SELECT id FROM seo_planning_drafts WHERE id = ?`, [
    "seoplan_a1",
  ]);
  const links = await q<RowDataPacket[]>(
    `SELECT id, planning_draft_id, decision_id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`,
  );
  assert.equal(drafts.length, 1);
  assert.equal(links.length, 1);
  assert.equal(String(links[0].decision_id), "seodec_a1");
});

test("4. forced link failure rolls back Planning creation", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Rollback link topic";
  const title = "Rollback Link Title";
  await seedLedger({ runId: "seorun_r1", decisionId: "seodec_r1", topic, title });
  const run = runRow("seorun_r1");
  const decision = decisionRow({ id: "seodec_r1", runId: "seorun_r1", topic, title });

  const result = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_r1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(run, [decision]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_r1",
    failLinkInsert: true,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.linkageStatus, "ROLLED_BACK");
  assert.notEqual(result.linkageStatus, "LINKED");

  const drafts = await q<RowDataPacket[]>(`SELECT id FROM seo_planning_drafts`);
  const links = await q<RowDataPacket[]>(`SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`);
  assert.equal(drafts.length, 0);
  assert.equal(links.length, 0);
});

test("5. forced Planning-after-insert failure creates no link", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Rollback plan topic";
  const title = "Rollback Plan Title";
  await seedLedger({ runId: "seorun_r2", decisionId: "seodec_r2", topic, title });
  const run = runRow("seorun_r2");
  const decision = decisionRow({ id: "seodec_r2", runId: "seorun_r2", topic, title });

  const result = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_r2",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(run, [decision]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_r2",
    failAfterPlanningInsert: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.linkageStatus, "ROLLED_BACK");
  assert.equal((await q<RowDataPacket[]>(`SELECT id FROM seo_planning_drafts`)).length, 0);
  assert.equal(
    (await q<RowDataPacket[]>(`SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`)).length,
    0,
  );
});

test("6. same-pair retry is idempotent", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Idempotent topic";
  const title = "Idempotent Title";
  await seedLedger({ runId: "seorun_i1", decisionId: "seodec_i1", topic, title });
  const run = runRow("seorun_i1");
  const decision = decisionRow({ id: "seodec_i1", runId: "seorun_i1", topic, title });
  const args = {
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" as const },
    ledgerRunId: "seorun_i1",
    opportunityIndex: 0 as const,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(run, [decision]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_i1",
    createLinkIdFn: () => "seoplink_i1",
  };
  const first = await executeTransactionalTrustedProceedAndLink(args);
  assert.equal(first.ok, true);
  const second = await executeTransactionalTrustedProceedAndLink({
    ...args,
    createIdFn: () => "seoplan_i1_other",
    createLinkIdFn: () => "seoplink_i1_other",
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.created, false);
  assert.ok(
    second.linkageStatus === "IDEMPOTENT_LINKED" || second.linkageStatus === "EXISTING_DRAFT_UNLINKED",
  );
  // Fingerprint match opens existing; after first link it should be IDEMPOTENT_LINKED
  assert.equal(second.linkageStatus, "IDEMPOTENT_LINKED");
  assert.equal(second.planningDraftId, "seoplan_i1");
  assert.equal(
    (await q<RowDataPacket[]>(`SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`)).length,
    1,
  );
});

test("7. different-decision conflict rejected", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Conflict topic";
  const title = "Conflict Title";
  await seedLedger({ runId: "seorun_c1", decisionId: "seodec_c1", topic, title });
  await seedLedger({
    runId: "seorun_c2",
    decisionId: "seodec_c2",
    topic,
    title,
  });
  const d1 = decisionRow({ id: "seodec_c1", runId: "seorun_c1", topic, title });
  const d2 = decisionRow({ id: "seodec_c2", runId: "seorun_c2", topic, title });
  const first = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_c1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_c1"), [d1]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_c1",
    createLinkIdFn: () => "seoplink_c1",
  });
  assert.equal(first.ok, true);

  const conflict = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_c2",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_c2"), [d2]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_c2",
    createLinkIdFn: () => "seoplink_c2",
  });
  // Same fingerprint → existing draft linked to c1 → DRAFT_CONFLICT
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.linkageStatus, "DRAFT_CONFLICT");
  assert.equal(
    (await q<RowDataPacket[]>(`SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`)).length,
    1,
  );
});

test("8. existing unlinked draft does not silently relink", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Unlinked open topic";
  const title = "Unlinked Open Title";
  const proposedSlug = slugify(title);
  const fingerprint = buildSeoPlanningFingerprint({
    recommendation: "NEW_BLOG",
    proposedSlug,
  });
  await seedLedger({ runId: "seorun_u1", decisionId: "seodec_u1", topic, title });
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, payload, created_by, created_at, updated_at
    ) VALUES (
      'seoplan_ul', 'NEW_BLOG', 'PLANNING', ?, ?, ?,
      ?, '{}', 'admin_shared', UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
    [fingerprint, topic, title, proposedSlug],
  );

  const opened = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_u1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_u1"), [
      decisionRow({ id: "seodec_u1", runId: "seorun_u1", topic, title }),
    ]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_ul_new",
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(opened.created, false);
  assert.equal(opened.linkageStatus, "EXISTING_DRAFT_UNLINKED");
  assert.equal(opened.linkId, null);
  assert.equal(
    (await q<RowDataPacket[]>(`SELECT id FROM ${SEO_PLANNING_DECISION_LINKS_TABLE}`)).length,
    0,
  );
});

test("10–12. archived blocked; forged/cross-account blocked; no false LINKED", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Auth topic";
  const title = "Auth Title";
  await seedLedger({ runId: "seorun_x1", decisionId: "seodec_x1", topic, title });

  const cross = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_other" },
    ledgerRunId: "seorun_x1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_x1"), [
      decisionRow({ id: "seodec_x1", runId: "seorun_x1", topic, title }),
    ]),
    catalog: emptyCatalog(),
  });
  assert.equal(cross.ok, false);

  const forged = await executeTransactionalTrustedProceedAndLink({
    activation: { mode: "test-harness", allowDurableLineageWrites: true, allowProtectedDelete: true } as never,
    actor: { authorized: false, adminId: "admin_shared" },
    ledgerRunId: "seorun_x1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_x1"), [
      decisionRow({ id: "seodec_x1", runId: "seorun_x1", topic, title }),
    ]),
    catalog: emptyCatalog(),
  });
  assert.equal(forged.ok, false);
  if (!forged.ok) assert.notEqual(forged.linkageStatus, "LINKED");

  // Archived existing draft
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, payload, created_by, archived_at, created_at, updated_at
    ) VALUES (
      'seoplan_arch', 'NEW_BLOG', 'PLANNING', 'NEW_BLOG:auth-title', ?, ?,
      'auth-title', '{}', 'admin_shared', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
    [topic, title],
  );
  const archived = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_x1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_x1"), [
      decisionRow({ id: "seodec_x1", runId: "seorun_x1", topic, title }),
    ]),
    catalog: emptyCatalog(),
  });
  assert.equal(archived.ok, false);
  if (!archived.ok) assert.equal(archived.linkageStatus, "PROCEED_FAILED");
});

test("13–18. protected delete policy + schema fail-closed", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Delete topic";
  const title = "Delete Title Token";
  await seedLedger({ runId: "seorun_d1", decisionId: "seodec_d1", topic, title });
  const created = await executeTransactionalTrustedProceedAndLink({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_d1",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: readerFor(runRow("seorun_d1"), [
      decisionRow({ id: "seodec_d1", runId: "seorun_d1", topic, title }),
    ]),
    catalog: emptyCatalog(),
    createIdFn: () => "seoplan_d1",
    createLinkIdFn: () => "seoplink_d1",
  });
  assert.equal(created.ok, true);

  // Active linked delete rejected
  const activeDeny = await executeTransactionalProtectedPermanentDelete({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    planningDraftId: "seoplan_d1",
    confirmation: title,
  });
  assert.equal(activeDeny.ok, false);

  await withTransaction(async (conn) => {
    await archiveSeoPlanningDraftOnConnectionForTests(conn, "seoplan_d1");
  });

  // Linked archived delete rejected
  const linkedDeny = await executeTransactionalProtectedPermanentDelete({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    planningDraftId: "seoplan_d1",
    confirmation: title,
  });
  assert.equal(linkedDeny.ok, false);
  if (!linkedDeny.ok) assert.equal(linkedDeny.errorCode, "DENY_LINKED");

  // Archive/restore still allowed (restore then archive)
  await exec(
    `UPDATE seo_planning_drafts SET archived_at = NULL WHERE id = ?`,
    ["seoplan_d1"],
  );
  await withTransaction(async (conn) => {
    await archiveSeoPlanningDraftOnConnectionForTests(conn, "seoplan_d1");
  });
  assert.ok(
    (await createMysqlPlanningLineageStore().getPlanningDraftById("seoplan_d1"))?.archivedAt,
  );

  // Unlinked archived confirmed delete OK
  await seedLedger({
    runId: "seorun_d2",
    decisionId: "seodec_d2",
    topic: "Unlinked delete topic",
    title: "Unlinked Delete Title",
  });
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, payload, created_by, archived_at, created_at, updated_at
    ) VALUES (
      'seoplan_ok', 'NEW_BLOG', 'PLANNING', 'NEW_BLOG:unlinked-delete-title',
      'Unlinked delete topic', 'Unlinked Delete Title',
      'unlinked-delete-title', '{}', 'admin_shared', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
  );
  const deleted = await executeTransactionalProtectedPermanentDelete({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    planningDraftId: "seoplan_ok",
    confirmation: "Unlinked Delete Title",
  });
  assert.equal(deleted.ok, true);
  assert.equal(
    (await q<RowDataPacket[]>(`SELECT id FROM seo_planning_drafts WHERE id = ?`, ["seoplan_ok"]))
      .length,
    0,
  );

  // Bad confirmation
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, payload, created_by, archived_at, created_at, updated_at
    ) VALUES (
      'seoplan_bad', 'NEW_BLOG', 'PLANNING', 'NEW_BLOG:bad-confirm',
      'Bad', 'Bad Confirm Title',
      'bad-confirm', '{}', 'admin_shared', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
  );
  const badConfirm = await executeTransactionalProtectedPermanentDelete({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    planningDraftId: "seoplan_bad",
    confirmation: "wrong",
  });
  assert.equal(badConfirm.ok, false);

  // Missing schema fail closed
  await exec(`DROP TABLE ${SEO_PLANNING_DECISION_LINKS_TABLE}`);
  const missing = await executeTransactionalProtectedPermanentDelete({
    activation: HARNESS,
    actor: { authorized: true, adminId: "admin_shared" },
    planningDraftId: "seoplan_d1",
    confirmation: title,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.errorCode, "DENY_LINEAGE_UNAVAILABLE");
  await exec(SEO_PLANNING_DECISION_LINKS_DDL);
});

test("19–21. concurrent link/delete integrity; Ledger history intact", async () => {
  await wipeAllTables();
  await applyParentsAndLinks();
  const topic = "Race topic";
  const title = "Race Title";
  await seedLedger({ runId: "seorun_race", decisionId: "seodec_race", topic, title });
  await exec(
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, payload, created_by, archived_at, created_at, updated_at
    ) VALUES (
      'seoplan_race', 'NEW_BLOG', 'PLANNING', 'NEW_BLOG:race-title', ?, ?,
      'race-title', '{}', 'admin_shared', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )`,
    [topic, title],
  );

  const store = createMysqlPlanningLineageStore();
  const { attemptEstablishPlanningDecisionLink } = await import("../lib/cms/seo-planning-lineage");

  const results = await Promise.allSettled([
    attemptEstablishPlanningDecisionLink({
      planningDraftId: "seoplan_race",
      decisionId: "seodec_race",
      actorAdminId: "admin_shared",
      store,
      trustedSelection: createTrustedPlanningDecisionSelectionForTests({
        planningDraftId: "seoplan_race",
        decisionId: "seodec_race",
        researchRunId: "seorun_race",
        actorAdminId: "admin_shared",
      }),
      createLinkId: () => "seoplink_race",
    }),
    executeTransactionalProtectedPermanentDelete({
      activation: HARNESS,
      actor: { authorized: true, adminId: "admin_shared" },
      planningDraftId: "seoplan_race",
      confirmation: title,
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
  if (draftRows.length === 0) {
    assert.equal(linkRows.length, 0);
  } else {
    assert.ok(linkRows.length <= 1);
    if (linkRows.length === 1) {
      // Linked draft must not have been deleted
      assert.equal(draftRows.length, 1);
    }
  }
  const decisions = await q<RowDataPacket[]>(
    `SELECT id, selected, selection_source FROM seo_opportunity_decisions WHERE id = ?`,
    ["seodec_race"],
  );
  assert.equal(decisions.length, 1);
  assert.equal(String(decisions[0].selection_source), "none");
  assert.ok(results.length === 2);
});

test("22–26. activation boundary, no live imports, A2-4B HOLD", async () => {
  const actions = readFileSync(path.join(root, "lib/cms/seo-planning-actions.ts"), "utf8");
  assert.doesNotMatch(actions, /executeTransactionalTrustedProceedAndLink/);
  assert.doesNotMatch(actions, /executeTransactionalProtectedPermanentDelete/);
  assert.doesNotMatch(actions, /transactional-integration/);

  const index = readFileSync(path.join(root, "lib/cms/seo-planning-lineage/index.ts"), "utf8");
  assert.doesNotMatch(index, /transactional-integration/);
  assert.doesNotMatch(index, /createMysqlPlanningLineageStore/);

  const badActivation = await executeTransactionalTrustedProceedAndLink({
    activation: { mode: "production" } as never,
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "x",
    opportunityIndex: 0,
    editorialSupplemental: editorial,
    ledgerReader: {
      async getSeoResearchRunDetail() {
        return { ok: false, errorCode: "not_found", errorMessage: "missing" };
      },
    },
    catalog: emptyCatalog(),
  });
  assert.equal(badActivation.ok, false);
  if (!badActivation.ok) assert.equal(badActivation.errorCode, "ACTIVATION_DENIED");

  const proceedSrc = readFileSync(
    path.join(root, "lib/cms/seo-planning-lineage/proceed-integration.ts"),
    "utf8",
  );
  assert.match(proceedSrc, /RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED\s*=\s*false/);

  const txSrc = readFileSync(
    path.join(root, "lib/cms/seo-planning-lineage/transactional-integration.ts"),
    "utf8",
  );
  assert.doesNotMatch(txSrc, /requestOpenAi|querySearchAnalytics|ensureCmsSchemaCurrent/);
  assert.match(txSrc, /import ["']server-only["']/);
});

test("cleanup: end pool", async () => {
  await getDbPool().end();
});
