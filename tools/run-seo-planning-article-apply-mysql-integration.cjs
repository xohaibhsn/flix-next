/**
 * Launcher for A2 durable Apply REAL disposable-MySQL acceptance.
 *
 * Isolation:
 * - Explicit loopback 127.0.0.1:3310 only (local mysqld under ~/.flix-mysql-disposable).
 * - Dedicated database flix_a2_apply_acceptance_disposable (created if missing).
 * - Never inherits ambient/production DB_* / DATABASE_URL.
 * - Never targets u992747032_flixnext or Hostinger hosts.
 * - Does not modify server-wide grants or create users.
 *
 * Usage: node tools/run-seo-planning-article-apply-mysql-integration.cjs
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS launcher */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const mysql = require("mysql2/promise");

const APPROVED_HOST = "127.0.0.1";
const APPROVED_PORT = "3310";
const APPROVED_DB = "flix_a2_apply_acceptance_disposable";
const PRODUCTION_DB = "u992747032_flixnext";
const DISPOSABLE_HOME = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".flix-mysql-disposable",
);

function clearAmbientDbEnv(env) {
  for (const key of [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DATABASE_URL",
    "MYSQL_URL",
    "LEDGER_MYSQL_INTEGRATION",
    "L4B4_MYSQL_INTEGRATION",
    "L4B5_MYSQL_INTEGRATION",
    "L4B6_MYSQL_INTEGRATION",
  ]) {
    delete env[key];
  }
}

function fail(reason, code = 2) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED:", reason);
  process.exit(code);
}

async function ensureIsolatedA2Database() {
  // Local disposable instance root (empty password) — never production.
  // Used only to CREATE DATABASE / identity SELECTs; no grant changes.
  const bootstrap = await mysql.createConnection({
    host: APPROVED_HOST,
    port: Number(APPROVED_PORT),
    user: "root",
    password: "",
    multipleStatements: false,
    connectTimeout: 5000,
  });

  try {
    const [idRows] = await bootstrap.query(
      "SELECT @@port AS port, @@bind_address AS bind_addr, @@version AS ver, @@datadir AS datadir",
    );
    const id = idRows[0];
    if (String(id.port) !== APPROVED_PORT) {
      fail(`unexpected @@port ${id.port}`);
    }
    if (String(id.bind_addr) !== APPROVED_HOST) {
      fail(`unexpected @@bind_address ${id.bind_addr}`);
    }
    if (!String(id.datadir || "").toLowerCase().includes(".flix-mysql-disposable")) {
      fail("datadir is not under ~/.flix-mysql-disposable");
    }
    if (!/^8\.0\.46/.test(String(id.ver))) {
      fail(`unexpected MySQL version ${id.ver}`);
    }

    const [prod] = await bootstrap.query(
      "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
      [PRODUCTION_DB],
    );
    if (prod.length > 0) {
      fail("production schema name is present on this server — refusing");
    }

    const [existing] = await bootstrap.query(
      "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
      [APPROVED_DB],
    );

    if (existing.length === 0) {
      await bootstrap.query(
        `CREATE DATABASE \`${APPROVED_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      console.log(
        JSON.stringify({
          action: "created_database",
          database: APPROVED_DB,
          host: APPROVED_HOST,
          port: APPROVED_PORT,
        }),
      );
    } else {
      const [tables] = await bootstrap.query(
        `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
        [APPROVED_DB],
      );
      const allowed = new Set([
        "admin_users",
        "blog_posts",
        "seo_planning_drafts",
        "seo_ai_article_previews",
        "seo_ai_article_approvals",
        "seo_ai_article_apply_audits",
      ]);
      const unknown = tables.map((t) => String(t.name)).filter((n) => !allowed.has(n));
      if (unknown.length > 0) {
        fail(
          `database ${APPROVED_DB} exists with unknown tables (${unknown.join(",")}); refusing overwrite`,
        );
      }
      console.log(
        JSON.stringify({
          action: "reuse_database",
          database: APPROVED_DB,
          tableCount: tables.length,
          tables: tables.map((t) => t.name),
        }),
      );
    }

    return {
      version: String(id.ver),
      bindAddr: String(id.bind_addr),
      datadir: String(id.datadir),
      disposableHomePresent: fs.existsSync(DISPOSABLE_HOME),
    };
  } finally {
    await bootstrap.end();
  }
}

async function main() {
  clearAmbientDbEnv(process.env);

  if (!fs.existsSync(path.join(DISPOSABLE_HOME, "mysql-8.0.46-winx64", "bin", "mysqld.exe"))) {
    fail("local disposable mysqld binary missing under ~/.flix-mysql-disposable");
  }

  const identity = await ensureIsolatedA2Database();

  process.env.A2_APPLY_MYSQL_INTEGRATION = "1";
  process.env.A2_APPLY_MYSQL_HOST = APPROVED_HOST;
  process.env.A2_APPLY_MYSQL_PORT = APPROVED_PORT;
  process.env.A2_APPLY_MYSQL_DATABASE = APPROVED_DB;
  process.env.A2_APPLY_MYSQL_USER = "root";
  // Empty password is intentional for local disposable root only.
  process.env.A2_APPLY_MYSQL_PASSWORD = "";

  console.log(
    JSON.stringify({
      mode: "a2-apply-real-mysql-integration",
      host: APPROVED_HOST,
      port: APPROVED_PORT,
      database: APPROVED_DB,
      user: "root",
      passwordSet: false,
      localDisposableRoot: true,
      mysqlVersion: identity.version,
      bindAddr: identity.bindAddr,
      optIn: "A2_APPLY_MYSQL_INTEGRATION",
      productionDb: PRODUCTION_DB,
      productionTargeted: false,
    }),
  );

  const result = spawnSync(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      "--require",
      "./tools/stubs/preload-server-only.cjs",
      "--test",
      "tools/seo-planning-article-apply-mysql.integration.ts",
    ],
    {
      stdio: "inherit",
      env: process.env,
      cwd: path.join(__dirname, ".."),
      shell: false,
    },
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
