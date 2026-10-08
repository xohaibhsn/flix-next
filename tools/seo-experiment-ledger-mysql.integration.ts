/**
 * Experiment Ledger L1 — REAL MySQL integration acceptance (A–J).
 * Requires disposable loopback DB via tools/run-ledger-mysql-integration.cjs.
 * Never points at production. Provider-free.
 * Filename intentionally avoids `*.test.ts` so `npm run test:auth` never auto-runs mutations.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type { SeoResearchOpportunity, SeoResearchResult } from "../lib/cms/ai-seo/research-schemas";
import type { SeoResearchDecisionPipelineEvaluation } from "../lib/cms/seo-decision-pipeline/research-bridge-types";
import { CMS_SCHEMA_VERSION_KEY } from "../lib/cms/migration-flags";
import { ensureCmsSchemaCurrent } from "../lib/cms/mysql-migrate";
import { insertResearchRunWithDecisions } from "../lib/cms/seo-experiment-ledger/persist-mysql";
import { mapResearchSnapshotToLedgerPlan } from "../lib/cms/seo-experiment-ledger/map";
import { CMS_SCHEMA_STATEMENTS, CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
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

/** Fail-closed: refuse mutations unless launcher opt-in + exact disposable identity. */
function assertDisposableTarget() {
  const gate = validateDisposableMysqlTarget(process.env);
  if (!gate.ok) {
    throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
  }
}

type SqlParam = string | number | boolean | null | Date | Buffer;

async function q<T extends RowDataPacket[]>(sql: string, params: SqlParam[] = []) {
  const [rows] = await getDbPool().query<T>(sql, params);
  return rows;
}

async function exec(sql: string, params: SqlParam[] = []) {
  await getDbPool().execute(sql, params);
}

/** mysql2 returns DATETIME as Date when pool timezone is Z. */
function asUtcMysqlDateTime(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  return String(value);
}

/**
 * CREATE TRIGGER is unsupported on the prepared-statement protocol.
 * Install/drop via official mysql client as local root against the disposable instance only.
 */
function runDisposableRootSql(sql: string) {
  assertDisposableTarget();
  if (process.env.DB_NAME !== APPROVED_DB_NAME) {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: refusing root SQL outside approved DB");
  }
  const base = path.join(process.env.USERPROFILE || "", ".flix-mysql-disposable");
  const mysqlBin = path.join(base, "mysql-8.0.46-winx64", "bin", "mysql.exe");
  const ini = path.join(base, "my.ini");
  const sqlFile = path.join(base, "tmp-trigger.sql");
  // USE only the exact approved disposable schema — never ambient/production names.
  fs.writeFileSync(sqlFile, `USE \`${APPROVED_DB_NAME}\`;\n${sql}\n`, "utf8");
  const result = spawnSync(
    mysqlBin,
    [`--defaults-file=${ini}`, "-uroot"],
    { input: fs.readFileSync(sqlFile), encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`disposable root SQL failed: ${result.stderr || result.stdout}`);
  }
}

async function wipeAllTables() {
  assertDisposableTarget();
  const db = await q<RowDataPacket[]>(`SELECT DATABASE() AS db, @@port AS port, @@bind_address AS bind_addr`);
  assert.equal(String(db[0].db), APPROVED_DB_NAME);
  assert.equal(String(db[0].port), APPROVED_PORT);
  assert.equal(String(db[0].bind_addr), "127.0.0.1");
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

async function applyV4SchemaFixture() {
  // Project v4 = current statements minus Ledger tables (v5 additions).
  for (const statement of CMS_SCHEMA_STATEMENTS) {
    if (/seo_research_runs|seo_opportunity_decisions/i.test(statement)) continue;
    await exec(statement);
  }
  await exec(
    `INSERT INTO site_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [CMS_SCHEMA_VERSION_KEY, "4"],
  );
  await exec(
    `INSERT INTO blog_posts
      (id, title, slug, excerpt, content, status, published_at, seo_title, seo_description)
     VALUES (?, ?, ?, ?, ?, 'published', UTC_TIMESTAMP(), ?, ?)`,
    [
      "post-fixture-v4",
      "Fixture Blog Survives Upgrade",
      "fixture-blog-survives-upgrade",
      "excerpt",
      "body",
      "Fixture Blog Survives Upgrade",
      "meta",
    ],
  );
  await exec(
    `INSERT INTO media_assets (id, public_id, secure_url, filename)
     VALUES (?, ?, ?, ?)`,
    ["media-fixture-v4", "fixture/public", "https://example.com/f.jpg", "f.jpg"],
  );
  await exec(
    `INSERT INTO seo_planning_drafts
      (id, recommendation, workflow_status, fingerprint, topic, working_title, proposed_slug, payload)
     VALUES (?, 'NEW_BLOG', 'PLANNING', ?, ?, ?, ?, ?)`,
    [
      "seoplan_fixture_v4",
      "fp_fixture_v4_unique_value_for_upgrade_test",
      "Fixture planning topic",
      "Fixture planning title",
      "fixture-planning-title",
      JSON.stringify({ kind: "fixture" }),
    ],
  );
}

function opportunity(
  overrides: Partial<SeoResearchOpportunity> &
    Pick<SeoResearchOpportunity, "topic" | "workingTitle" | "recommendation">,
): SeoResearchOpportunity {
  return {
    topic: overrides.topic,
    workingTitle: overrides.workingTitle,
    searchIntent: overrides.searchIntent || "INFORMATIONAL",
    whyNow: overrides.whyNow ?? "Why now evidence for UK Firestick viewers this quarter.",
    webEvidence: overrides.webEvidence ?? "Web evidence from Ofcom and Amazon help pages.",
    existingCoverage: overrides.existingCoverage ?? "NONE",
    matchedTitle: overrides.matchedTitle ?? null,
    matchedPublicUrl: overrides.matchedPublicUrl ?? null,
    recommendation: overrides.recommendation,
    restorePath: overrides.restorePath ?? "",
    suggestedAngle: overrides.suggestedAngle || "Practical UK angle.",
    nextStep: overrides.nextStep || "Review in Planning.",
    confidence: overrides.confidence || "HIGH",
    gscEvidenceRefs: overrides.gscEvidenceRefs || [],
    gscEvidence: overrides.gscEvidence || [],
    historicalSignal: overrides.historicalSignal ?? false,
  };
}

function researchOk(opportunities: SeoResearchOpportunity[]): SeoResearchResult {
  return {
    opportunities,
    sources: [{ title: "Example", url: "https://example.com/", domain: "example.com" }],
    gsc: { status: "NOT_CONFIGURED", statusLabel: "GSC", helperText: "n/a" },
  };
}

function evaluation(
  index: number,
  opts: {
    identity: string;
    topic: string;
    title: string;
    recommendation?: "NEW_BLOG" | "REFRESH_EXISTING" | "SKIP";
    nbaAction?: "NEW_BLOG" | "REFRESH_EXISTING" | "HOLD";
    autonomous?: boolean;
    score?: number;
    selectable?: boolean;
    status?: string;
    includePriority?: boolean;
    includeNba?: boolean;
    includeRf?: boolean;
  },
): SeoResearchDecisionPipelineEvaluation {
  const recommendation = opts.recommendation ?? "NEW_BLOG";
  const nbaAction = opts.nbaAction ?? "NEW_BLOG";
  const autonomous = opts.autonomous ?? true;
  const score = opts.score ?? 70;
  const selectable =
    opts.selectable ?? (nbaAction === "NEW_BLOG" && autonomous === true);
  const includePriority = opts.includePriority !== false;
  const includeNba = opts.includeNba !== false;
  const includeRf = opts.includeRf !== false;
  const rfFp = `rf${index}`.padEnd(64, "a");
  const nbaFp = `nb${index}`.padEnd(64, "b");
  const priFp = `pr${index}`.padEnd(64, "c");
  const pipeFp = `pp${index}`.padEnd(64, "d");

  return {
    opportunityIndex: index,
    opportunityIdentity: opts.identity,
    evaluationStatus: (opts.status as "OK") || "OK",
    pipelineFingerprint: pipeFp,
    opportunity: {
      topic: opts.topic,
      workingTitle: opts.title,
      recommendation,
    },
    refreshFirst: includeRf
      ? {
          verdict: nbaAction === "REFRESH_EXISTING" ? "REFRESH_EXISTING" : "PASS_NEW_CONTENT",
          confidence: "HIGH",
          reason: "fixture",
          evidence: {
            existingCoverage: nbaAction === "REFRESH_EXISTING" ? "STRONG" : "NONE",
            exactUrlMatch: false,
            exactSlugMatch: false,
            exactPostMatch: nbaAction === "REFRESH_EXISTING",
            canonicalMatch: false,
            duplicate: false,
            cannibalizationRisk: false,
            gscOwnership: false,
            draftReservation: false,
            planningReservation: false,
            historicalPath: null,
            materialEvidence: true,
            corpusComplete: true,
            candidateCount: 0,
          },
          fingerprint: rfFp,
          target:
            nbaAction === "REFRESH_EXISTING"
              ? {
                  postId: "post-fixture-v4",
                  slug: "fixture-blog-survives-upgrade",
                  publicPath: "/blogs/fixture-blog-survives-upgrade/",
                }
              : null,
        }
      : null,
    nextBestAction: includeNba
      ? {
          decisionFingerprint: nbaFp,
          action: nbaAction,
          status: nbaAction === "HOLD" ? "HOLD" : "ACTIONABLE",
          holdReason: nbaAction === "HOLD" ? "fixture_hold" : null,
          confidence: "HIGH",
          autonomousEligible: autonomous,
          target:
            nbaAction === "REFRESH_EXISTING"
              ? { kind: "existing_post", postId: "post-fixture-v4" }
              : { kind: "new_topic", topic: opts.topic },
          topic: opts.topic,
          reason: "fixture",
          evidence: {
            refreshFirstVerdict:
              nbaAction === "REFRESH_EXISTING" ? "REFRESH_EXISTING" : "PASS_NEW_CONTENT",
            existingCoverage: nbaAction === "REFRESH_EXISTING" ? "STRONG" : "NONE",
            matchedPostId: nbaAction === "REFRESH_EXISTING" ? "post-fixture-v4" : null,
            matchedUrl: null,
            historicalPath: null,
            duplicate: false,
            cannibalizationRisk: false,
            gscPresent: false,
            webEvidencePresent: true,
            corpusEvidencePresent: true,
          },
          blockers: [],
          warnings: [],
          alternatives: [],
          actionFingerprint: `af${index}`.padEnd(64, "e"),
          historicalDisposition: null,
        }
      : null,
    priority: includePriority
      ? {
          score,
          tier: score >= 70 ? "HIGH" : "MEDIUM",
          scoreVersion: "v1",
          components: [],
          reason: "fixture",
          warnings: [],
          effort: "MEDIUM",
          evidenceCompleteness: "PARTIAL",
          missingInputs: [],
          automationSelectable: selectable,
          priorityFingerprint: priFp,
          action: nbaAction,
          decisionFingerprint: nbaFp,
          refreshFingerprint: rfFp,
        }
      : null,
    resolvedTarget:
      nbaAction === "REFRESH_EXISTING"
        ? {
            postId: "post-fixture-v4",
            slug: "fixture-blog-survives-upgrade",
            publicPath: "/blogs/fixture-blog-survives-upgrade/",
          }
        : null,
  } as SeoResearchDecisionPipelineEvaluation;
}

async function tableExists(name: string) {
  const rows = await q<RowDataPacket[]>(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [name],
  );
  return rows.length === 1;
}

async function schemaVersion() {
  const rows = await q<RowDataPacket[]>(
    `SELECT setting_value AS v FROM site_settings WHERE setting_key = ? LIMIT 1`,
    [CMS_SCHEMA_VERSION_KEY],
  );
  return rows[0] ? String(rows[0].v) : null;
}

async function columnNames(table: string) {
  const rows = await q<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return rows.map((r) => String(r.name));
}

async function indexNames(table: string) {
  const rows = await q<RowDataPacket[]>(
    `SELECT DISTINCT INDEX_NAME AS name FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows.map((r) => String(r.name));
}

async function fkInfo() {
  const rows = await q<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME AS name, DELETE_RULE AS del, REFERENCED_TABLE_NAME AS ref
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'seo_opportunity_decisions'`,
  );
  return rows;
}

test("preflight: disposable MySQL identity and isolation", async () => {
  assertDisposableTarget();
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 5);
  const meta = await q<RowDataPacket[]>(
    `SELECT DATABASE() AS db, @@port AS port, @@bind_address AS bind_addr, VERSION() AS version`,
  );
  const row = meta[0];
  assert.equal(String(row.db), APPROVED_DB_NAME);
  assert.equal(String(row.db), process.env.DB_NAME);
  assert.equal(Number(row.port), Number(APPROVED_PORT));
  assert.equal(String(row.bind_addr), "127.0.0.1");
  assert.match(String(row.version), /^8\.0\./);
  const schemas = await q<RowDataPacket[]>(`SHOW DATABASES`);
  const names = schemas.map((r) => String(Object.values(r)[0]));
  assert.ok(names.includes(APPROVED_DB_NAME));
  assert.ok(!names.some((n) => /theflix|hostinger|production/i.test(n)));
  console.log(
    JSON.stringify({
      mysqlVersion: String(row.version),
      database: String(row.db),
      port: Number(row.port),
      bind: String(row.bind_addr),
    }),
  );
});

test("A — Fresh schema v5 via ensureCmsSchemaCurrent", async () => {
  assertDisposableTarget();
  await wipeAllTables();
  const outcome = await ensureCmsSchemaCurrent();
  assert.equal(outcome, "ensured");
  assert.equal(await schemaVersion(), "5");
  assert.equal(await tableExists("seo_research_runs"), true);
  assert.equal(await tableExists("seo_opportunity_decisions"), true);
  assert.equal(await tableExists("blog_posts"), true);
  assert.equal(await tableExists("seo_planning_drafts"), true);

  const runCols = await columnNames("seo_research_runs");
  for (const col of [
    "id",
    "created_at",
    "completed_at",
    "source",
    "actor_admin_id",
    "research_ok",
    "research_error_code",
    "pipeline_run_status",
    "pipeline_version",
    "pipeline_error_code",
    "opportunity_count",
    "gsc_status",
    "durability_status",
  ]) {
    assert.ok(runCols.includes(col), `missing run col ${col}`);
  }

  const decCols = await columnNames("seo_opportunity_decisions");
  for (const col of [
    "id",
    "run_id",
    "opportunity_index",
    "opportunity_identity",
    "evaluation_status",
    "rf_verdict",
    "nba_action",
    "priority_score",
    "priority_automation_selectable",
    "pipeline_fingerprint",
    "selected",
    "selection_source",
  ]) {
    assert.ok(decCols.includes(col), `missing decision col ${col}`);
  }

  const runIdx = await indexNames("seo_research_runs");
  assert.ok(runIdx.includes("PRIMARY"));
  assert.ok(runIdx.includes("seo_research_runs_created"));
  assert.ok(runIdx.includes("seo_research_runs_source_created"));

  const decIdx = await indexNames("seo_opportunity_decisions");
  assert.ok(decIdx.includes("PRIMARY"));
  assert.ok(decIdx.includes("seo_opportunity_decisions_run_index"));
  assert.ok(decIdx.includes("seo_opportunity_decisions_identity"));

  const engine = await q<RowDataPacket[]>(
    `SELECT ENGINE AS eng FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seo_opportunity_decisions'`,
  );
  assert.equal(String(engine[0].eng).toUpperCase(), "INNODB");

  const fks = await fkInfo();
  assert.equal(fks.length, 1);
  assert.equal(String(fks[0].ref), "seo_research_runs");
  assert.equal(String(fks[0].del).toUpperCase(), "RESTRICT");
});

test("B — Existing v4 → v5 upgrade preserves fixture data", async () => {
  assertDisposableTarget();
  await wipeAllTables();
  await applyV4SchemaFixture();
  assert.equal(await schemaVersion(), "4");
  assert.equal(await tableExists("seo_research_runs"), false);
  assert.equal(await tableExists("seo_opportunity_decisions"), false);

  const beforeBlog = await q<RowDataPacket[]>(
    `SELECT id, slug, title FROM blog_posts WHERE id = ?`,
    ["post-fixture-v4"],
  );
  const beforeMedia = await q<RowDataPacket[]>(
    `SELECT id FROM media_assets WHERE id = ?`,
    ["media-fixture-v4"],
  );
  const beforePlan = await q<RowDataPacket[]>(
    `SELECT id, fingerprint FROM seo_planning_drafts WHERE id = ?`,
    ["seoplan_fixture_v4"],
  );
  assert.equal(beforeBlog.length, 1);
  assert.equal(beforeMedia.length, 1);
  assert.equal(beforePlan.length, 1);

  const outcome = await ensureCmsSchemaCurrent();
  assert.equal(outcome, "ensured");
  assert.equal(await schemaVersion(), "5");
  assert.equal(await tableExists("seo_research_runs"), true);
  assert.equal(await tableExists("seo_opportunity_decisions"), true);

  const afterBlog = await q<RowDataPacket[]>(
    `SELECT id, slug, title FROM blog_posts WHERE id = ?`,
    ["post-fixture-v4"],
  );
  const afterMedia = await q<RowDataPacket[]>(
    `SELECT id FROM media_assets WHERE id = ?`,
    ["media-fixture-v4"],
  );
  const afterPlan = await q<RowDataPacket[]>(
    `SELECT id, fingerprint FROM seo_planning_drafts WHERE id = ?`,
    ["seoplan_fixture_v4"],
  );
  assert.deepEqual(afterBlog, beforeBlog);
  assert.deepEqual(afterMedia, beforeMedia);
  assert.deepEqual(afterPlan, beforePlan);

  const fks = await fkInfo();
  assert.equal(String(fks[0]?.del).toUpperCase(), "RESTRICT");
});

test("C — Migration idempotency (second ensure)", async () => {
  assertDisposableTarget();
  assert.equal(await schemaVersion(), "5");
  const runsBefore = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_research_runs`);
  const blogBefore = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM blog_posts WHERE id = ?`,
    ["post-fixture-v4"],
  );
  const outcome = await ensureCmsSchemaCurrent();
  assert.equal(outcome, "skipped");
  assert.equal(await schemaVersion(), "5");
  const runsAfter = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_research_runs`);
  const blogAfter = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM blog_posts WHERE id = ?`,
    ["post-fixture-v4"],
  );
  assert.equal(Number(runsAfter[0].n), Number(runsBefore[0].n));
  assert.equal(Number(blogAfter[0].n), Number(blogBefore[0].n));
  assert.equal(await tableExists("seo_research_runs"), true);
  assert.equal(await tableExists("seo_opportunity_decisions"), true);
});

test("D — Successful persistence transaction", async () => {
  assertDisposableTarget();
  await exec(`DELETE FROM seo_opportunity_decisions`);
  await exec(`DELETE FROM seo_research_runs`);

  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const identity = "id_success_run".padEnd(64, "1");
  const result = await insertResearchRunWithDecisions({
    runId: "seorun_success_1",
    createdAt: "2026-10-08T12:00:00.000Z",
    completedAt: "2026-10-08T12:00:05.000Z",
    source: "manual",
    actorAdminId: "admin_fixture",
    research: {
      ok: true,
      research: researchOk([opp]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity,
            topic: opp.topic,
            title: opp.workingTitle,
            nbaAction: "NEW_BLOG",
            autonomous: true,
            score: 72,
          }),
        ],
      },
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "PERSISTED");
  assert.equal(result.runId, "seorun_success_1");
  assert.equal(result.decisionCount, 1);

  const runs = await q<RowDataPacket[]>(`SELECT * FROM seo_research_runs WHERE id = ?`, [
    "seorun_success_1",
  ]);
  assert.equal(runs.length, 1);
  assert.equal(Number(runs[0].research_ok), 1);
  assert.equal(String(runs[0].pipeline_run_status), "OK");
  assert.equal(Number(runs[0].opportunity_count), 1);
  assert.equal(String(runs[0].durability_status), "COMPLETE");
  assert.equal(asUtcMysqlDateTime(runs[0].created_at), "2026-10-08 12:00:00");
  assert.equal(asUtcMysqlDateTime(runs[0].completed_at), "2026-10-08 12:00:05");

  const decs = await q<RowDataPacket[]>(
    `SELECT * FROM seo_opportunity_decisions WHERE run_id = ? ORDER BY opportunity_index`,
    ["seorun_success_1"],
  );
  assert.equal(decs.length, 1);
  assert.equal(String(decs[0].opportunity_identity), identity);
  assert.equal(String(decs[0].nba_action), "NEW_BLOG");
  assert.equal(Number(decs[0].nba_autonomous_eligible), 1);
  assert.equal(Number(decs[0].priority_score), 72);
  assert.equal(Number(decs[0].priority_automation_selectable), 1);
  assert.equal(Number(decs[0].selected), 0);
  assert.equal(String(decs[0].selection_source), "none");
  assert.equal(String(decs[0].pipeline_fingerprint), "pp0".padEnd(64, "d"));
  assert.equal(String(decs[0].rf_fingerprint), "rf0".padEnd(64, "a"));
  assert.equal(String(decs[0].nba_fingerprint), "nb0".padEnd(64, "b"));
  assert.equal(String(decs[0].priority_fingerprint), "pr0".padEnd(64, "c"));
});

test("E — Zero decisions: Research failure + CONTEXT_ERROR", async () => {
  assertDisposableTarget();
  const fail = await insertResearchRunWithDecisions({
    runId: "seorun_fail_1",
    research: { ok: false, error: "empty", code: "research_empty" },
  });
  assert.equal(fail.ok, true);
  if (!fail.ok) return;
  assert.equal(fail.decisionCount, 0);
  const failRun = await q<RowDataPacket[]>(`SELECT * FROM seo_research_runs WHERE id = ?`, [
    "seorun_fail_1",
  ]);
  assert.equal(Number(failRun[0].research_ok), 0);
  assert.equal(String(failRun[0].pipeline_run_status), "SKIPPED");
  assert.equal(String(failRun[0].research_error_code), "research_empty");
  const failDec = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM seo_opportunity_decisions WHERE run_id = ?`,
    ["seorun_fail_1"],
  );
  assert.equal(Number(failDec[0].n), 0);

  const ctx = await insertResearchRunWithDecisions({
    runId: "seorun_ctx_1",
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Context error topic firestick",
          workingTitle: "Context error title firestick",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "CONTEXT_ERROR",
        errorCode: "context_unavailable",
        evaluations: [],
      },
    },
  });
  assert.equal(ctx.ok, true);
  if (!ctx.ok) return;
  assert.equal(ctx.decisionCount, 0);
  const ctxRun = await q<RowDataPacket[]>(`SELECT * FROM seo_research_runs WHERE id = ?`, [
    "seorun_ctx_1",
  ]);
  assert.equal(Number(ctxRun[0].research_ok), 1);
  assert.equal(String(ctxRun[0].pipeline_run_status), "CONTEXT_ERROR");
  assert.equal(Number(ctxRun[0].opportunity_count), 1);
  assert.equal(String(ctxRun[0].pipeline_error_code), "context_unavailable");
  const ctxDec = await q<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM seo_opportunity_decisions WHERE run_id = ?`,
    ["seorun_ctx_1"],
  );
  assert.equal(Number(ctxDec[0].n), 0);
});

test("F — Atomic rollback on decision insert failure", async () => {
  assertDisposableTarget();
  runDisposableRootSql(`DROP TRIGGER IF EXISTS trg_ledger_force_decision_fail;`);
  runDisposableRootSql(`
DELIMITER //
CREATE TRIGGER trg_ledger_force_decision_fail
BEFORE INSERT ON seo_opportunity_decisions
FOR EACH ROW
BEGIN
  IF NEW.run_id = 'seorun_rollback_probe' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced decision failure for rollback probe';
  END IF;
END//
DELIMITER ;
  `);

  const beforeRuns = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_research_runs`);
  const beforeDec = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_opportunity_decisions`);

  const opp = opportunity({
    topic: "Rollback probe topic firestick",
    workingTitle: "Rollback probe title firestick",
    recommendation: "NEW_BLOG",
  });
  const result = await insertResearchRunWithDecisions({
    runId: "seorun_rollback_probe",
    research: {
      ok: true,
      research: researchOk([opp]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: "id_rollback".padEnd(64, "9"),
            topic: opp.topic,
            title: opp.workingTitle,
          }),
        ],
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "WRITE_ERROR");
  assert.equal(result.errorCode, "ledger_write_error");
  assert.doesNotMatch(result.errorMessage, /forced decision|password|stack/i);

  const orphanRun = await q<RowDataPacket[]>(`SELECT id FROM seo_research_runs WHERE id = ?`, [
    "seorun_rollback_probe",
  ]);
  const orphanDec = await q<RowDataPacket[]>(
    `SELECT id FROM seo_opportunity_decisions WHERE run_id = ?`,
    ["seorun_rollback_probe"],
  );
  assert.equal(orphanRun.length, 0);
  assert.equal(orphanDec.length, 0);

  const afterRuns = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_research_runs`);
  const afterDec = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_opportunity_decisions`);
  assert.equal(Number(afterRuns[0].n), Number(beforeRuns[0].n));
  assert.equal(Number(afterDec[0].n), Number(beforeDec[0].n));

  runDisposableRootSql(`DROP TRIGGER IF EXISTS trg_ledger_force_decision_fail;`);
});

test("G — Foreign key enforcement + ON DELETE RESTRICT", async () => {
  assertDisposableTarget();
  await assert.rejects(
    () =>
      exec(
        `INSERT INTO seo_opportunity_decisions
          (id, run_id, opportunity_index, opportunity_identity, created_at, evaluation_status)
         VALUES (?, ?, 0, ?, UTC_TIMESTAMP(), 'OK')`,
        ["seodec_orphan", "seorun_does_not_exist", "id_orphan".padEnd(64, "0")],
      ),
    (err: unknown) => {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      return code === "ER_NO_REFERENCED_ROW_2" || code === "ER_NO_REFERENCED_ROW";
    },
  );

  // Ensure a persisted parent+child, then DELETE parent must RESTRICT.
  const parentId = "seorun_fk_parent";
  await insertResearchRunWithDecisions({
    runId: parentId,
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "FK parent topic firestick",
          workingTitle: "FK parent title firestick",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: "id_fk_parent".padEnd(64, "f"),
            topic: "FK parent topic firestick",
            title: "FK parent title firestick",
          }),
        ],
      },
    },
  });
  await assert.rejects(
    () => exec(`DELETE FROM seo_research_runs WHERE id = ?`, [parentId]),
    (err: unknown) => {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      return code === "ER_ROW_IS_REFERENCED_2" || code === "ER_ROW_IS_REFERENCED";
    },
  );
});

test("H — Uniqueness of (run_id, opportunity_index); identity reusable across runs", async () => {
  assertDisposableTarget();
  const sharedIdentity = "id_shared_across_runs".padEnd(64, "s");
  const a = await insertResearchRunWithDecisions({
    runId: "seorun_uniq_a",
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Unique A topic firestick",
          workingTitle: "Unique A title firestick",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: sharedIdentity,
            topic: "Unique A topic firestick",
            title: "Unique A title firestick",
          }),
        ],
      },
    },
  });
  assert.equal(a.ok, true);

  const b = await insertResearchRunWithDecisions({
    runId: "seorun_uniq_b",
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Unique B topic firestick",
          workingTitle: "Unique B title firestick",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: sharedIdentity,
            topic: "Unique B topic firestick",
            title: "Unique B title firestick",
          }),
        ],
      },
    },
  });
  assert.equal(b.ok, true);

  const shared = await q<RowDataPacket[]>(
    `SELECT run_id FROM seo_opportunity_decisions WHERE opportunity_identity = ? ORDER BY run_id`,
    [sharedIdentity],
  );
  assert.equal(shared.length, 2);

  await assert.rejects(
    () =>
      exec(
        `INSERT INTO seo_opportunity_decisions
          (id, run_id, opportunity_index, opportunity_identity, created_at, evaluation_status)
         VALUES (?, 'seorun_uniq_a', 0, ?, UTC_TIMESTAMP(), 'OK')`,
        ["seodec_dup_index", "id_dup".padEnd(64, "x")],
      ),
    (err: unknown) => {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      return code === "ER_DUP_ENTRY";
    },
  );
});

test("I — Bounds / nulls / scores / sixth rejected / UTC conversion", async () => {
  assertDisposableTarget();
  // Five decisions accepted
  const opps5 = Array.from({ length: 5 }, (_, i) =>
    opportunity({
      topic: `Five topic ${i} firestick apps`,
      workingTitle: `Five title ${i} firestick apps`,
      recommendation: "NEW_BLOG",
    }),
  );
  const evals5 = opps5.map((o, i) =>
    evaluation(i, {
      identity: `id_five_${i}`.padEnd(64, String(i)),
      topic: o.topic,
      title: o.workingTitle,
      score: i === 0 ? 0 : i === 4 ? 100 : 50 + i,
    }),
  );
  const five = await insertResearchRunWithDecisions({
    runId: "seorun_five",
    createdAt: "2026-06-01T23:30:00.000Z",
    completedAt: "2026-06-01T23:30:10.000Z",
    research: {
      ok: true,
      research: researchOk(opps5),
      decisionPipeline: { pipelineVersion: "v1", runStatus: "OK", evaluations: evals5 },
    },
  });
  assert.equal(five.ok, true);
  if (!five.ok) return;
  assert.equal(five.decisionCount, 5);
  const fiveRows = await q<RowDataPacket[]>(
    `SELECT opportunity_index, priority_score, created_at FROM seo_opportunity_decisions
     WHERE run_id = ? ORDER BY opportunity_index`,
    ["seorun_five"],
  );
  assert.equal(fiveRows.length, 5);
  assert.equal(Number(fiveRows[0].priority_score), 0);
  assert.equal(Number(fiveRows[4].priority_score), 100);
  assert.equal(asUtcMysqlDateTime(fiveRows[0].created_at), "2026-06-01 23:30:00");

  // Sixth rejected by mapper (no write)
  const opps6 = [
    ...opps5,
    opportunity({
      topic: "Sixth topic firestick apps uk",
      workingTitle: "Sixth title firestick apps uk",
      recommendation: "NEW_BLOG",
    }),
  ];
  const mapped6 = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk(opps6),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          ...evals5,
          evaluation(5, {
            identity: "id_six".padEnd(64, "6"),
            topic: "Sixth topic firestick apps uk",
            title: "Sixth title firestick apps uk",
          }),
        ],
      },
    },
  });
  assert.equal(mapped6.ok, false);
  if (mapped6.ok) return;
  assert.equal(mapped6.errorCode, "too_many_opportunities");

  const badScore = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([opps5[0]]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: "id_bad_score".padEnd(64, "z"),
            topic: opps5[0].topic,
            title: opps5[0].workingTitle,
            score: 101,
          }),
        ],
      },
    },
  });
  assert.equal(badScore.ok, false);
  if (!badScore.ok) assert.equal(badScore.errorCode, "invalid_priority_score");

  const mismatch = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([opps5[0]]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: "id_mismatch".padEnd(64, "m"),
            topic: opps5[0].topic,
            title: opps5[0].workingTitle,
            nbaAction: "NEW_BLOG",
            autonomous: false,
            selectable: true,
          }),
        ],
      },
    },
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.errorCode, "automation_selectable_mismatch");

  // Nullable evaluation fields (VALIDATION_ERROR without Priority/NBA inventing)
  const nullable = await insertResearchRunWithDecisions({
    runId: "seorun_nullable",
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Nullable eval topic firestick",
          workingTitle: "Nullable eval title firestick",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [
          evaluation(0, {
            identity: "id_nullable".padEnd(64, "n"),
            topic: "Nullable eval topic firestick",
            title: "Nullable eval title firestick",
            status: "VALIDATION_ERROR",
            includeNba: false,
            includePriority: false,
            includeRf: false,
          }),
        ],
      },
    },
  });
  assert.equal(nullable.ok, true);
  const nullRow = await q<RowDataPacket[]>(
    `SELECT nba_action, priority_score, rf_verdict, research_confidence
     FROM seo_opportunity_decisions WHERE run_id = ?`,
    ["seorun_nullable"],
  );
  assert.equal(nullRow.length, 1);
  assert.equal(nullRow[0].nba_action, null);
  assert.equal(nullRow[0].priority_score, null);
  assert.equal(nullRow[0].rf_verdict, null);
});

test("J — Cleanup disposable Ledger rows and triggers only", async () => {
  assertDisposableTarget();
  runDisposableRootSql(`DROP TRIGGER IF EXISTS trg_ledger_force_decision_fail;`);
  await exec(`DELETE FROM seo_opportunity_decisions`);
  await exec(`DELETE FROM seo_research_runs`);

  const runs = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_research_runs`);
  const decs = await q<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM seo_opportunity_decisions`);
  assert.equal(Number(runs[0].n), 0);
  assert.equal(Number(decs[0].n), 0);

  // Fixture content from upgrade path may remain; that is disposable-schema data only.
  const db = await q<RowDataPacket[]>(`SELECT DATABASE() AS db`);
  assert.match(String(db[0].db), /disposable|ledger_l1/i);
  assert.equal(String(db[0].db), process.env.DB_NAME);

  // End pool so mysqld can be stopped cleanly after the suite.
  await getDbPool().end();
});
