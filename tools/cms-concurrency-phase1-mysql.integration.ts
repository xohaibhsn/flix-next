/**
 * CMS Concurrency Phase 1 — REAL MySQL 8 / MariaDB 11.8.9 integration (T01–T14).
 * Launched via tools/run-cms-concurrency-mysql-integration.cjs or
 * tools/run-cms-concurrency-mariadb-integration.cjs (CONCURRENCY-20).
 * Filename avoids *.test.ts so npm test suites never auto-run mutations.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import mysql from "mysql2/promise";
import { CMS_SCHEMA_VERSION_KEY } from "../lib/cms/migration-flags";
import {
  __migrateSubscriptionPageSlugRowForTests,
  __persistPageSectionDiffForTests,
  ensureCmsSchemaCurrent,
} from "../lib/cms/mysql-migrate";
import { MysqlCmsRepository, MysqlWithBuildFallback } from "../lib/cms/mysql-repository";
import { isPageConflictError, MYSQL_SIGNED_INT_MAX, PAGE_CONFLICT_CODE } from "../lib/cms/page-revision";
import { DEFAULT_CMS_SCHEMA_ENSURE_LOCK, runWithCmsSchemaAdvisoryLock } from "../lib/cms/schema-advisory-lock";
import { SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "../lib/cms/page-paths";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { getDbPool } from "../lib/db/pool";
import type { CmsPage, CmsSection } from "../lib/cms/types";
import { LocalJsonRepository } from "../lib/cms/json-repository";

import {
  DISPOSABLE_ENGINE,
  ensureOwnershipRowPresent,
  execOwnedDestructive,
  OWNERSHIP_TABLE,
  proveOwnedDisposableMysql,
  rawOwnedDestructive,
} from "./cms-concurrency-mysql-ownership-runtime";

const require = createRequire(import.meta.url);
const { loadGuards } = require("./cms-concurrency-engine-guards.cjs") as {
  loadGuards: (env?: NodeJS.ProcessEnv) => {
    engine: string;
    APPROVED_DB_NAME: string;
    APPROVED_PORT: string;
    validateDisposableMysqlTarget: (env: NodeJS.ProcessEnv) =>
      | { ok: true; host: string; port: string; database: string; user: string }
      | { ok: false; reason: string };
  };
};
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  validateDisposableMysqlTarget,
} = loadGuards(process.env);
const IS_MARIADB = DISPOSABLE_ENGINE === "mariadb" || String(process.env.CMS_CONCURRENCY_ENGINE || "").toLowerCase() === "mariadb";

function assertDisposableTarget() {
  const gate = validateDisposableMysqlTarget(process.env);
  if (!gate.ok) throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
  assert.equal(gate.host, "127.0.0.1");
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

/** Non-prepared query — required for DDL like CREATE TRIGGER. */
async function rawQuery(sql: string) {
  await getDbPool().query(sql);
}

async function requireOwnership() {
  await ensureOwnershipRowPresent();
  const ownership = await proveOwnedDisposableMysql();
  if (!ownership.ok) {
    throw new Error(`REAL_MYSQL_OWNERSHIP_BLOCKED: ${ownership.reason}`);
  }
  return ownership;
}

function section(id: string, label: string, html = "<p>ok</p>"): CmsSection {
  return {
    id,
    type: "rich-text",
    label,
    order: 0,
    visible: true,
    data: { html } as CmsSection["data"],
  };
}

function pageFixture(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    contentRevision: 1,
    sections: [section("sec-home-1", "Body", "<p>base</p>")],
    ...overrides,
  };
}

/** Representative v5 pages table (no content_revision) + minimal dependents. */
async function installV5Fixture() {
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
    CREATE TABLE redirects (
      id VARCHAR(80) NOT NULL,
      source_path VARCHAR(255) NOT NULL,
      destination_path VARCHAR(255) NOT NULL,
      status_code SMALLINT NOT NULL DEFAULT 301,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY redirects_source_unique (source_path)
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
    `INSERT INTO pages (id, name, slug, status, cms_enabled) VALUES (?, ?, ?, 'published', 1)`,
    ["page-home", "Home", "/"],
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES (?, ?, 'rich-text', 'Body', 0, 1, ?)`,
    ["sec-home-1", "page-home", JSON.stringify({ html: "<p>v5-base</p>" })],
  );
  await exec(
    `INSERT INTO seo_research_runs
      (id, created_at, completed_at, research_ok, pipeline_run_status, opportunity_count, durability_status)
     VALUES ('seorun_keep', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, 'ok', 0, 'COMPLETE')`,
  );
  await exec(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)`,
    [CMS_SCHEMA_VERSION_KEY, "5"],
  );
}

async function readContentRevisionMeta() {
  return q<
    Array<
      RowDataPacket & {
        COLUMN_NAME: string;
        DATA_TYPE: string;
        COLUMN_TYPE: string;
        IS_NULLABLE: string;
        COLUMN_DEFAULT: unknown;
      }
    >
  >(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pages' AND COLUMN_NAME = 'content_revision'
     LIMIT 1`,
  );
}

async function schemaVersion(): Promise<string | null> {
  const rows = await q<Array<RowDataPacket & { setting_value: unknown }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [CMS_SCHEMA_VERSION_KEY],
  );
  return rows[0] ? String(rows[0].setting_value) : null;
}

async function independentConnection() {
  assertDisposableTarget();
  return mysql.createConnection({
    host: "127.0.0.1",
    port: Number(APPROVED_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: APPROVED_DB_NAME,
    timezone: "Z",
  });
}

test(
  IS_MARIADB
    ? "Gate C / M01: connection identity is disposable localhost MariaDB 11.8.9"
    : "Gate C: connection identity is disposable localhost MySQL 8.0.46",
  async () => {
  assertDisposableTarget();
  const rows = await q<
    Array<RowDataPacket & { version: string; db: string; db_user: string; port: number; bind_address: string }>
  >("SELECT VERSION() AS version, DATABASE() AS db, USER() AS db_user, @@port AS port, @@bind_address AS bind_address");
  const row = rows[0]!;
  if (IS_MARIADB) {
    assert.match(String(row.version), /^11\.8\.9-MariaDB\b/i);
    assert.equal(Number(row.port), 3312);
    assert.match(String(row.db_user), /^flix_cms_mdb_test@/);
  } else {
    assert.match(String(row.version), /^8\.0\.46/);
    assert.equal(Number(row.port), 3307);
    assert.match(String(row.db_user), /^flix_cms_test@/);
  }
  assert.equal(row.db, APPROVED_DB_NAME);
  assert.equal(String(row.bind_address), "127.0.0.1");
  await ensureOwnershipRowPresent();
  const ownership = await proveOwnedDisposableMysql();
  assert.equal(ownership.ok, true, ownership.ok ? "" : ownership.reason);
});

test("T01 — Schema v5 → v6 adds compatible content_revision and preserves rows", async () => {
  assertDisposableTarget();
  await installV5Fixture();
  const beforePages = await q<Array<RowDataPacket & { id: string; slug: string }>>("SELECT id, slug FROM pages");
  assert.equal(beforePages.length, 1);
  const beforeMeta = await readContentRevisionMeta();
  assert.equal(beforeMeta.length, 0);

  const outcome = await ensureCmsSchemaCurrent();
  assert.equal(outcome, "ensured");

  const meta = await readContentRevisionMeta();
  assert.equal(meta.length, 1);
  assert.equal(String(meta[0]!.DATA_TYPE).toLowerCase(), "int");
  assert.equal(String(meta[0]!.IS_NULLABLE).toUpperCase(), "NO");
  assert.equal(String(meta[0]!.COLUMN_DEFAULT), "1");
  assert.doesNotMatch(String(meta[0]!.COLUMN_TYPE).toLowerCase(), /unsigned/);

  const rev = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rev[0]!.content_revision), 1);

  const sections = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM page_sections WHERE page_id = 'page-home'",
  );
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.id, "sec-home-1");

  const ledger = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM seo_research_runs WHERE id = 'seorun_keep'",
  );
  assert.equal(ledger.length, 1);
  assert.equal(await schemaVersion(), String(CURRENT_CMS_SCHEMA_VERSION));
});

test("T02 — Migration idempotency", async () => {
  assertDisposableTarget();
  const before = await schemaVersion();
  const outcome = await ensureCmsSchemaCurrent();
  assert.equal(outcome, "skipped");
  assert.equal(await schemaVersion(), before);
  const meta = await readContentRevisionMeta();
  assert.equal(meta.length, 1);
});

test("T03 — Concurrent schema ensure serializes via advisory lock", async () => {
  assertDisposableTarget();
  // Force non-fast-path briefly by setting marker to 5, then race ensures.
  await exec("UPDATE site_settings SET setting_value = '5' WHERE setting_key = ?", [CMS_SCHEMA_VERSION_KEY]);
  const results = await Promise.all([ensureCmsSchemaCurrent(), ensureCmsSchemaCurrent()]);
  assert.ok(results.every((r) => r === "ensured" || r === "skipped"));
  assert.ok(results.some((r) => r === "ensured"));
  assert.equal(await schemaVersion(), String(CURRENT_CMS_SCHEMA_VERSION));
  const meta = await readContentRevisionMeta();
  assert.equal(meta.length, 1);
});

test("T04 — Advisory-lock lifecycle on real connections", async () => {
  assertDisposableTarget();
  let ensured = 0;
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => getDbPool().getConnection(),
    readIsFastPath: async () => false,
    ensureSchema: async () => {
      ensured += 1;
    },
  });
  assert.equal(ensured, 1);

  // Timeout: hold lock on conn A; conn B GET_LOCK times out (0).
  const holder = await independentConnection();
  const waiter = await independentConnection();
  try {
    const [holdRows] = await holder.query<Array<RowDataPacket & { acquired: number }>>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [DEFAULT_CMS_SCHEMA_ENSURE_LOCK],
    );
    assert.equal(Number(holdRows[0]?.acquired), 1);

    const [waitRows] = await waiter.query<Array<RowDataPacket & { acquired: number }>>(
      "SELECT GET_LOCK(?, 1) AS acquired",
      [DEFAULT_CMS_SCHEMA_ENSURE_LOCK],
    );
    assert.equal(Number(waitRows[0]?.acquired), 0);

    const [releaseRows] = await holder.query<Array<RowDataPacket & { released: number }>>(
      "SELECT RELEASE_LOCK(?) AS released",
      [DEFAULT_CMS_SCHEMA_ENSURE_LOCK],
    );
    assert.equal(Number(releaseRows[0]?.released), 1);
  } finally {
    await holder.end();
    await waiter.end();
  }

  // Lock reusable after release via production helper.
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => getDbPool().getConnection(),
    readIsFastPath: async () => true,
    ensureSchema: async () => {
      throw new Error("fast-path should skip ensure");
    },
  });
});

let sharedRepo: MysqlCmsRepository | null = null;

async function warmMysqlRepo(): Promise<MysqlCmsRepository> {
  if (!sharedRepo) {
    // Unflagged ensureReady — E1 fix allows longform/microcopy maintenance without false conflicts.
    const repo = new MysqlCmsRepository();
    await repo.ready();
    sharedRepo = repo;
  }
  return sharedRepo;
}

async function resetHomePage(revision: number, html = "<p>base</p>", name = "Home") {
  const ownership = await requireOwnership();
  await execOwnedDestructive(ownership, "DELETE FROM page_sections WHERE page_id = 'page-home'");
  await execOwnedDestructive(ownership, "DELETE FROM pages WHERE id = 'page-home'");
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision) VALUES (?, ?, ?, 'published', 1, ?)`,
    ["page-home", name, "/", revision],
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES (?, ?, 'rich-text', 'Body', 0, 1, ?)`,
    ["sec-home-1", "page-home", JSON.stringify({ html })],
  );
}

test("T05 — Normal page Save 1 → 2", async () => {
  assertDisposableTarget();
  const repo = await warmMysqlRepo();
  await resetHomePage(1, "<p>base</p>", "Home");
  const saved = await repo.savePage(pageFixture({ contentRevision: 1, name: "Home Saved" }));
  assert.equal(saved.contentRevision, 2);
  const rows = await q<Array<RowDataPacket & { content_revision: number; name: string }>>(
    "SELECT content_revision, name FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rows[0]!.content_revision), 2);
  assert.equal(rows[0]!.name, "Home Saved");
});

test("T06/T07 — Concurrent Saves: one success, one PAGE_CONFLICT; loser leaves data intact", async () => {
  assertDisposableTarget();
  const repo = await warmMysqlRepo();
  await resetHomePage(1, "<p>preserve-me</p>", "Base");
  // Two overlapping savePage calls (independent DB transactions via the pool).
  const results = await Promise.allSettled([
    repo.savePage(pageFixture({ contentRevision: 1, name: "WriterA", sections: [section("sec-home-1", "Body", "<p>A</p>")] })),
    repo.savePage(pageFixture({ contentRevision: 1, name: "WriterB", sections: [section("sec-home-1", "Body", "<p>B</p>")] })),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const bad = results.filter((r) => r.status === "rejected");
  if (ok.length !== 1 || bad.length !== 1) {
    const detail = results.map((r) =>
      r.status === "fulfilled"
        ? `ok rev=${r.value.contentRevision} name=${r.value.name}`
        : `err=${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
    );
    assert.fail(`expected 1 success + 1 conflict, got: ${detail.join(" | ")}`);
  }
  assert.equal(isPageConflictError((bad[0] as PromiseRejectedResult).reason), true);
  assert.equal(((bad[0] as PromiseRejectedResult).reason as { code?: string }).code, PAGE_CONFLICT_CODE);

  const winner = (ok[0] as PromiseFulfilledResult<CmsPage>).value;
  assert.equal(winner.contentRevision, 2);
  const rows = await q<Array<RowDataPacket & { content_revision: number; name: string }>>(
    "SELECT content_revision, name FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rows[0]!.content_revision), 2);
  assert.equal(rows[0]!.name, winner.name);
  const sections = await q<Array<RowDataPacket & { section_data: string }>>(
    "SELECT section_data FROM page_sections WHERE page_id = 'page-home'",
  );
  assert.equal(sections.length, 1);
  assert.match(String(sections[0]!.section_data), /"html":"<p>[AB]<\/p>"/);
});

test("T08 — Transaction rollback on controlled section-write failure", async () => {
  assertDisposableTarget();
  const repo = await warmMysqlRepo();
  await resetHomePage(3, "<p>keep</p>", "RollbackBase");

  // Trigger fires only for the probe section id used by this test.
  await rawQuery("DROP TRIGGER IF EXISTS trg_cms_concurrency_rollback_probe");
  await rawQuery(`
    CREATE TRIGGER trg_cms_concurrency_rollback_probe
    BEFORE INSERT ON page_sections
    FOR EACH ROW
    BEGIN
      IF NEW.id = 'sec-rollback-boom' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced section insert failure';
      END IF;
    END
  `);

  await assert.rejects(
    () =>
      repo.savePage(
        pageFixture({
          contentRevision: 3,
          name: "ShouldRollback",
          sections: [section("sec-rollback-boom", "Boom", "<p>nope</p>")],
        }),
      ),
    /forced section insert failure|CMS MySQL is unavailable|Page content/i,
  );

  await rawQuery("DROP TRIGGER IF EXISTS trg_cms_concurrency_rollback_probe");

  const rows = await q<Array<RowDataPacket & { content_revision: number; name: string }>>(
    "SELECT content_revision, name FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rows[0]!.content_revision), 3);
  assert.equal(rows[0]!.name, "RollbackBase");
  const sections = await q<Array<RowDataPacket & { id: string; section_data: string }>>(
    "SELECT id, section_data FROM page_sections WHERE page_id = 'page-home'",
  );
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.id, "sec-home-1");
  assert.match(String(sections[0]!.section_data), /keep/);
});

test("T09 — Maintenance writer rejects stale snapshot vs concurrent Save", async () => {
  assertDisposableTarget();
  const repo = await warmMysqlRepo();
  const before = [section("sec-home-1", "Body", "<p>before</p>")];
  await resetHomePage(5, "<p>before</p>", "MaintBase");

  // Save commits a newer section fingerprint while maintenance still holds stale "before".
  await repo.savePage(
    pageFixture({
      contentRevision: 5,
      name: "SavedFirst",
      sections: [section("sec-home-1", "Body", "<p>saved-live</p>")],
    }),
  );

  await assert.rejects(
    () =>
      __persistPageSectionDiffForTests(pageFixture().id, before, [
        section("sec-home-1", "Body", "<p>stale-maint</p>"),
      ]),
    /changed during maintenance write/i,
  );

  const rows = await q<Array<RowDataPacket & { content_revision: number; name: string }>>(
    "SELECT content_revision, name FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rows[0]!.content_revision), 6);
  assert.equal(rows[0]!.name, "SavedFirst");
  const sections = await q<Array<RowDataPacket & { section_data: string }>>(
    "SELECT section_data FROM page_sections WHERE page_id = 'page-home'",
  );
  assert.match(String(sections[0]!.section_data), /saved-live/);
});

test("T10 — Subscription slug mutation eligible / ineligible / noop", async () => {
  assertDisposableTarget();
  const ownership = await requireOwnership();
  await execOwnedDestructive(ownership, "DELETE FROM redirects");
  await execOwnedDestructive(ownership, "DELETE FROM page_sections");
  await execOwnedDestructive(ownership, "DELETE FROM pages");

  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES (?, 'Subscriptions', ?, 'published', 1, 2)`,
    [SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG_LEGACY],
  );
  const updated = await __migrateSubscriptionPageSlugRowForTests();
  assert.equal(updated, "updated");
  const after = await q<Array<RowDataPacket & { slug: string; content_revision: number }>>(
    "SELECT slug, content_revision FROM pages WHERE id = ?",
    [SUBSCRIPTION_PAGE_ID],
  );
  assert.equal(after[0]!.slug, SUBSCRIPTION_SLUG);
  assert.equal(Number(after[0]!.content_revision), 3);

  const noop = await __migrateSubscriptionPageSlugRowForTests();
  assert.equal(noop, "noop");
  const again = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = ?",
    [SUBSCRIPTION_PAGE_ID],
  );
  assert.equal(Number(again[0]!.content_revision), 3);

  await exec("UPDATE pages SET slug = '/about/', content_revision = 4 WHERE id = ?", [SUBSCRIPTION_PAGE_ID]);
  const ineligible = await __migrateSubscriptionPageSlugRowForTests();
  assert.equal(ineligible, "noop");
  const ineligibleRow = await q<Array<RowDataPacket & { slug: string; content_revision: number }>>(
    "SELECT slug, content_revision FROM pages WHERE id = ?",
    [SUBSCRIPTION_PAGE_ID],
  );
  assert.equal(ineligibleRow[0]!.slug, "/about/");
  assert.equal(Number(ineligibleRow[0]!.content_revision), 4);
});

test("T11 — Signed INT boundary overflow rejected", async () => {
  assertDisposableTarget();
  const repo = await warmMysqlRepo();
  await resetHomePage(MYSQL_SIGNED_INT_MAX, "<p>max</p>", "Home");
  await assert.rejects(
    () => repo.savePage(pageFixture({ contentRevision: MYSQL_SIGNED_INT_MAX })),
    /overflow|CMS MySQL is unavailable/i,
  );
  const rows = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rows[0]!.content_revision), MYSQL_SIGNED_INT_MAX);
});

test("T12 — Ledger L1–L3 tables/constraints survive ensure", async () => {
  assertDisposableTarget();
  await ensureCmsSchemaCurrent();
  const runs = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seo_research_runs'",
  );
  const decisions = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seo_opportunity_decisions'",
  );
  const planning = await q<Array<RowDataPacket & { cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seo_planning_drafts'",
  );
  assert.equal(Number(runs[0]!.cnt), 1);
  assert.equal(Number(decisions[0]!.cnt), 1);
  assert.equal(Number(planning[0]!.cnt), 1);

  const fk = await q<Array<RowDataPacket & { CONSTRAINT_NAME: string }>>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seo_opportunity_decisions'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
  );
  assert.ok(fk.some((r) => String(r.CONSTRAINT_NAME).includes("run")));
});

test("T13 — Maintenance no-op does not bump revision", async () => {
  assertDisposableTarget();
  const ownership = await requireOwnership();
  await execOwnedDestructive(ownership, "DELETE FROM page_sections");
  await execOwnedDestructive(ownership, "DELETE FROM pages");
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'Home', '/', 'published', 1, 9)`,
  );
  const sec = section("sec-home-1", "Body", "<p>same</p>");
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES (?, 'page-home', 'rich-text', 'Body', 0, 1, ?)`,
    [sec.id, JSON.stringify(sec.data)],
  );
  await __persistPageSectionDiffForTests("page-home", [sec], [sec]);
  const rows = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = 'page-home'",
  );
  assert.equal(Number(rows[0]!.content_revision), 9);
});

test("T14 — MySQL mutation failure does not fall back to JSON writes", async () => {
  assertDisposableTarget();
  const dir = mkdtempSync(path.join(tmpdir(), "flix-cms-t14-"));
  const dataDir = path.join(dir, "data");
  const previousCwd = process.cwd();
  let jsonSaveCalled = false;
  try {
    // Ensure workspace empty of pages.json
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
    process.chdir(dir);

    const mysqlOps = {
      listPages: async () => [],
      getPageById: async () => null,
      getPageBySlug: async () => null,
      savePage: async () => {
        throw new Error("simulated mysql mutation failure");
      },
      getSettings: async () => {
        throw new Error("no");
      },
      saveSettings: async () => {
        throw new Error("no");
      },
      listMedia: async () => [],
      getMediaById: async () => null,
      addMedia: async () => {
        throw new Error("no");
      },
      updateMediaAlt: async () => null,
      removeMedia: async () => undefined,
    };
    const jsonOps = {
      ...mysqlOps,
      savePage: async (page: CmsPage) => {
        jsonSaveCalled = true;
        writeFileSync(path.join(dataDir, "pages.json"), JSON.stringify({ pages: [page] }));
        return page;
      },
    };
    const wrapper = new MysqlWithBuildFallback(mysqlOps, jsonOps);
    await assert.rejects(() => wrapper.savePage(pageFixture()), /simulated mysql mutation failure/);
    assert.equal(jsonSaveCalled, false);
    assert.equal(existsSync(path.join(dataDir, "pages.json")), false);

    // Control: LocalJsonRepository still can write in development when explicitly used.
    const jsonRepo = new LocalJsonRepository();
    writeFileSync(path.join(dataDir, "pages.json"), JSON.stringify({ pages: [pageFixture()] }));
    const saved = await jsonRepo.savePage(pageFixture({ contentRevision: 1, name: "json-ok" }));
    assert.equal(saved.contentRevision, 2);
    const disk = JSON.parse(readFileSync(path.join(dataDir, "pages.json"), "utf8")) as { pages: CmsPage[] };
    assert.equal(disk.pages[0]?.name, "json-ok");
  } finally {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ZZZ — close pool so the process can exit", async () => {
  try {
    await getDbPool().end();
  } catch {
    /* ignore */
  }
});
