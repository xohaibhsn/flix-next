/**
 * CONCURRENCY-20 focused MariaDB 11.8.9 acceptance extras (M03/M12/M14/M16).
 * Launched only via run-cms-concurrency-mariadb-integration.cjs with
 * CMS_CONCURRENCY_MYSQL_TEST_FILE pointing here. Not auto-run by npm test.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import { CMS_SCHEMA_VERSION_KEY } from "../lib/cms/migration-flags";
import { ensureCmsSchemaCurrent } from "../lib/cms/mysql-migrate";
import { MysqlCmsRepository } from "../lib/cms/mysql-repository";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { getDbPool } from "../lib/db/pool";
import {
  ensureOwnershipRowPresent,
  execOwnedDestructive,
  OWNERSHIP_TABLE,
  proveOwnedDisposableMysql,
  rawOwnedDestructive,
} from "./cms-concurrency-mysql-ownership-runtime";

const require = createRequire(import.meta.url);
const { loadGuards } = require("./cms-concurrency-engine-guards.cjs") as {
  loadGuards: (env?: NodeJS.ProcessEnv) => {
    APPROVED_DB_NAME: string;
    APPROVED_PORT: string;
    validateDisposableMysqlTarget: (env: NodeJS.ProcessEnv) =>
      | { ok: true; host: string; port: string; database: string; user: string }
      | { ok: false; reason: string };
  };
};
const { APPROVED_DB_NAME, APPROVED_PORT, validateDisposableMysqlTarget } = loadGuards(process.env);

function assertDisposableTarget() {
  const gate = validateDisposableMysqlTarget(process.env);
  if (!gate.ok) throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
  assert.equal(gate.port, APPROVED_PORT);
  assert.equal(gate.database, APPROVED_DB_NAME);
}

async function q<T extends RowDataPacket[]>(sql: string, params: unknown[] = []) {
  const [rows] = await getDbPool().query<T>(sql, params);
  return rows;
}

async function exec(sql: string, params: Array<string | number | boolean | null> = []) {
  await getDbPool().execute(sql, params);
}

async function requireOwnership() {
  await ensureOwnershipRowPresent();
  const ownership = await proveOwnedDisposableMysql();
  if (!ownership.ok) {
    throw new Error(`REAL_MYSQL_OWNERSHIP_BLOCKED: ${ownership.reason}`);
  }
  return ownership;
}

async function installMinimalV5() {
  const ownership = await requireOwnership();
  await rawOwnedDestructive(ownership, "SET FOREIGN_KEY_CHECKS=0");
  for (const table of [
    "seo_opportunity_decisions",
    "seo_research_runs",
    "seo_planning_drafts",
    "page_sections",
    "pages",
    "redirects",
    "site_settings",
  ]) {
    assert.notEqual(table, OWNERSHIP_TABLE);
    await execOwnedDestructive(ownership, `DROP TABLE IF EXISTS \`${table}\``);
  }
  await rawOwnedDestructive(ownership, "SET FOREIGN_KEY_CHECKS=1");

  await exec(`
    CREATE TABLE pages (
      id VARCHAR(80) NOT NULL,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(160) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'published',
      cms_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY pages_slug_unique (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await exec(`
    CREATE TABLE page_sections (
      id VARCHAR(80) NOT NULL,
      page_id VARCHAR(80) NOT NULL,
      section_type VARCHAR(60) NOT NULL,
      label VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      visible TINYINT(1) NOT NULL DEFAULT 1,
      section_data LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY page_sections_page_sort (page_id, sort_order),
      CONSTRAINT page_sections_page_fk
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await exec(`
    CREATE TABLE site_settings (
      setting_key VARCHAR(80) NOT NULL,
      setting_value LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await exec(`
    CREATE TABLE seo_research_runs (
      id VARCHAR(80) NOT NULL,
      created_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'manual',
      actor_admin_id VARCHAR(80) NULL,
      research_ok TINYINT(1) NOT NULL,
      research_error_code VARCHAR(80) NULL,
      pipeline_run_status VARCHAR(40) NOT NULL,
      pipeline_version VARCHAR(20) NULL,
      pipeline_error_code VARCHAR(80) NULL,
      opportunity_count INT NOT NULL DEFAULT 0,
      gsc_status VARCHAR(40) NULL,
      durability_status VARCHAR(20) NOT NULL DEFAULT 'COMPLETE',
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await exec(`
    CREATE TABLE seo_opportunity_decisions (
      id VARCHAR(80) NOT NULL,
      run_id VARCHAR(80) NOT NULL,
      opportunity_index INT NOT NULL,
      opportunity_identity VARCHAR(80) NOT NULL,
      created_at DATETIME NOT NULL,
      topic VARCHAR(160) NOT NULL DEFAULT '',
      working_title VARCHAR(180) NOT NULL DEFAULT '',
      research_recommendation VARCHAR(40) NOT NULL DEFAULT '',
      research_confidence VARCHAR(20) NULL,
      existing_coverage VARCHAR(20) NULL,
      matched_public_url VARCHAR(300) NOT NULL DEFAULT '',
      restore_path VARCHAR(300) NOT NULL DEFAULT '',
      target_post_id VARCHAR(80) NULL,
      evaluation_status VARCHAR(40) NOT NULL,
      rf_verdict VARCHAR(40) NULL,
      rf_fingerprint VARCHAR(80) NULL,
      nba_action VARCHAR(40) NULL,
      nba_status VARCHAR(40) NULL,
      nba_autonomous_eligible TINYINT(1) NULL,
      nba_fingerprint VARCHAR(80) NULL,
      priority_score INT NULL,
      priority_tier VARCHAR(20) NULL,
      priority_score_version VARCHAR(20) NULL,
      priority_automation_selectable TINYINT(1) NULL,
      priority_fingerprint VARCHAR(80) NULL,
      pipeline_fingerprint VARCHAR(80) NULL,
      selected TINYINT(1) NOT NULL DEFAULT 0,
      selection_source VARCHAR(40) NOT NULL DEFAULT 'none',
      PRIMARY KEY (id),
      UNIQUE KEY seo_opportunity_decisions_run_index (run_id, opportunity_index),
      CONSTRAINT seo_opportunity_decisions_run_fk
        FOREIGN KEY (run_id) REFERENCES seo_research_runs(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled) VALUES ('page-home', 'Home', '/', 'published', 1)`,
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-home-1', 'page-home', 'rich-text', 'Body', 0, 1, ?)`,
    [JSON.stringify({ html: "<p>v5-mdb</p>" })],
  );
  await exec(
    `INSERT INTO seo_research_runs
      (id, created_at, completed_at, research_ok, pipeline_run_status, opportunity_count, durability_status)
     VALUES ('seorun_mdb', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, 'ok', 1, 'COMPLETE')`,
  );
  await exec(
    `INSERT INTO seo_opportunity_decisions
      (id, run_id, opportunity_index, opportunity_identity, created_at, evaluation_status)
     VALUES ('seodec_mdb', 'seorun_mdb', 0, 'ident-mdb', UTC_TIMESTAMP(), 'open')`,
  );
  await exec(`INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)`, [
    CMS_SCHEMA_VERSION_KEY,
    "5",
  ]);
}

test("M01 — MariaDB engine identity + ownership", async () => {
  assertDisposableTarget();
  const rows = await q<
    Array<
      RowDataPacket & {
        version: string;
        db: string;
        port: number;
        bind_address: string;
        datadir: string;
        eng: string;
      }
    >
  >(
    `SELECT VERSION() AS version, DATABASE() AS db, @@port AS port, @@bind_address AS bind_address,
            @@datadir AS datadir,
            (SELECT ENGINE FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cms_concurrency_test_owner' LIMIT 1) AS eng`,
  );
  const row = rows[0]!;
  assert.match(String(row.version), /^11\.8\.9-MariaDB\b/i);
  assert.equal(row.db, APPROVED_DB_NAME);
  assert.equal(Number(row.port), 3312);
  assert.equal(String(row.bind_address), "127.0.0.1");
  assert.match(String(row.datadir).replace(/\\/g, "/").toLowerCase(), /flix-next-mariadb-phase1-20-/i);
  assert.equal(String(row.eng).toUpperCase(), "INNODB");
  const ownership = await requireOwnership();
  assert.equal(ownership.ok, true);
});

test("M02 — genuine v5→v6 migration on MariaDB", async () => {
  assertDisposableTarget();
  await installMinimalV5();
  const beforeMeta = await q<Array<RowDataPacket>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pages' AND COLUMN_NAME = 'content_revision'`,
  );
  assert.equal(beforeMeta.length, 0);

  const outcome = await ensureCmsSchemaCurrent();
  assert.equal(outcome, "ensured");

  const meta = await q<
    Array<RowDataPacket & { DATA_TYPE: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: unknown }>
  >(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pages' AND COLUMN_NAME = 'content_revision'`,
  );
  assert.equal(meta.length, 1);
  assert.equal(String(meta[0]!.DATA_TYPE).toLowerCase(), "int");
  assert.doesNotMatch(String(meta[0]!.COLUMN_TYPE).toLowerCase(), /unsigned/);
  assert.equal(String(meta[0]!.IS_NULLABLE).toUpperCase(), "NO");
  assert.equal(String(meta[0]!.COLUMN_DEFAULT), "1");

  const rev = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rev[0]!.content_revision), 1);
  const ver = await q<Array<RowDataPacket & { setting_value: string }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ?",
    [CMS_SCHEMA_VERSION_KEY],
  );
  assert.equal(String(ver[0]!.setting_value), String(CURRENT_CMS_SCHEMA_VERSION));
  const ledger = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM seo_research_runs WHERE id = 'seorun_mdb'",
  );
  assert.equal(ledger.length, 1);
});

test("M03 — new MysqlCmsRepository instance second startup is non-destructive", async () => {
  assertDisposableTarget();
  const beforeLedger = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM seo_research_runs WHERE id = 'seorun_mdb'",
  );

  // Distinct repository objects — not an OS process restart.
  // First ready() may apply unflagged E1 maintenance once; second must not mutate further.
  const repoA = new MysqlCmsRepository();
  await repoA.ready();

  const afterFirstRev = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  const afterFirstSec = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM page_sections WHERE page_id = 'page-home'",
  );

  const repoB = new MysqlCmsRepository();
  await repoB.ready();

  const afterRev = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  const afterSec = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM page_sections WHERE page_id = 'page-home'",
  );
  const afterLedger = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM seo_research_runs WHERE id = 'seorun_mdb'",
  );
  const ver = await q<Array<RowDataPacket & { setting_value: string }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ?",
    [CMS_SCHEMA_VERSION_KEY],
  );

  assert.equal(Number(afterRev[0]!.content_revision), Number(afterFirstRev[0]!.content_revision));
  assert.equal(Number(afterSec[0]!.cnt), Number(afterFirstSec[0]!.cnt));
  assert.equal(Number(afterLedger[0]!.cnt), Number(beforeLedger[0]!.cnt));
  assert.equal(String(ver[0]!.setting_value), String(CURRENT_CMS_SCHEMA_VERSION));
  assert.notEqual(repoA, repoB);
});

test("M12 — Ledger unique (run_id, opportunity_index) + FK RESTRICT", async () => {
  assertDisposableTarget();
  await requireOwnership();

  await assert.rejects(
    () =>
      exec(
        `INSERT INTO seo_opportunity_decisions
          (id, run_id, opportunity_index, opportunity_identity, created_at, evaluation_status)
         VALUES ('seodec_dup', 'seorun_mdb', 0, 'ident-dup', UTC_TIMESTAMP(), 'open')`,
      ),
    /Duplicate|ER_DUP_ENTRY|1062/i,
  );

  await assert.rejects(
    () => exec(`DELETE FROM seo_research_runs WHERE id = 'seorun_mdb'`),
    /foreign key|1451|Cannot delete|RESTRICT/i,
  );

  const still = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM seo_research_runs WHERE id = 'seorun_mdb'",
  );
  assert.equal(still.length, 1);
});

test("M14 — interrupted init: column present but marker still 5 recovers safely", async () => {
  assertDisposableTarget();
  await installMinimalV5();

  // Synthetic interrupted state: column added, marker not advanced.
  await exec(
    `ALTER TABLE pages ADD COLUMN content_revision INT NOT NULL DEFAULT 1`,
  );
  await exec(`UPDATE site_settings SET setting_value = '5' WHERE setting_key = ?`, [
    CMS_SCHEMA_VERSION_KEY,
  ]);

  const outcome = await ensureCmsSchemaCurrent();
  assert.ok(outcome === "ensured" || outcome === "skipped");

  const meta = await q<Array<RowDataPacket>>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pages' AND COLUMN_NAME = 'content_revision'`,
  );
  assert.equal(meta.length, 1);
  const ver = await q<Array<RowDataPacket & { setting_value: string }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ?",
    [CMS_SCHEMA_VERSION_KEY],
  );
  assert.equal(String(ver[0]!.setting_value), String(CURRENT_CMS_SCHEMA_VERSION));
  const rev = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rev[0]!.content_revision), 1);
});

test("M16 — MariaDB SQL mode / engine notes captured", async () => {
  assertDisposableTarget();
  const rows = await q<
    Array<RowDataPacket & { version: string; sql_mode: string; isolation: string; eng: string }>
  >(
    `SELECT VERSION() AS version, @@sql_mode AS sql_mode, @@transaction_isolation AS isolation,
            (SELECT ENGINE FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pages' LIMIT 1) AS eng`,
  );
  const row = rows[0]!;
  assert.match(String(row.version), /^11\.8\.9-MariaDB\b/i);
  assert.equal(String(row.eng).toUpperCase(), "INNODB");
  // Record for report — not asserting MySQL-identical sql_mode.
  assert.ok(String(row.sql_mode).length >= 0);
  assert.ok(String(row.isolation).length > 0);
  console.log(
    JSON.stringify({
      m16: {
        version: String(row.version),
        sql_mode: String(row.sql_mode),
        isolation: String(row.isolation),
        pagesEngine: String(row.eng),
      },
    }),
  );
});

test("ZZZ — close pool", async () => {
  try {
    await getDbPool().end();
  } catch {
    /* ignore */
  }
});
