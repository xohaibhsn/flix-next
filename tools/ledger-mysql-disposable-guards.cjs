/**
 * Fail-closed guards for Experiment Ledger L1 disposable MySQL integration.
 * Shared by the launcher and unit tests. Never connects to a database.
 */
/** Exact approved disposable schema identity (name alone is never sufficient). */
const APPROVED_DB_NAME = "flix_ledger_l1_disposable";
const APPROVED_PORT = "3310";
const APPROVED_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{ ok: true, host: string, port: string, database: string, user: string } | { ok: false, reason: string }}
 */
function validateDisposableMysqlTarget(env) {
  if (String(env.LEDGER_MYSQL_INTEGRATION || "") !== "1") {
    return { ok: false, reason: "LEDGER_MYSQL_INTEGRATION opt-in missing" };
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

  // Reject remote / Hostinger-shaped hosts even if somehow aliased.
  if (/hostinger|amazonaws|rds\.|planetscale|railway|aiven|neon\.|theflix|production/i.test(host)) {
    return { ok: false, reason: "host resembles a remote/production endpoint" };
  }

  if (port !== APPROVED_PORT) {
    return { ok: false, reason: `port must be exactly ${APPROVED_PORT}` };
  }

  if (database !== APPROVED_DB_NAME) {
    return { ok: false, reason: `database must be exactly ${APPROVED_DB_NAME}` };
  }

  // Defense in depth: refuse default MySQL port entirely for this harness.
  if (port === "3306") {
    return { ok: false, reason: "refusing default MySQL port 3306" };
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
 * Strip ambient DB_* so production/Hostinger shell credentials cannot leak into the harness.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function clearAmbientDbEnv(env) {
  for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DATABASE_URL", "MYSQL_URL"]) {
    delete env[key];
  }
}

module.exports = {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  APPROVED_HOSTS,
  validateDisposableMysqlTarget,
  clearAmbientDbEnv,
};
