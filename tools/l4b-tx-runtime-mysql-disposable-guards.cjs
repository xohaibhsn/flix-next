/**
 * Fail-closed guards for L4B transactional runtime disposable MySQL validation.
 * Uses a NEW disposable database name — never flix_ledger_l1_disposable /
 * flixnext_restore_rehearsal_* / flix_v7_lineage_additive_rc.
 * Never connects by itself.
 */
const APPROVED_DB_NAME = "flix_l4b_tx_runtime_rc";
const APPROVED_PORT = "3310";
const APPROVED_HOSTS = new Set(["127.0.0.1", "localhost"]);
const FORBIDDEN_DB_NAMES = new Set([
  "flix_ledger_l1_disposable",
  "flixnext_restore_rehearsal_20261019",
  "flix_v7_lineage_additive_rc",
]);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function validateL4bTxRuntimeMysqlTarget(env) {
  if (String(env.L4B_TX_RUNTIME_MYSQL_VALIDATION || "") !== "1") {
    return { ok: false, reason: "L4B_TX_RUNTIME_MYSQL_VALIDATION opt-in missing" };
  }

  const host = String(env.DB_HOST || "").trim();
  const port = String(env.DB_PORT || "").trim();
  const database = String(env.DB_NAME || "").trim();
  const user = String(env.DB_USER || "").trim();
  const password = env.DB_PASSWORD;

  if (!host || !port || !database || !user || password == null || password === "") {
    return { ok: false, reason: "incomplete disposable DB credentials" };
  }
  if (!APPROVED_HOSTS.has(host.toLowerCase())) {
    return { ok: false, reason: "host must be loopback (127.0.0.1 or localhost)" };
  }
  if (/hostinger|amazonaws|rds\.|planetscale|railway|aiven|neon\.|theflix|production/i.test(host)) {
    return { ok: false, reason: "host resembles a remote/production endpoint" };
  }
  if (port !== APPROVED_PORT) {
    return { ok: false, reason: `port must be exactly ${APPROVED_PORT}` };
  }
  if (port === "3306") {
    return { ok: false, reason: "refusing default MySQL port 3306" };
  }
  if (FORBIDDEN_DB_NAMES.has(database)) {
    return { ok: false, reason: `refusing protected/forbidden database name ${database}` };
  }
  if (database !== APPROVED_DB_NAME) {
    return { ok: false, reason: `database must be exactly ${APPROVED_DB_NAME}` };
  }

  return {
    ok: true,
    host: host.toLowerCase() === "localhost" ? "localhost" : "127.0.0.1",
    port,
    database,
    user,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function clearAmbientDbEnv(env) {
  for (const key of [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DATABASE_URL",
    "MYSQL_URL",
  ]) {
    delete env[key];
  }
}

module.exports = {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  APPROVED_HOSTS,
  FORBIDDEN_DB_NAMES,
  validateL4bTxRuntimeMysqlTarget,
  clearAmbientDbEnv,
};
