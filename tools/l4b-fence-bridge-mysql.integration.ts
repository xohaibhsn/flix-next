/**
 * FLIX-L4B-FENCE-BRIDGE-02 — Dedicated disposable MySQL validation.
 * Database: flix_l4b_fence_bridge_rc ONLY.
 * No wipeAllTables / no wildcard drops. Owned fixtures only.
 * Filename avoids `*.test.ts` so npm test never auto-runs mutations.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  armPlanningWriteFence,
  disarmPlanningWriteFence,
} from "../lib/cms/seo-planning-lineage/planning-write-fence-arm";
import {
  createFencedPlanningWriteTransactionFn,
  isPlanningFenceError,
  readPlanningWriteFenceAuth,
  withFencedPlanningWriteTransaction,
} from "../lib/cms/seo-planning-lineage/planning-write-fence-auth";
import {
  L4B_FENCE_ERROR_CODES,
  SEO_PLANNING_WRITE_FENCE_DELETE_TRIGGER_SQL,
  SEO_PLANNING_WRITE_FENCE_INSERT_TRIGGER_SQL,
  SEO_PLANNING_WRITE_FENCE_TABLE_DDL,
} from "../lib/cms/seo-planning-lineage/planning-write-fence-ddl";
import { getDbPool } from "../lib/db/pool";

const require = createRequire(import.meta.url);
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  OWNED_TABLES,
  OWNED_TRIGGERS,
  validateL4bFenceBridgeMysqlTarget,
} = require("./l4b-fence-bridge-mysql-disposable-guards.cjs") as {
  APPROVED_DB_NAME: string;
  APPROVED_PORT: string;
  OWNED_TABLES: readonly string[];
  OWNED_TRIGGERS: readonly string[];
  validateL4bFenceBridgeMysqlTarget: (env: NodeJS.ProcessEnv) =>
    | { ok: true; host: string; port: string; database: string; user: string }
    | { ok: false; reason: string };
};
const {
  PRIVILEGED_IDENTITY_SQL,
  buildPrivilegedMysqlCliArgs,
  parsePrivilegedCliIdentity,
  validatePrivilegedCliIdentity,
} = require("./l4b-fence-bridge-mysql-cli-pin.cjs") as {
  PRIVILEGED_IDENTITY_SQL: string;
  buildPrivilegedMysqlCliArgs: (opts: {
    defaultsFile: string;
  }) =>
    | { ok: true; args: string[]; host: string; port: string; database: string }
    | { ok: false; reason: string };
  parsePrivilegedCliIdentity: (stdout: string) =>
    | { ok: true; database: string; port: string; bindAddress: string; version: string }
    | { ok: false; reason: string };
  validatePrivilegedCliIdentity: (identity: {
    database: string;
    port: string;
    bindAddress: string;
    version: string;
  }) => { ok: true } | { ok: false; reason: string };
};

const FENCE_TOKEN = "fence_bridge_token_v1";
const STALE_TOKEN = "stale_wrong_token_xx";

type SqlParam = string | number | boolean | null | Date | Buffer;

function assertDisposableTarget() {
  if (String(process.env.L4B_FENCE_BRIDGE_MYSQL_VALIDATION || "") !== "1") {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: L4B_FENCE_BRIDGE_MYSQL_VALIDATION missing");
  }
  const gate = validateL4bFenceBridgeMysqlTarget(process.env);
  if (!gate.ok) throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${gate.reason}`);
  if (process.env.DB_NAME !== APPROVED_DB_NAME) {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: DB_NAME drifted from approved fence-bridge DB");
  }
}

async function q<T extends RowDataPacket[]>(sql: string, params: SqlParam[] = []) {
  const [rows] = await getDbPool().query<T>(sql, params);
  return rows;
}

async function exec(sql: string, params: SqlParam[] = []) {
  await getDbPool().execute(sql, params);
}

function sanitizeCliError(text: string): string {
  return String(text || "")
    .replace(/password\s*[:=]\s*\S+/gi, "password=[REDACTED]")
    .replace(/pwd\s*[:=]\s*\S+/gi, "pwd=[REDACTED]")
    .slice(0, 400);
}

function runPrivilegedMysqlCli(args: string[], input: string) {
  const base = path.join(process.env.USERPROFILE || "", ".flix-mysql-disposable");
  const mysqlBin = path.join(base, "mysql-8.0.46-winx64", "bin", "mysql.exe");
  if (!fs.existsSync(mysqlBin)) {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: disposable mysql.exe missing");
  }
  const result = spawnSync(mysqlBin, args, {
    input,
    encoding: "utf8",
    windowsHide: true,
  });
  return result;
}

function assertPrivilegedCliTarget() {
  assertDisposableTarget();
  const base = path.join(process.env.USERPROFILE || "", ".flix-mysql-disposable");
  const ini = path.join(base, "my.ini");
  const built = buildPrivilegedMysqlCliArgs({ defaultsFile: ini });
  if (!built.ok) {
    throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${built.reason}`);
  }

  const identity = runPrivilegedMysqlCli(
    [...built.args, "-N", "-B", "-e", PRIVILEGED_IDENTITY_SQL],
    "",
  );
  if (identity.status !== 0) {
    throw new Error(
      `REAL_MYSQL_VALIDATION_BLOCKED: privileged CLI identity query failed: ${sanitizeCliError(
        identity.stderr || identity.stdout || "",
      )}`,
    );
  }
  const parsed = parsePrivilegedCliIdentity(identity.stdout || "");
  if (!parsed.ok) {
    throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${parsed.reason}`);
  }
  const validated = validatePrivilegedCliIdentity(parsed);
  if (!validated.ok) {
    throw new Error(`REAL_MYSQL_VALIDATION_BLOCKED: ${validated.reason}`);
  }
  return built;
}

function runRootSql(sql: string) {
  const built = assertPrivilegedCliTarget();
  const base = path.join(process.env.USERPROFILE || "", ".flix-mysql-disposable");
  const sqlFile = path.join(base, "tmp-l4b-fence-bridge-trigger.sql");
  // Database already selected via CLI argv; keep USE as defense-in-depth.
  fs.writeFileSync(sqlFile, `USE \`${APPROVED_DB_NAME}\`;\n${sql}\n`, "utf8");
  const result = runPrivilegedMysqlCli(built.args, fs.readFileSync(sqlFile, "utf8"));
  if (result.status !== 0) {
    throw new Error(`root SQL failed: ${sanitizeCliError(result.stderr || result.stdout || "")}`);
  }
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

async function registerOwned(objectName: string, objectKind: "TABLE" | "TRIGGER") {
  await exec(
    `INSERT INTO l4b_fence_bridge_owned (object_name, object_kind, created_at)
     VALUES (?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)`,
    [objectName, objectKind],
  );
}

async function createOwnedFixtures() {
  await exec(`
CREATE TABLE l4b_fence_bridge_owned (
  object_name VARCHAR(128) NOT NULL,
  object_kind ENUM('TABLE','TRIGGER') NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (object_name, object_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await registerOwned("l4b_fence_bridge_owned", "TABLE");

  await exec(`
CREATE TABLE seo_planning_drafts (
  id VARCHAR(80) NOT NULL,
  recommendation VARCHAR(40) NOT NULL,
  workflow_status VARCHAR(40) NOT NULL,
  fingerprint VARCHAR(320) NOT NULL,
  topic VARCHAR(320) NOT NULL,
  working_title VARCHAR(320) NOT NULL,
  proposed_slug VARCHAR(200) NULL,
  payload JSON NOT NULL,
  archived_at DATETIME NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY seo_planning_drafts_fingerprint_unique (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await registerOwned("seo_planning_drafts", "TABLE");

  await exec(`
CREATE TABLE seo_research_runs (
  id VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await registerOwned("seo_research_runs", "TABLE");

  await exec(`
CREATE TABLE seo_opportunity_decisions (
  id VARCHAR(80) NOT NULL,
  run_id VARCHAR(80) NOT NULL,
  opportunity_index INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY seo_opportunity_decisions_run_index (run_id, opportunity_index),
  CONSTRAINT seo_opportunity_decisions_run_fk
    FOREIGN KEY (run_id) REFERENCES seo_research_runs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await registerOwned("seo_opportunity_decisions", "TABLE");

  await exec(`
CREATE TABLE seo_planning_decision_links (
  id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  decision_id VARCHAR(80) NOT NULL,
  linked_by_admin_id VARCHAR(80) NOT NULL,
  linked_at DATETIME NOT NULL,
  selection_marker VARCHAR(40) NOT NULL DEFAULT 'server_research_binding',
  PRIMARY KEY (id),
  UNIQUE KEY seo_planning_decision_links_draft_unique (planning_draft_id),
  UNIQUE KEY seo_planning_decision_links_decision_unique (decision_id),
  CONSTRAINT seo_planning_decision_links_draft_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_planning_decision_links_decision_fk
    FOREIGN KEY (decision_id) REFERENCES seo_opportunity_decisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await registerOwned("seo_planning_decision_links", "TABLE");

  await exec(`
CREATE TABLE pages (
  id VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  status VARCHAR(40) NOT NULL,
  cms_enabled TINYINT NOT NULL DEFAULT 1,
  content_revision INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY pages_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await registerOwned("pages", "TABLE");

  await exec(SEO_PLANNING_WRITE_FENCE_TABLE_DDL);
  await registerOwned("seo_planning_write_fence", "TABLE");
  await exec(
    `INSERT INTO seo_planning_write_fence (id, fence_active, expected_token, note)
     VALUES (1, 0, ?, 'l4b-fence-bridge-inactive')`,
    [Buffer.from(FENCE_TOKEN, "utf8")],
  );

  runRootSql(`DROP TRIGGER IF EXISTS trg_l4b_fence_planning_ins;`);
  runRootSql(`DROP TRIGGER IF EXISTS trg_l4b_fence_planning_del;`);
  runRootSql(`
DELIMITER //
${SEO_PLANNING_WRITE_FENCE_INSERT_TRIGGER_SQL}//
DELIMITER ;
`);
  runRootSql(`
DELIMITER //
${SEO_PLANNING_WRITE_FENCE_DELETE_TRIGGER_SQL}//
DELIMITER ;
`);
  await registerOwned("trg_l4b_fence_planning_ins", "TRIGGER");
  await registerOwned("trg_l4b_fence_planning_del", "TRIGGER");
}

async function insertPlanning(
  conn: PoolConnection | ReturnType<typeof getDbPool>,
  args: { id: string; fingerprint: string },
) {
  await conn.execute(
    `INSERT INTO seo_planning_drafts
      (id, recommendation, workflow_status, fingerprint, topic, working_title, proposed_slug, payload)
     VALUES (?, 'NEW_BLOG', 'DRAFT', ?, ?, ?, ?, CAST(? AS JSON))`,
    [
      args.id,
      args.fingerprint,
      `topic-${args.id}`,
      args.id,
      `slug-${args.id}`,
      JSON.stringify({ bridge: true }),
    ],
  );
}

/** Drop only registered owned objects — never enumerate+drop all tables. */
async function cleanupOwnedFixtures() {
  assertDisposableTarget();
  const owned = await q<RowDataPacket[]>(
    `SELECT object_name, object_kind FROM l4b_fence_bridge_owned`,
  ).catch(() => [] as RowDataPacket[]);

  const triggers = owned
    .filter((r) => String(r.object_kind) === "TRIGGER")
    .map((r) => String(r.object_name));
  for (const name of triggers) {
    if (!(OWNED_TRIGGERS as readonly string[]).includes(name)) {
      throw new Error(`Refusing to drop unowned trigger ${name}`);
    }
    runRootSql(`DROP TRIGGER IF EXISTS \`${name}\`;`);
  }

  // FK-safe exact order (not wildcard).
  const dropOrder = [
    "seo_planning_decision_links",
    "seo_opportunity_decisions",
    "seo_research_runs",
    "seo_planning_drafts",
    "pages",
    "seo_planning_write_fence",
    "l4b_fence_bridge_owned",
  ];
  for (const name of dropOrder) {
    if (!(OWNED_TABLES as readonly string[]).includes(name)) {
      throw new Error(`Refusing to drop unowned table ${name}`);
    }
    await exec(`DROP TABLE IF EXISTS \`${name}\``);
  }
}

test("00 — isolation identity + empty owned start", async () => {
  await assertIsolationIdentity();
  const tables = await q<RowDataPacket[]>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  assert.equal(tables.length, 0, "dedicated DB must start empty");
});

test("01 — install owned fixtures + inactive fence allows legacy INSERT", async () => {
  await createOwnedFixtures();
  await insertPlanning(getDbPool(), { id: "plan_off_1", fingerprint: "NEW_BLOG:off-1" });
  const rows = await q<RowDataPacket[]>(
    `SELECT id FROM seo_planning_drafts WHERE id = 'plan_off_1'`,
  );
  assert.equal(rows.length, 1);
});

test("02 — serialized arming vs in-flight legacy INSERT", async () => {
  const pool = getDbPool();
  const legacy = await pool.getConnection();
  let armResult: Awaited<ReturnType<typeof armPlanningWriteFence>> | null = null;

  try {
    await legacy.query(`SET innodb_lock_wait_timeout = 3`);
    await legacy.beginTransaction();
    // Fence still inactive: INSERT succeeds and holds control-row FOR UPDATE via trigger.
    await insertPlanning(legacy, { id: "plan_inflight", fingerprint: "NEW_BLOG:inflight" });

    // Concurrent arm must wait / fail closed while legacy TX open.
    armResult = await armPlanningWriteFence({
      token: FENCE_TOKEN,
      armedBy: "race_test",
      lockWaitSeconds: 2,
      pool,
    });
    assert.equal(armResult.ok, false, "arming must not complete while legacy INSERT TX open");
    assert.equal(armResult.errorCode, "ARM_TIMEOUT");

    await legacy.commit();
  } finally {
    try {
      await legacy.rollback();
    } catch {
      /* already committed */
    }
    legacy.release();
  }

  // After legacy commit, arming must succeed.
  const armed = await armPlanningWriteFence({
    token: FENCE_TOKEN,
    armedBy: "race_test_after",
    lockWaitSeconds: 5,
    pool,
  });
  assert.equal(armed.ok, true, "arming succeeds after in-flight TX commits");

  // New unmarked legacy INSERT rejected.
  await assert.rejects(
    () => insertPlanning(getDbPool(), { id: "plan_legacy_after", fingerprint: "NEW_BLOG:legacy-after" }),
    (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.WRITE_FENCED),
  );
});

test("03 — authorized transactional draft+link; stale/missing markers; fingerprint conflict", async () => {
  await exec(`INSERT INTO seo_research_runs (id, created_at) VALUES ('run_1', UTC_TIMESTAMP())`);
  await exec(
    `INSERT INTO seo_opportunity_decisions (id, run_id, opportunity_index) VALUES ('dec_1', 'run_1', 0)`,
  );

  const fencedTx = createFencedPlanningWriteTransactionFn({
    token: FENCE_TOKEN,
    trustedOperation: "transactional_proceed_link",
  });

  await fencedTx(async (conn) => {
    await insertPlanning(conn, { id: "plan_tx_1", fingerprint: "NEW_BLOG:tx-1" });
    await conn.execute(
      `INSERT INTO seo_planning_decision_links
        (id, planning_draft_id, decision_id, linked_by_admin_id, linked_at, selection_marker)
       VALUES ('link_1', 'plan_tx_1', 'dec_1', 'admin_1', UTC_TIMESTAMP(), 'server_research_binding')`,
    );
  });

  const linked = await q<RowDataPacket[]>(
    `SELECT planning_draft_id FROM seo_planning_decision_links WHERE id = 'link_1'`,
  );
  assert.equal(linked.length, 1);

  await assert.rejects(
    () => insertPlanning(getDbPool(), { id: "plan_missing", fingerprint: "NEW_BLOG:missing" }),
    (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.WRITE_FENCED),
  );

  await assert.rejects(
    () =>
      withFencedPlanningWriteTransaction(
        async (conn) => {
          await insertPlanning(conn, { id: "plan_stale", fingerprint: "NEW_BLOG:stale" });
        },
        { token: STALE_TOKEN, trustedOperation: "fence_bridge_validation" },
      ),
    (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.WRITE_FENCED),
  );

  await assert.rejects(
    () =>
      fencedTx(async (conn) => {
        await insertPlanning(conn, { id: "plan_dup", fingerprint: "NEW_BLOG:tx-1" });
      }),
    (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      return /Duplicate|ER_DUP_ENTRY/i.test(msg);
    },
  );
});

test("04 — session cleanup after success and after rollback; dispose on cleanup failure", async () => {
  const pool = getDbPool();

  // Success path: marker cleared; subsequent unmarked INSERT still fenced.
  await withFencedPlanningWriteTransaction(
    async (conn) => {
      await insertPlanning(conn, { id: "plan_ok_clear", fingerprint: "NEW_BLOG:ok-clear" });
      const mid = await readPlanningWriteFenceAuth(conn);
      assert.equal(mid, FENCE_TOKEN);
    },
    { token: FENCE_TOKEN, trustedOperation: "fence_bridge_validation" },
  );

  const probe = await pool.getConnection();
  try {
    await assert.rejects(
      () => insertPlanning(probe, { id: "plan_after_clear", fingerprint: "NEW_BLOG:after-clear" }),
      (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.WRITE_FENCED),
    );
  } finally {
    probe.release();
  }

  // Rollback path: durable rows gone; marker must still be cleared by helper.
  await exec(
    `INSERT INTO seo_opportunity_decisions (id, run_id, opportunity_index) VALUES ('dec_roll', 'run_1', 1)`,
  );
  await assert.rejects(
    () =>
      withFencedPlanningWriteTransaction(
        async (conn) => {
          await insertPlanning(conn, { id: "plan_roll", fingerprint: "NEW_BLOG:roll" });
          await conn.execute(
            `INSERT INTO seo_planning_decision_links
              (id, planning_draft_id, decision_id, linked_by_admin_id, linked_at)
             VALUES ('link_roll', 'plan_roll', 'dec_roll', 'admin_1', UTC_TIMESTAMP())`,
          );
          throw new Error("forced_rollback");
        },
        { token: FENCE_TOKEN, trustedOperation: "fence_bridge_validation" },
      ),
    /forced_rollback/,
  );
  assert.equal(
    Number(
      (await q<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM seo_planning_drafts WHERE id='plan_roll'`))[0]
        .c,
    ),
    0,
  );

  // Real helper failure-injection: wrap the borrowed connection so CLEAR fails
  // inside withFencedPlanningWriteTransaction (not a manual destroy outside it).
  const realGetConnection = pool.getConnection.bind(pool);
  let injectedDestroy = 0;
  let injectedRelease = 0;
  const wrappingPool = {
    getConnection: async () => {
      const real = await realGetConnection();
      const originalQuery = real.query.bind(real);
      const originalDestroy = (real as PoolConnection & { destroy: () => void }).destroy.bind(real);
      const originalRelease = real.release.bind(real);
      (real as PoolConnection & { query: typeof real.query }).query = (async (
        sql: string,
        params?: SqlParam[],
      ) => {
        if (/SET @flix_l4b_planning_auth = NULL/i.test(String(sql))) {
          throw new Error("injected_clear_failure_inside_helper");
        }
        return originalQuery(sql, params);
      }) as typeof real.query;
      (real as PoolConnection & { destroy: () => void }).destroy = () => {
        injectedDestroy += 1;
        originalDestroy();
      };
      real.release = () => {
        injectedRelease += 1;
        originalRelease();
      };
      return real;
    },
  };

  const clearedValue = await withFencedPlanningWriteTransaction(
    async (conn) => {
      await insertPlanning(conn, {
        id: "plan_clear_inject",
        fingerprint: "NEW_BLOG:clear-inject",
      });
      return "committed";
    },
    {
      token: FENCE_TOKEN,
      trustedOperation: "fence_bridge_validation",
      pool: wrappingPool as unknown as typeof pool,
    },
  );
  assert.equal(clearedValue, "committed");
  assert.equal(injectedDestroy, 1, "helper must destroy on CLEAR failure");
  assert.equal(injectedRelease, 0, "helper must not release unsafe connection");
  assert.equal(
    Number(
      (
        await q<RowDataPacket[]>(
          `SELECT COUNT(*) AS c FROM seo_planning_drafts WHERE id='plan_clear_inject'`,
        )
      )[0].c,
    ),
    1,
    "business commit remains durable after cleanup discard",
  );

  // Fresh connection from pool must not inherit destroyed session auth.
  const fresh = await pool.getConnection();
  try {
    const auth = await readPlanningWriteFenceAuth(fresh);
    assert.equal(auth, null);
    await assert.rejects(
      () => insertPlanning(fresh, { id: "plan_fresh", fingerprint: "NEW_BLOG:fresh" }),
      (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.WRITE_FENCED),
    );
  } finally {
    fresh.release();
  }
});

test("05 — protected delete fence + FK RESTRICT; UPDATE + pages unaffected", async () => {
  // Unmarked DELETE of linked draft: fence rejects (or FK).
  await assert.rejects(
    () => exec(`DELETE FROM seo_planning_drafts WHERE id = 'plan_tx_1'`),
    (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      return (
        isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.DELETE_FENCED) ||
        /1451|ROW_IS_REFERENCED|foreign key/i.test(msg)
      );
    },
  );

  // Authorized DELETE still FK-RESTRICT blocked for linked draft.
  await assert.rejects(
    () =>
      withFencedPlanningWriteTransaction(
        async (conn) => {
          await conn.execute(`DELETE FROM seo_planning_drafts WHERE id = 'plan_tx_1'`);
        },
        { token: FENCE_TOKEN, trustedOperation: "transactional_protected_delete" },
      ),
    (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      return /1451|ROW_IS_REFERENCED|foreign key/i.test(msg);
    },
  );

  // Unlinked draft: fence blocks unmarked delete; auth allows delete.
  await withFencedPlanningWriteTransaction(
    async (conn) => {
      await insertPlanning(conn, { id: "plan_unlinked", fingerprint: "NEW_BLOG:unlinked" });
    },
    { token: FENCE_TOKEN, trustedOperation: "fence_bridge_validation" },
  );
  await assert.rejects(
    () => exec(`DELETE FROM seo_planning_drafts WHERE id = 'plan_unlinked'`),
    (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.DELETE_FENCED),
  );
  await withFencedPlanningWriteTransaction(
    async (conn) => {
      await conn.execute(`DELETE FROM seo_planning_drafts WHERE id = 'plan_unlinked'`);
    },
    { token: FENCE_TOKEN, trustedOperation: "transactional_protected_delete" },
  );

  // UPDATE (no UPDATE trigger): payload edit remains available under INSERT fence.
  await exec(
    `UPDATE seo_planning_drafts SET payload = CAST(? AS JSON), updated_at = UTC_TIMESTAMP()
     WHERE id = 'plan_tx_1'`,
    [JSON.stringify({ bridge: true, edited: true })],
  );
  const updated = await q<RowDataPacket[]>(
    `SELECT payload FROM seo_planning_drafts WHERE id = 'plan_tx_1'`,
  );
  assert.match(JSON.stringify(updated[0].payload), /edited/);

  // Unrelated CMS page write.
  await exec(
    `INSERT INTO pages (id, name, slug, status, cms_enabled, content_revision)
     VALUES ('page_1', 'Home', 'home-fence-bridge', 'published', 1, 1)`,
  );
  assert.equal(
    Number((await q<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM pages WHERE id='page_1'`))[0].c),
    1,
  );
});

test("06 — two authorized writers: uniqueness + idempotent contention", async () => {
  await exec(
    `INSERT INTO seo_opportunity_decisions (id, run_id, opportunity_index) VALUES ('dec_a', 'run_1', 2)`,
  );
  await exec(
    `INSERT INTO seo_opportunity_decisions (id, run_id, opportunity_index) VALUES ('dec_b', 'run_1', 3)`,
  );

  const fencedTx = createFencedPlanningWriteTransactionFn({
    token: FENCE_TOKEN,
    trustedOperation: "transactional_proceed_link",
  });

  const [r1, r2] = await Promise.allSettled([
    fencedTx(async (conn) => {
      await insertPlanning(conn, { id: "plan_w1", fingerprint: "NEW_BLOG:worker-same" });
      await conn.execute(
        `INSERT INTO seo_planning_decision_links
          (id, planning_draft_id, decision_id, linked_by_admin_id, linked_at)
         VALUES ('link_w1', 'plan_w1', 'dec_a', 'admin_1', UTC_TIMESTAMP())`,
      );
    }),
    fencedTx(async (conn) => {
      await insertPlanning(conn, { id: "plan_w2", fingerprint: "NEW_BLOG:worker-same" });
      await conn.execute(
        `INSERT INTO seo_planning_decision_links
          (id, planning_draft_id, decision_id, linked_by_admin_id, linked_at)
         VALUES ('link_w2', 'plan_w2', 'dec_b', 'admin_2', UTC_TIMESTAMP())`,
      );
    }),
  ]);

  const successes = [r1, r2].filter((r) => r.status === "fulfilled").length;
  const failures = [r1, r2].filter((r) => r.status === "rejected").length;
  assert.equal(successes, 1, "exactly one worker commits the shared fingerprint");
  assert.equal(failures, 1, "peer fails on uniqueness");

  const drafts = await q<RowDataPacket[]>(
    `SELECT id FROM seo_planning_drafts WHERE fingerprint = 'NEW_BLOG:worker-same'`,
  );
  assert.equal(drafts.length, 1);

  // Distinct fingerprint + fresh decision succeeds (idempotent peer path).
  await exec(
    `INSERT INTO seo_opportunity_decisions (id, run_id, opportunity_index) VALUES ('dec_c', 'run_1', 4)`,
  );
  await fencedTx(async (conn) => {
    await insertPlanning(conn, { id: "plan_w3", fingerprint: "NEW_BLOG:worker-a" });
    await conn.execute(
      `INSERT INTO seo_planning_decision_links
        (id, planning_draft_id, decision_id, linked_by_admin_id, linked_at)
       VALUES ('link_w3', 'plan_w3', 'dec_c', 'admin_1', UTC_TIMESTAMP())`,
    );
  });
  assert.equal(
    Number(
      (
        await q<RowDataPacket[]>(
          `SELECT COUNT(*) AS c FROM seo_planning_decision_links WHERE id = 'link_w3'`,
        )
      )[0].c,
    ),
    1,
  );
});

test("07 — missing fence metadata fails closed; disarm restores legacy INSERT", async () => {
  await exec(`DELETE FROM seo_planning_write_fence WHERE id = 1`);
  await assert.rejects(
    () =>
      withFencedPlanningWriteTransaction(
        async (conn) => {
          await insertPlanning(conn, { id: "plan_nometa", fingerprint: "NEW_BLOG:nometa" });
        },
        { token: FENCE_TOKEN, trustedOperation: "fence_bridge_validation" },
      ),
    (error: unknown) => isPlanningFenceError(error, L4B_FENCE_ERROR_CODES.METADATA_MISSING),
  );

  await exec(
    `INSERT INTO seo_planning_write_fence (id, fence_active, expected_token, note)
     VALUES (1, 1, ?, 'restored')`,
    [Buffer.from(FENCE_TOKEN, "utf8")],
  );

  const disarmed = await disarmPlanningWriteFence({ token: FENCE_TOKEN });
  assert.equal(disarmed.ok, true);
  await insertPlanning(getDbPool(), {
    id: "plan_after_disarm",
    fingerprint: "NEW_BLOG:after-disarm",
  });
  assert.equal(
    Number(
      (
        await q<RowDataPacket[]>(
          `SELECT COUNT(*) AS c FROM seo_planning_drafts WHERE id='plan_after_disarm'`,
        )
      )[0].c,
    ),
    1,
  );
});

test("99 — cleanup owned fixtures only", async () => {
  try {
    await cleanupOwnedFixtures();
    const tables = await q<RowDataPacket[]>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
    );
    assert.equal(tables.length, 0, "owned cleanup must leave dedicated schema empty");
    const triggers = await q<RowDataPacket[]>(
      `SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA = DATABASE()`,
    );
    assert.equal(triggers.length, 0);
  } finally {
    await getDbPool().end();
  }
});
