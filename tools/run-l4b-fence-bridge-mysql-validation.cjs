/**
 * Launcher: L4B fence-bridge disposable MySQL validation.
 * Creates/uses ONLY flix_l4b_fence_bridge_rc on 127.0.0.1:3310.
 * Never touches flix_ledger_l1_disposable / flix_l4b_tx_runtime_rc / production.
 *
 * Usage: node tools/run-l4b-fence-bridge-mysql-validation.cjs
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS launcher */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const mysql = require("mysql2/promise");
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  OWNED_TABLES,
  clearAmbientDbEnv,
  validateL4bFenceBridgeMysqlTarget,
} = require("./l4b-fence-bridge-mysql-disposable-guards.cjs");

const envFile = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".flix-mysql-disposable",
  "test.env",
);

if (!fs.existsSync(envFile)) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED: missing disposable test.env");
  console.error("Expected:", envFile);
  process.exit(2);
}

clearAmbientDbEnv(process.env);

for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq);
  const value = trimmed.slice(eq + 1);
  if (/^DB_(HOST|PORT|NAME|USER|PASSWORD)$/.test(key)) {
    process.env[key] = value;
  }
}

const testerUser = String(process.env.DB_USER || "").trim();
const testerPassword = process.env.DB_PASSWORD;
if (!testerUser || testerPassword == null || testerPassword === "") {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED: disposable tester credentials incomplete");
  process.exit(2);
}

// Force exact approved database — never inherit ledger disposable name from test.env.
process.env.DB_NAME = APPROVED_DB_NAME;
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = APPROVED_PORT;
process.env.L4B_FENCE_BRIDGE_MYSQL_VALIDATION = "1";
process.env.LEDGER_MYSQL_INTEGRATION = "0";
process.env.L4B_TX_RUNTIME_MYSQL_VALIDATION = "0";
process.env.L4B_LEGACY_FENCE_PROOF = "0";

const gate = validateL4bFenceBridgeMysqlTarget(process.env);
if (!gate.ok) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED:", gate.reason);
  process.exit(2);
}

async function withRootAdmin(fn) {
  const admin = await mysql.createConnection({
    host: "127.0.0.1",
    port: Number(APPROVED_PORT),
    user: "root",
    password: "",
    multipleStatements: false,
  });
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

/**
 * Create dedicated DB only when absent or empty of unknown objects.
 * Never DROP / wipe existing unknown content.
 */
async function ensureDedicatedDatabase() {
  return withRootAdmin(async (admin) => {
    const [identity] = await admin.query(
      `SELECT @@version AS ver, @@port AS port, @@bind_address AS bind_addr, @@hostname AS host`,
    );
    const row = identity[0];
    if (String(row.port) !== APPROVED_PORT) {
      throw new Error(`Unexpected MySQL port ${row.port}`);
    }
    if (String(row.bind_addr) !== "127.0.0.1") {
      throw new Error(`Unexpected bind_address ${row.bind_addr}`);
    }
    if (!String(row.ver).startsWith("8.0.46")) {
      throw new Error(`Unexpected MySQL version ${row.ver}`);
    }

    const [schemas] = await admin.query(
      `SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [APPROVED_DB_NAME],
    );

    let created = false;
    if (!schemas.length) {
      await admin.query(
        `CREATE DATABASE \`${APPROVED_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      created = true;
    } else {
      const [tables] = await admin.query(
        `SELECT TABLE_NAME AS name FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [APPROVED_DB_NAME],
      );
      if (tables.length > 0) {
        const names = tables.map((t) => String(t.name));
        const owned = new Set(OWNED_TABLES);
        const unknown = names.filter((n) => !owned.has(n));
        if (unknown.length > 0) {
          throw new Error(
            `REFUSING: ${APPROVED_DB_NAME} contains unknown tables: ${unknown.join(", ")}`,
          );
        }
        // Owned leftovers from prior incomplete run — refuse wipe; require manual disposition.
        throw new Error(
          `REFUSING: ${APPROVED_DB_NAME} already contains owned fixtures (${names.join(", ")}). ` +
            `Manual empty/dispose required before re-run; no automatic wipe.`,
        );
      }
    }

    await admin.query(`GRANT ALL PRIVILEGES ON \`${APPROVED_DB_NAME}\`.* TO ?@'localhost'`, [
      testerUser,
    ]);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${APPROVED_DB_NAME}\`.* TO ?@'127.0.0.1'`, [
      testerUser,
    ]);
    await admin.query(`FLUSH PRIVILEGES`);

    return {
      created,
      version: String(row.ver),
      port: String(row.port),
      bind: String(row.bind_addr),
      hostname: String(row.host),
    };
  });
}

async function dropDedicatedDatabaseIfEmptyOwned() {
  return withRootAdmin(async (admin) => {
    const [tables] = await admin.query(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [APPROVED_DB_NAME],
    );
    if (tables.length > 0) {
      console.error(
        "WARN: leaving database in place; tables remain:",
        tables.map((t) => t.name).join(", "),
      );
      return { dropped: false, reason: "tables_remain" };
    }
    await admin.query(`DROP DATABASE IF EXISTS \`${APPROVED_DB_NAME}\``);
    return { dropped: true };
  });
}

(async () => {
  let identity;
  try {
    identity = await ensureDedicatedDatabase();
  } catch (error) {
    console.error("REAL_MYSQL_VALIDATION_BLOCKED: dedicated DB gate failed", error);
    process.exit(2);
  }

  console.log(
    JSON.stringify({
      mode: "l4b-fence-bridge-mysql-validation",
      host: gate.host,
      port: gate.port,
      database: gate.database,
      user: gate.user,
      passwordSet: true,
      approvedDbName: APPROVED_DB_NAME,
      mysql: identity,
      node: process.version,
      historicalGate0: "FAIL_ACCEPTED_FORWARD_ONLY_EXCEPTION",
    }),
  );

  const result = spawnSync(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      "--require",
      "./tools/stubs/preload-server-only.cjs",
      "--test",
      "--test-concurrency=1",
      "tools/l4b-fence-bridge-mysql.integration.ts",
    ],
    {
      stdio: "inherit",
      env: process.env,
      cwd: path.join(__dirname, ".."),
      shell: false,
    },
  );

  try {
    const cleanup = await dropDedicatedDatabaseIfEmptyOwned();
    console.log(JSON.stringify({ dedicatedDbCleanup: cleanup }));
  } catch (error) {
    console.error("WARN: dedicated DB cleanup failed", error);
  }

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
})();
