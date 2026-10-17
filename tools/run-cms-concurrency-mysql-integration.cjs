/**
 * Launcher for CMS Concurrency Phase 1 real-MySQL integration (T01–T14).
 * Loads disposable credentials from the CONCURRENCY-10 workspace test.env path
 * passed as argv[2], or CMS_CONCURRENCY_MYSQL_ENV_FILE.
 * Fail-closed: refuses non-approved localhost targets. Never loads site .env.
 *
 * Usage:
 *   node tools/run-cms-concurrency-mysql-integration.cjs <absolute-path-to-test.env>
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS launcher */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  OWNERSHIP_DATADIR_ENV,
  OWNERSHIP_MARKER_ENV,
  OWNERSHIP_WORKSPACE_ENV,
  clearAmbientDbEnv,
  validateDisposableMysqlTarget,
} = require("./cms-concurrency-mysql-disposable-guards.cjs");

const envFile =
  process.argv[2] ||
  process.env.CMS_CONCURRENCY_MYSQL_ENV_FILE ||
  "";

if (!envFile || !path.isAbsolute(envFile) || !fs.existsSync(envFile)) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED: missing absolute disposable test.env path");
  process.exit(2);
}

// Refuse loading anything under Git worktrees as a credential source.
const normalized = envFile.replace(/\\/g, "/").toLowerCase();
if (
  normalized.includes("/flix-next/") ||
  normalized.includes("/flix-next-cms-concurrency-phase1/") ||
  normalized.includes("/flix-next-l4a-dev/") ||
  normalized.includes("/.env")
) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED: refusing credential file inside Git worktree or named .env");
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
  if (
    /^DB_(HOST|PORT|NAME|USER|PASSWORD)$/.test(key) ||
    key === OWNERSHIP_MARKER_ENV ||
    key === OWNERSHIP_DATADIR_ENV ||
    key === OWNERSHIP_WORKSPACE_ENV ||
    key === "CMS_CONCURRENCY_ENGINE"
  ) {
    process.env[key] = value;
  }
}

process.env.CMS_CONCURRENCY_MYSQL_INTEGRATION = "1";
process.env.CMS_CONCURRENCY_ENGINE = process.env.CMS_CONCURRENCY_ENGINE || "mysql";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const gate = validateDisposableMysqlTarget(process.env);
if (!gate.ok) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED:", gate.reason);
  process.exit(2);
}

if (
  !process.env[OWNERSHIP_MARKER_ENV] ||
  !process.env[OWNERSHIP_DATADIR_ENV] ||
  !process.env[OWNERSHIP_WORKSPACE_ENV]
) {
  console.error(
    "REAL_MYSQL_OWNERSHIP_BLOCKED: missing ownership marker/datadir/workspace in disposable test.env",
  );
  process.exit(2);
}

console.log(
  JSON.stringify({
    mode: "cms-concurrency-real-mysql-integration",
    host: gate.host,
    port: gate.port,
    database: gate.database,
    user: gate.user,
    passwordSet: true,
    approvedDbName: APPROVED_DB_NAME,
    approvedPort: APPROVED_PORT,
    ownershipWorkspaceSet: true,
    ownershipDatadirSet: true,
    ownershipMarkerSet: true,
  }),
);

// Default: Phase 1 CAS suite. Set CMS_CONCURRENCY_MYSQL_TEST_FILE for E1 cold-start suite
// (run separately so getDbPool().end() in one suite cannot starve the other).
const testFile =
  process.env.CMS_CONCURRENCY_MYSQL_TEST_FILE ||
  "tools/cms-concurrency-phase1-mysql.integration.ts";

const result = spawnSync(
  process.execPath,
  [
    require.resolve("tsx/cli"),
    "--require",
    "./tools/stubs/preload-server-only.cjs",
    "--test",
    "--test-force-exit",
    testFile,
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
