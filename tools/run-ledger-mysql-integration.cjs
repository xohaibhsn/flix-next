/**
 * Launcher for Experiment Ledger L1 real-MySQL integration tests.
 * Loads disposable credentials from outside the repo (never committed).
 * Fail-closed: refuses non-loopback / non-approved disposable targets.
 * Usage: node tools/run-ledger-mysql-integration.cjs
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS launcher */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  clearAmbientDbEnv,
  validateDisposableMysqlTarget,
} = require("./ledger-mysql-disposable-guards.cjs");

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

// Never inherit ambient/production DB credentials from the parent shell.
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

process.env.LEDGER_MYSQL_INTEGRATION = "1";

const gate = validateDisposableMysqlTarget(process.env);
if (!gate.ok) {
  console.error("REAL_MYSQL_VALIDATION_BLOCKED:", gate.reason);
  process.exit(2);
}

console.log(
  JSON.stringify({
    mode: "real-mysql-integration",
    host: gate.host,
    port: gate.port,
    database: gate.database,
    user: gate.user,
    passwordSet: true,
    approvedDbName: APPROVED_DB_NAME,
    approvedPort: APPROVED_PORT,
  }),
);

const result = spawnSync(
  process.execPath,
  [
    require.resolve("tsx/cli"),
    "--require",
    "./tools/stubs/preload-server-only.cjs",
    "--test",
    "tools/seo-experiment-ledger-mysql.integration.ts",
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
