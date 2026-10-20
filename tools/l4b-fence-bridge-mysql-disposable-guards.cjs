/**
 * Fail-closed guards for L4B fence-bridge disposable MySQL validation.
 * Exact allowlist: flix_l4b_fence_bridge_rc ONLY.
 * Never connects by itself. Never weakens Ledger / L4B TX runtime guards.
 */
const APPROVED_DB_NAME = "flix_l4b_fence_bridge_rc";
const APPROVED_PORT = "3310";
const APPROVED_HOSTS = new Set(["127.0.0.1", "localhost"]);
const FORBIDDEN_DB_NAMES = new Set([
  "flix_ledger_l1_disposable",
  "flix_l4b_tx_runtime_rc",
  "flix_v7_lineage_additive_rc",
  "flixnext_restore_rehearsal_20261019",
  "u992747032_flixnext",
]);

/** Task-owned fixture object names — cleanup may touch only these. */
const OWNED_TABLES = Object.freeze([
  "l4b_fence_bridge_owned",
  "seo_planning_write_fence",
  "seo_planning_drafts",
  "seo_research_runs",
  "seo_opportunity_decisions",
  "seo_planning_decision_links",
  "pages",
]);

const OWNED_TRIGGERS = Object.freeze([
  "trg_l4b_fence_planning_ins",
  "trg_l4b_fence_planning_del",
  "trg_l4b_fence_planning_upd",
]);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function validateL4bFenceBridgeMysqlTarget(env) {
  if (String(env.L4B_FENCE_BRIDGE_MYSQL_VALIDATION || "") !== "1") {
    return { ok: false, reason: "L4B_FENCE_BRIDGE_MYSQL_VALIDATION opt-in missing" };
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
  OWNED_TABLES,
  OWNED_TRIGGERS,
  validateL4bFenceBridgeMysqlTarget,
  clearAmbientDbEnv,
};
