/**
 * E1 + unflagged cold-start — REAL MySQL 8 integration.
 * Launched via tools/run-cms-concurrency-mysql-integration.cjs with this file as argv test target,
 * or the default runner includes it when CMS_CONCURRENCY_E1=1.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import {
  CMS_CONTENT_CLEANUP_V1,
  CMS_SCHEMA_VERSION_KEY,
  SUBSCRIPTION_SEO_MICROCOPY_V1,
  SUBSCRIPTION_SEO_MICROCOPY_V2,
  TEST_TAGLINE_CLEANUP_V1,
} from "../lib/cms/migration-flags";
import {
  __persistPageSectionDiffForTests,
  ensureCmsSchemaCurrent,
  seedSeoLongformIfNeeded,
  migrateSubscriptionSeoMicrocopyIfNeeded,
} from "../lib/cms/mysql-migrate";
import { MysqlCmsRepository } from "../lib/cms/mysql-repository";
import { MYSQL_SIGNED_INT_MAX } from "../lib/cms/page-revision";
import { SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG } from "../lib/cms/page-paths";
import {
  SUBSCRIPTION_MONEY_BACK_EXACT,
  SUBSCRIPTION_SEO_META_BEFORE,
  SUBSCRIPTION_SEO_TITLE_BEFORE,
  SUBSCRIPTION_SEO_TITLE_AFTER,
} from "../lib/cms/subscription-seo-microcopy";
import { SEO_LONGFORM_HOME_ID } from "../lib/cms/seo-longform";
import { SITE_SETTINGS_KEY } from "../lib/cms/mysql-migrate";
import { defaultSettings } from "../lib/cms/defaults";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { getDbPool } from "../lib/db/pool";
import type { CmsSection, SiteSettings } from "../lib/cms/types";
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
const IS_MARIADB =
  DISPOSABLE_ENGINE === "mariadb" ||
  String(process.env.CMS_CONCURRENCY_ENGINE || "").toLowerCase() === "mariadb";

function assertDisposableTarget() {
  const gate = validateDisposableMysqlTarget(process.env);
  if (!gate.ok) throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
  assert.equal(gate.port, APPROVED_PORT);
  assert.equal(gate.database, APPROVED_DB_NAME);
}

async function q<T extends RowDataPacket[]>(sql: string, params: Array<string | number | boolean | null> = []) {
  const [rows] = await getDbPool().query<T>(sql, params);
  return rows;
}

async function exec(sql: string, params: Array<string | number | boolean | null> = []) {
  await getDbPool().execute(sql, params);
}

async function rawQuery(sql: string) {
  await getDbPool().query(sql);
}

async function flagPresent(key: string): Promise<boolean> {
  const rows = await q<Array<RowDataPacket & { n: number }>>(
    "SELECT COUNT(*) AS n FROM site_settings WHERE setting_key = ?",
    [key],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function deleteFlag(key: string) {
  await exec("DELETE FROM site_settings WHERE setting_key = ?", [key]);
}

async function revisionOf(pageId: string): Promise<number> {
  const rows = await q<Array<RowDataPacket & { content_revision: number }>>(
    "SELECT content_revision FROM pages WHERE id = ? LIMIT 1",
    [pageId],
  );
  return Number(rows[0]?.content_revision ?? 0);
}

/** Ensure schema exists, then wipe CMS rows for a fresh unflagged fixture. */
async function resetCmsData() {
  await ensureCmsSchemaCurrent();
  await ensureOwnershipRowPresent();
  const ownership = await proveOwnedDisposableMysql();
  if (!ownership.ok) {
    throw new Error(`REAL_MYSQL_OWNERSHIP_BLOCKED: ${ownership.reason}`);
  }
  await rawOwnedDestructive(ownership, "SET FOREIGN_KEY_CHECKS=0");
  for (const table of [
    "seo_opportunity_decisions",
    "seo_research_runs",
    "seo_planning_drafts",
    "page_sections",
    "pages",
    "redirects",
    "faqs",
    "site_settings",
    "media_assets",
  ]) {
    // Never wipe the ownership marker table.
    assert.notEqual(table, OWNERSHIP_TABLE);
    await execOwnedDestructive(ownership, `DELETE FROM \`${table}\``);
  }
  await rawOwnedDestructive(ownership, "SET FOREIGN_KEY_CHECKS=1");
  // Ownership row must still be present after fixture wipe.
  const stillOwned = await proveOwnedDisposableMysql();
  if (!stillOwned.ok) {
    throw new Error(`REAL_MYSQL_OWNERSHIP_BLOCKED after wipe: ${stillOwned.reason}`);
  }
}

function settingsWithLegacySubscriptionSeo(): SiteSettings {
  const base = defaultSettings();
  return {
    ...base,
    pageSeo: {
      ...base.pageSeo,
      subscriptions: {
        ...base.pageSeo.subscriptions,
        title: SUBSCRIPTION_SEO_TITLE_BEFORE,
        description: SUBSCRIPTION_SEO_META_BEFORE,
        ogTitle: SUBSCRIPTION_SEO_TITLE_BEFORE,
        ogDescription: SUBSCRIPTION_SEO_META_BEFORE,
      },
    },
  };
}

/**
 * Representative CMS state that MUST trigger longform + subscription microcopy on unflagged ready().
 * No completed-migration flags.
 */
async function installUnflaggedColdStartFixture() {
  await resetCmsData();

  const settings = settingsWithLegacySubscriptionSeo();
  await exec(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)`,
    [SITE_SETTINGS_KEY, JSON.stringify(settings)],
  );

  // Ledger representative row (survivability).
  await exec(
    `INSERT INTO seo_research_runs
      (id, created_at, completed_at, research_ok, pipeline_run_status, opportunity_count, durability_status)
     VALUES ('seorun_e1_keep', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1, 'ok', 0, 'COMPLETE')`,
  );

  // Redirects left empty so seedManagedRedirectsIfNeeded can install managed rules without PK clash.

  // Home: placeholder rich-content (order 0) — sanitize reindexes; longform must fill it.
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'Home', '/', 'published', 1, 1)`,
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES (?, 'page-home', 'rich-content', 'Long Description', 0, 1, ?)`,
    [
      SEO_LONGFORM_HOME_ID,
      JSON.stringify({
        eyebrow: "",
        heading: "",
        html: "add your content here",
        buttonLabel: "",
        buttonHref: "/",
      }),
    ],
  );

  // Subscription: money-back exact phrase + placeholder longform id.
  const [moneyFrom] = SUBSCRIPTION_MONEY_BACK_EXACT[0]!;
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES (?, 'IPTV Subscription', ?, 'published', 1, 1)`,
    [SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG],
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-sub-money', ?, 'rich-text', 'Guarantee', 0, 1, ?)`,
    [SUBSCRIPTION_PAGE_ID, JSON.stringify({ html: `<p>${moneyFrom}</p>` })],
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-sub-seo-longform', ?, 'rich-content', 'Long Description', 1, 1, ?)`,
    [
      SUBSCRIPTION_PAGE_ID,
      JSON.stringify({
        eyebrow: "",
        heading: "",
        html: "write a longer description, comparison, or seo article block here",
        buttonLabel: "",
        buttonHref: "/",
      }),
    ],
  );

  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-contact', 'Contact', '/contact/', 'published', 1, 4)`,
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-contact-1', 'page-contact', 'rich-text', 'Body', 0, 1, ?)`,
    [JSON.stringify({ html: "<p>Contact us on WhatsApp.</p>" })],
  );

  // Prove flags absent.
  for (const key of [CMS_CONTENT_CLEANUP_V1, SUBSCRIPTION_SEO_MICROCOPY_V1, SUBSCRIPTION_SEO_MICROCOPY_V2, TEST_TAGLINE_CLEANUP_V1]) {
    assert.equal(await flagPresent(key), false, `flag ${key} must be absent`);
  }
}

test(
  IS_MARIADB
    ? "Gate C / M01 identity for E1 workspace (MariaDB 11.8.9)"
    : "Gate C identity for E1 workspace",
  async () => {
  assertDisposableTarget();
  const rows = await q<
    Array<RowDataPacket & { version: string; db: string; port: number; bind_address: string }>
  >("SELECT VERSION() AS version, DATABASE() AS db, @@port AS port, @@bind_address AS bind_address");
  if (IS_MARIADB) {
    assert.match(String(rows[0]!.version), /^11\.8\.9-MariaDB\b/i);
    assert.equal(Number(rows[0]!.port), 3312);
  } else {
    assert.match(String(rows[0]!.version), /^8\.0\.46/);
    assert.equal(Number(rows[0]!.port), 3307);
  }
  assert.equal(rows[0]!.db, APPROVED_DB_NAME);
  assert.equal(String(rows[0]!.bind_address), "127.0.0.1");
});

test("E1-01/02/03 + Gate F — unflagged MysqlCmsRepository.ready() cold start", async () => {
  assertDisposableTarget();
  await installUnflaggedColdStartFixture();

  const homeBefore = await revisionOf("page-home");
  const subBefore = await revisionOf(SUBSCRIPTION_PAGE_ID);
  const contactBefore = await revisionOf("page-contact");
  assert.equal(homeBefore, 1);
  assert.equal(subBefore, 1);
  assert.equal(contactBefore, 4);

  const repo = new MysqlCmsRepository();
  await repo.ready();

  assert.equal(await flagPresent(CMS_CONTENT_CLEANUP_V1), true);
  assert.equal(await flagPresent(SUBSCRIPTION_SEO_MICROCOPY_V1), true);
  assert.equal(await schemaVersion(), String(CURRENT_CMS_SCHEMA_VERSION));

  const homeAfter = await revisionOf("page-home");
  const subAfter = await revisionOf(SUBSCRIPTION_PAGE_ID);
  const contactAfter = await revisionOf("page-contact");
  assert.ok(homeAfter > homeBefore, `home revision should advance (was ${homeBefore}, now ${homeAfter})`);
  assert.ok(subAfter > subBefore, `subscription revision should advance (was ${subBefore}, now ${subAfter})`);
  // Contact typically no longform change → revision preserved.
  assert.equal(contactAfter, contactBefore);

  const homeHtml = await q<Array<RowDataPacket & { section_data: string }>>(
    "SELECT section_data FROM page_sections WHERE page_id = 'page-home' AND id = ?",
    [SEO_LONGFORM_HOME_ID],
  );
  assert.match(String(homeHtml[0]?.section_data || ""), /British households|UK streaming/i);

  const moneyRows = await q<Array<RowDataPacket & { section_data: string }>>(
    "SELECT section_data FROM page_sections WHERE id = 'sec-sub-money'",
  );
  assert.match(String(moneyRows[0]?.section_data || ""), /eligible 1 Year/i);

  const settingsRows = await q<Array<RowDataPacket & { setting_value: string }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ?",
    [SITE_SETTINGS_KEY],
  );
  const settings = JSON.parse(String(settingsRows[0]!.setting_value)) as SiteSettings;
  assert.equal(settings.pageSeo.subscriptions.title, SUBSCRIPTION_SEO_TITLE_AFTER);

  const ledger = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM seo_research_runs WHERE id = 'seorun_e1_keep'",
  );
  assert.equal(ledger.length, 1);

  const redirect = await q<Array<RowDataPacket & { destination_path: string }>>(
    "SELECT destination_path FROM redirects WHERE source_path = '/iptv-subscriptions-uk/' LIMIT 1",
  );
  assert.ok(redirect.length >= 1, "managed legacy subscription redirect should exist after ready()");
  assert.equal(redirect[0]?.destination_path, SUBSCRIPTION_SLUG);

  // Same-instance second ready() remains harmless (cached readyPromise) — not sufficient alone.
  const homeMid = await revisionOf("page-home");
  const subMid = await revisionOf(SUBSCRIPTION_PAGE_ID);
  await repo.ready();
  assert.equal(await revisionOf("page-home"), homeMid);
  assert.equal(await revisionOf(SUBSCRIPTION_PAGE_ID), subMid);
});

/**
 * Finding B — Fresh MysqlCmsRepository instance against an already-migrated DB.
 * Documents: same process pool may be reused; readyPromise is per-instance.
 */
test("Finding B — fresh MysqlCmsRepository instance ready() is idempotent", async () => {
  assertDisposableTarget();
  await installUnflaggedColdStartFixture();

  for (const key of [CMS_CONTENT_CLEANUP_V1, SUBSCRIPTION_SEO_MICROCOPY_V1, SUBSCRIPTION_SEO_MICROCOPY_V2]) {
    assert.equal(await flagPresent(key), false, `flag ${key} must be absent before A`);
  }

  const repoA = new MysqlCmsRepository();
  const repoBProbe = new MysqlCmsRepository();
  assert.notEqual(repoA, repoBProbe, "A and B must be distinct object instances");

  await repoA.ready();
  assert.equal(await flagPresent(CMS_CONTENT_CLEANUP_V1), true);
  assert.equal(await flagPresent(SUBSCRIPTION_SEO_MICROCOPY_V1), true);

  const homeRev = await revisionOf("page-home");
  const subRev = await revisionOf(SUBSCRIPTION_PAGE_ID);
  const contactRev = await revisionOf("page-contact");
  const schema = await schemaVersion();

  const sectionSnapshot = await q<
    Array<RowDataPacket & { id: string; page_id: string; section_data: string; sort_order: number }>
  >("SELECT id, page_id, section_data, sort_order FROM page_sections ORDER BY page_id, id");
  const sectionHash = JSON.stringify(
    sectionSnapshot.map((r) => ({
      id: String(r.id),
      page_id: String(r.page_id),
      sort_order: Number(r.sort_order),
      section_data: String(r.section_data),
    })),
  );
  const sectionCount = sectionSnapshot.length;
  assert.ok(homeRev > 1, `homeRev after A=${homeRev}`);
  assert.ok(subRev > 1, `subRev after A=${subRev}`);
  console.log(
    JSON.stringify({
      findingB: "fresh-instance-idempotency",
      repoAReady: true,
      homeRev,
      subRev,
      contactRev,
      schema,
      sectionCount,
    }),
  );

  const repoB = new MysqlCmsRepository();
  assert.notEqual(repoA, repoB);
  await repoB.ready();

  assert.equal(await revisionOf("page-home"), homeRev, "home revision must not advance on B");
  assert.equal(await revisionOf(SUBSCRIPTION_PAGE_ID), subRev, "subscription revision must not advance on B");
  assert.equal(await revisionOf("page-contact"), contactRev);
  assert.equal(await schemaVersion(), schema);
  assert.equal(await flagPresent(CMS_CONTENT_CLEANUP_V1), true);
  assert.equal(await flagPresent(SUBSCRIPTION_SEO_MICROCOPY_V1), true);

  const sectionSnapshotB = await q<
    Array<RowDataPacket & { id: string; page_id: string; section_data: string; sort_order: number }>
  >("SELECT id, page_id, section_data, sort_order FROM page_sections ORDER BY page_id, id");
  assert.equal(sectionSnapshotB.length, sectionCount, "no duplicate sections");
  const sectionHashB = JSON.stringify(
    sectionSnapshotB.map((r) => ({
      id: String(r.id),
      page_id: String(r.page_id),
      sort_order: Number(r.sort_order),
      section_data: String(r.section_data),
    })),
  );
  assert.equal(sectionHashB, sectionHash, "section content must be unchanged");

  const ledger = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM seo_research_runs WHERE id = 'seorun_e1_keep'",
  );
  assert.equal(ledger.length, 1);

  const pages = await repoB.listPages();
  assert.ok(pages.some((p) => p.id === "page-home"));
  console.log(
    JSON.stringify({
      findingB: "fresh-instance-idempotency-after-B",
      homeRev,
      subRev,
      contactRev,
      sectionCount,
      independentProcessRestart: false,
      sameDisposableDatabase: true,
      distinctRepositoryInstances: true,
    }),
  );
});

test("Finding C — ownership gate allows only owned disposable target", async () => {
  assertDisposableTarget();
  await ensureCmsSchemaCurrent();
  await ensureOwnershipRowPresent();
  const ownership = await proveOwnedDisposableMysql();
  assert.equal(ownership.ok, true, ownership.ok ? "" : ownership.reason);
});

async function schemaVersion(): Promise<string | null> {
  const rows = await q<Array<RowDataPacket & { setting_value: unknown }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [CMS_SCHEMA_VERSION_KEY],
  );
  return rows[0] ? String(rows[0].setting_value) : null;
}

test("E1-04 — true stale-write still rejects after live before snapshot", async () => {
  assertDisposableTarget();
  await ensureCmsSchemaCurrent();
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'E1Stale', '/', 'published', 1, 10)
     ON DUPLICATE KEY UPDATE content_revision = 10, name = 'E1Stale'`,
  );
  await exec("DELETE FROM page_sections WHERE page_id = 'page-home'");
  const before: CmsSection[] = [
    {
      id: "sec-e1-stale",
      type: "rich-text",
      label: "Body",
      order: 0,
      visible: true,
      data: { html: "<p>before</p>" } as CmsSection["data"],
    },
  ];
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-e1-stale', 'page-home', 'rich-text', 'Body', 0, 1, ?)`,
    [JSON.stringify({ html: "<p>before</p>" })],
  );

  const repo = new MysqlCmsRepository();
  await repo.savePage({
    id: "page-home",
    name: "AdminWon",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    contentRevision: 10,
    sections: [
      {
        id: "sec-e1-stale",
        type: "rich-text",
        label: "Body",
        order: 0,
        visible: true,
        data: { html: "<p>admin-live</p>" } as CmsSection["data"],
      },
    ],
  });

  await assert.rejects(
    () =>
      __persistPageSectionDiffForTests("page-home", before, [
        {
          id: "sec-e1-stale",
          type: "rich-text",
          label: "Body",
          order: 0,
          visible: true,
          data: { html: "<p>stale-maint</p>" } as CmsSection["data"],
        },
      ]),
    /changed during maintenance write/i,
  );

  const rows = await q<Array<RowDataPacket & { name: string; content_revision: number }>>(
    "SELECT name, content_revision FROM pages WHERE id = 'page-home'",
  );
  assert.equal(rows[0]!.name, "AdminWon");
  assert.equal(Number(rows[0]!.content_revision), 11);
  const sec = await q<Array<RowDataPacket & { section_data: string }>>(
    "SELECT section_data FROM page_sections WHERE id = 'sec-e1-stale'",
  );
  assert.match(String(sec[0]!.section_data), /admin-live/);
});

test("E1-05 — transaction rollback on forced section failure", async () => {
  assertDisposableTarget();
  await ensureCmsSchemaCurrent();
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'RollBase', '/', 'published', 1, 20)
     ON DUPLICATE KEY UPDATE content_revision = 20, name = 'RollBase'`,
  );
  await exec("DELETE FROM page_sections WHERE page_id = 'page-home'");
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-keep', 'page-home', 'rich-text', 'Body', 0, 1, ?)`,
    [JSON.stringify({ html: "<p>keep</p>" })],
  );
  await rawQuery("DROP TRIGGER IF EXISTS trg_e1_rollback_probe");
  await rawQuery(`
    CREATE TRIGGER trg_e1_rollback_probe
    BEFORE INSERT ON page_sections
    FOR EACH ROW
    BEGIN
      IF NEW.id = 'sec-e1-boom' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'e1 forced section failure';
      END IF;
    END
  `);
  await assert.rejects(
    () =>
      __persistPageSectionDiffForTests(
        "page-home",
        [
          {
            id: "sec-keep",
            type: "rich-text",
            label: "Body",
            order: 0,
            visible: true,
            data: { html: "<p>keep</p>" } as CmsSection["data"],
          },
        ],
        [
          {
            id: "sec-e1-boom",
            type: "rich-text",
            label: "Boom",
            order: 0,
            visible: true,
            data: { html: "<p>nope</p>" } as CmsSection["data"],
          },
        ],
      ),
    /e1 forced section failure/i,
  );
  await rawQuery("DROP TRIGGER IF EXISTS trg_e1_rollback_probe");
  assert.equal(await revisionOf("page-home"), 20);
  const rows = await q<Array<RowDataPacket & { name: string }>>("SELECT name FROM pages WHERE id = 'page-home'");
  assert.equal(rows[0]!.name, "RollBase");
  const secs = await q<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM page_sections WHERE page_id = 'page-home'",
  );
  assert.equal(secs.length, 1);
  assert.equal(secs[0]!.id, "sec-keep");
});

test("E1-06 — no-op maintenance does not bump revision", async () => {
  assertDisposableTarget();
  await ensureCmsSchemaCurrent();
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'Home', '/', 'published', 1, 30)
     ON DUPLICATE KEY UPDATE content_revision = 30`,
  );
  await exec("DELETE FROM page_sections WHERE page_id = 'page-home'");
  const sec: CmsSection = {
    id: "sec-noop",
    type: "rich-text",
    label: "Body",
    order: 0,
    visible: true,
    data: { html: "<p>same</p>" } as CmsSection["data"],
  };
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES (?, 'page-home', 'rich-text', 'Body', 0, 1, ?)`,
    [sec.id, JSON.stringify(sec.data)],
  );
  await __persistPageSectionDiffForTests("page-home", [sec], [sec]);
  assert.equal(await revisionOf("page-home"), 30);
});

test("E1-07/08 — failed maintenance does not mark flag; recovers on retry", async () => {
  assertDisposableTarget();
  await resetCmsData();

  // Minimal settings so microcopy isn't deferred; longform-only failure path.
  await exec(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)`,
    [SITE_SETTINGS_KEY, JSON.stringify(defaultSettings())],
  );
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'Home', '/', 'published', 1, 1)`,
  );
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES (?, 'page-home', 'rich-content', 'Long Description', 0, 1, ?)`,
    [
      SEO_LONGFORM_HOME_ID,
      JSON.stringify({
        eyebrow: "",
        heading: "",
        html: "add your content here",
        buttonLabel: "",
        buttonHref: "/",
      }),
    ],
  );

  await deleteFlag(CMS_CONTENT_CLEANUP_V1);
  assert.equal(await flagPresent(CMS_CONTENT_CLEANUP_V1), false);

  await rawQuery("DROP TRIGGER IF EXISTS trg_e1_flag_probe");
  await rawQuery(`
    CREATE TRIGGER trg_e1_flag_probe
    BEFORE INSERT ON page_sections
    FOR EACH ROW
    BEGIN
      IF NEW.page_id = 'page-home' AND @e1_block_home = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'e1 block home maintenance write';
      END IF;
    END
  `);
  // Also block UPDATEs via forcing INSERT path — longform fill uses ON DUPLICATE UPDATE.
  // Use UPDATE trigger as well.
  await rawQuery("DROP TRIGGER IF EXISTS trg_e1_flag_probe_upd");
  await rawQuery(`
    CREATE TRIGGER trg_e1_flag_probe_upd
    BEFORE UPDATE ON page_sections
    FOR EACH ROW
    BEGIN
      IF NEW.page_id = 'page-home' AND @e1_block_home = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'e1 block home maintenance write';
      END IF;
    END
  `);

  await exec("SET @e1_block_home = 1");
  await assert.rejects(() => seedSeoLongformIfNeeded(), /e1 block home maintenance write/i);
  assert.equal(await flagPresent(CMS_CONTENT_CLEANUP_V1), false);

  await exec("SET @e1_block_home = 0");
  await rawQuery("DROP TRIGGER IF EXISTS trg_e1_flag_probe");
  await rawQuery("DROP TRIGGER IF EXISTS trg_e1_flag_probe_upd");

  await seedSeoLongformIfNeeded();
  assert.equal(await flagPresent(CMS_CONTENT_CLEANUP_V1), true);
  assert.ok((await revisionOf("page-home")) > 1);

  // Microcopy recovery: clear flag, ensure money-back eligible content, run migrate.
  await deleteFlag(SUBSCRIPTION_SEO_MICROCOPY_V1);
  await deleteFlag(SUBSCRIPTION_SEO_MICROCOPY_V2);
  const [moneyFrom, moneyTo] = SUBSCRIPTION_MONEY_BACK_EXACT[0]!;
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES (?, 'IPTV Subscription', ?, 'published', 1, 1)
     ON DUPLICATE KEY UPDATE content_revision = 1, slug = VALUES(slug)`,
    [SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG],
  );
  await exec("DELETE FROM page_sections WHERE page_id = ?", [SUBSCRIPTION_PAGE_ID]);
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-sub-money', ?, 'rich-text', 'Guarantee', 0, 1, ?)`,
    [SUBSCRIPTION_PAGE_ID, JSON.stringify({ html: `<p>${moneyFrom}</p>` })],
  );
  await exec(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SITE_SETTINGS_KEY, JSON.stringify(settingsWithLegacySubscriptionSeo())],
  );
  await migrateSubscriptionSeoMicrocopyIfNeeded();
  assert.equal(await flagPresent(SUBSCRIPTION_SEO_MICROCOPY_V1), true);
  const money = await q<Array<RowDataPacket & { section_data: string }>>(
    "SELECT section_data FROM page_sections WHERE id = 'sec-sub-money'",
  );
  assert.match(String(money[0]!.section_data), new RegExp(moneyTo.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("E1 INT bound still enforced", async () => {
  assertDisposableTarget();
  await ensureCmsSchemaCurrent();
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page-home', 'Home', '/', 'published', 1, ?)
     ON DUPLICATE KEY UPDATE content_revision = VALUES(content_revision)`,
    [MYSQL_SIGNED_INT_MAX],
  );
  await exec("DELETE FROM page_sections WHERE page_id = 'page-home'");
  await exec(
    `INSERT INTO page_sections (id, page_id, section_type, label, sort_order, visible, section_data)
     VALUES ('sec-max', 'page-home', 'rich-text', 'Body', 0, 1, ?)`,
    [JSON.stringify({ html: "<p>x</p>" })],
  );
  await assert.rejects(
    () =>
      __persistPageSectionDiffForTests(
        "page-home",
        [
          {
            id: "sec-max",
            type: "rich-text",
            label: "Body",
            order: 0,
            visible: true,
            data: { html: "<p>x</p>" } as CmsSection["data"],
          },
        ],
        [
          {
            id: "sec-max",
            type: "rich-text",
            label: "Body",
            order: 0,
            visible: true,
            data: { html: "<p>y</p>" } as CmsSection["data"],
          },
        ],
      ),
    /overflow/i,
  );
});

test("ZZZ — close pool", async () => {
  try {
    await getDbPool().end();
  } catch {
    /* ignore */
  }
});
