/**
 * Fail-closed guards for CMS Concurrency Phase 1 disposable MySQL integration.
 * Never connects to a database. Never loads production .env.
 *
 * CONCURRENCY-13: ownership contract — env + server identity + workspace/DB markers
 * must agree before destructive fixture SQL is allowed.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS guard module */
const path = require("path");
const fs = require("fs");

const APPROVED_DB_NAME = "flix_cms_concurrency_test";
const APPROVED_PORT = "3307";
const APPROVED_HOSTS = new Set(["127.0.0.1"]);
const OWNERSHIP_MARKER_ENV = "CMS_CONCURRENCY_OWNERSHIP_MARKER";
const OWNERSHIP_DATADIR_ENV = "CMS_CONCURRENCY_MYSQL_DATADIR";
const OWNERSHIP_WORKSPACE_ENV = "CMS_CONCURRENCY_MYSQL_WORKSPACE";
/** Persisted inside the synthetic DB; must not be wiped by fixture reset. */
const OWNERSHIP_TABLE = "cms_concurrency_test_owner";
const OWNERSHIP_MARKER_FILENAME = "ownership.marker";

/**
 * @param {string} value
 */
function normalizeDatadir(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let n = raw.replace(/\\/g, "/");
  // Strip trailing slash except drive root.
  if (n.length > 3 && n.endsWith("/")) n = n.slice(0, -1);
  return n.toLowerCase();
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function validateDisposableMysqlTarget(env) {
  if (String(env.CMS_CONCURRENCY_MYSQL_INTEGRATION || "") !== "1") {
    return { ok: false, reason: "CMS_CONCURRENCY_MYSQL_INTEGRATION opt-in missing" };
  }

  const host = String(env.DB_HOST || "").trim();
  const port = String(env.DB_PORT || "").trim();
  const database = String(env.DB_NAME || "").trim();
  const user = String(env.DB_USER || "").trim();
  const password = env.DB_PASSWORD;

  if (!host || !port || !database || !user || password == null || password === "") {
    return { ok: false, reason: "incomplete disposable DB credentials" };
  }

  if (!APPROVED_HOSTS.has(host)) {
    return { ok: false, reason: "host must be exactly 127.0.0.1" };
  }

  if (/hostinger|amazonaws|rds\.|planetscale|railway|aiven|neon\.|theflix|production/i.test(host)) {
    return { ok: false, reason: "host resembles a remote/production endpoint" };
  }

  if (port !== APPROVED_PORT) {
    return { ok: false, reason: `port must be exactly ${APPROVED_PORT}` };
  }

  if (database !== APPROVED_DB_NAME) {
    return { ok: false, reason: `database must be exactly ${APPROVED_DB_NAME}` };
  }

  if (port === "3306") {
    return { ok: false, reason: "refusing default MySQL port 3306" };
  }

  return { ok: true, host, port, database, user };
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
    OWNERSHIP_MARKER_ENV,
    OWNERSHIP_DATADIR_ENV,
    OWNERSHIP_WORKSPACE_ENV,
  ]) {
    delete env[key];
  }
}

/**
 * @param {string | undefined} marker
 */
function isPlausibleOwnershipMarker(marker) {
  const m = String(marker || "").trim();
  return /^[a-f0-9]{32,64}$/i.test(m);
}

/**
 * Pure ownership + server-identity gate. Does not run SQL.
 * @param {{
 *   env: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   server: {
 *     version?: string,
 *     port?: number | string,
 *     bindAddress?: string,
 *     datadir?: string,
 *     database?: string,
 *   },
 *   workspaceMarker?: string | null,
 *   databaseMarker?: string | null,
 * }} input
 */
function validateOwnedDisposableInstance(input) {
  const envGate = validateDisposableMysqlTarget(input.env);
  if (!envGate.ok) return envGate;

  const expectedDatadir = normalizeDatadir(input.env[OWNERSHIP_DATADIR_ENV]);
  if (!expectedDatadir) {
    return { ok: false, reason: "CMS_CONCURRENCY_MYSQL_DATADIR missing" };
  }

  const workspacePath = String(input.env[OWNERSHIP_WORKSPACE_ENV] || "").trim();
  if (!workspacePath) {
    return { ok: false, reason: "CMS_CONCURRENCY_MYSQL_WORKSPACE missing" };
  }

  // Datadir must live under the declared workspace (no reuse of foreign trees).
  const wsNorm = normalizeDatadir(workspacePath);
  if (!expectedDatadir.startsWith(wsNorm + "/") && expectedDatadir !== wsNorm) {
    return { ok: false, reason: "expected datadir is outside declared workspace" };
  }

  const envMarker = String(input.env[OWNERSHIP_MARKER_ENV] || "").trim();
  if (!isPlausibleOwnershipMarker(envMarker)) {
    return { ok: false, reason: "CMS_CONCURRENCY_OWNERSHIP_MARKER missing or invalid" };
  }

  const version = String(input.server.version || "");
  if (!/^8\.0\.46\b/.test(version)) {
    return { ok: false, reason: "server version must be MySQL 8.0.46" };
  }

  const port = String(input.server.port ?? "");
  if (port !== APPROVED_PORT) {
    return { ok: false, reason: `live server port must be ${APPROVED_PORT}` };
  }

  const bind = String(input.server.bindAddress || "").trim();
  if (bind !== "127.0.0.1") {
    return { ok: false, reason: "bind_address must be 127.0.0.1" };
  }

  const liveDatadir = normalizeDatadir(input.server.datadir);
  if (!liveDatadir) {
    return { ok: false, reason: "@@datadir empty or unavailable" };
  }
  if (liveDatadir !== expectedDatadir) {
    return { ok: false, reason: "@@datadir does not match workspace datadir" };
  }

  const liveDb = String(input.server.database || "").trim();
  if (liveDb !== APPROVED_DB_NAME) {
    return { ok: false, reason: "DATABASE() is not the approved test database" };
  }

  const workspaceMarker = String(input.workspaceMarker || "").trim();
  const databaseMarker = String(input.databaseMarker || "").trim();
  if (!workspaceMarker) {
    return { ok: false, reason: "workspace ownership marker missing" };
  }
  if (!databaseMarker) {
    return { ok: false, reason: "database ownership marker missing" };
  }
  if (workspaceMarker !== envMarker || databaseMarker !== envMarker) {
    return { ok: false, reason: "ownership marker mismatch" };
  }

  return {
    ok: true,
    host: envGate.host,
    port: envGate.port,
    database: envGate.database,
    user: envGate.user,
    datadir: liveDatadir,
    marker: envMarker,
  };
}

/**
 * Read workspace marker file if present.
 * @param {string} workspacePath
 */
function readWorkspaceOwnershipMarker(workspacePath) {
  const file = path.join(workspacePath, OWNERSHIP_MARKER_FILENAME);
  if (!fs.existsSync(file)) return null;
  return String(fs.readFileSync(file, "utf8")).trim();
}

/**
 * SQL used to install the ownership table/row (bootstrap only).
 * @param {string} marker
 */
function ownershipBootstrapStatements(marker) {
  if (!isPlausibleOwnershipMarker(marker)) {
    throw new Error("invalid ownership marker for bootstrap");
  }
  const safe = marker.replace(/[^a-f0-9]/gi, "");
  return [
    `CREATE TABLE IF NOT EXISTS \`${OWNERSHIP_TABLE}\` (
      id TINYINT NOT NULL PRIMARY KEY,
      marker VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,
    `INSERT INTO \`${OWNERSHIP_TABLE}\` (id, marker) VALUES (1, '${safe}')
     ON DUPLICATE KEY UPDATE marker = VALUES(marker)`,
  ];
}

/**
 * @param {string} sql
 * Destructive fixture patterns that must never run without ownership PASS.
 */
function isDestructiveFixtureSql(sql) {
  const s = String(sql);
  if (/SET\s+FOREIGN_KEY_CHECKS\s*=\s*0/i.test(s)) return true;
  if (/^\s*DELETE\s+FROM\s+/i.test(s)) return true;
  if (/^\s*TRUNCATE\s+/i.test(s)) return true;
  if (/^\s*DROP\s+TABLE\s+/i.test(s)) return true;
  return false;
}

/**
 * Fail-closed gate used by integration helpers before destructive SQL.
 * @param {{ ok: boolean, reason?: string }} ownership
 * @param {string} sql
 */
function assertDestructiveSqlAllowed(ownership, sql) {
  if (!ownership || ownership.ok !== true) {
    const reason = ownership && ownership.reason ? ownership.reason : "ownership not verified";
    throw new Error(`REAL_MYSQL_OWNERSHIP_BLOCKED: ${reason}`);
  }
  if (isDestructiveFixtureSql(sql) && ownership.ok !== true) {
    throw new Error("REAL_MYSQL_OWNERSHIP_BLOCKED: destructive SQL refused");
  }
}

module.exports = {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  APPROVED_HOSTS,
  OWNERSHIP_MARKER_ENV,
  OWNERSHIP_DATADIR_ENV,
  OWNERSHIP_WORKSPACE_ENV,
  OWNERSHIP_TABLE,
  OWNERSHIP_MARKER_FILENAME,
  validateDisposableMysqlTarget,
  validateOwnedDisposableInstance,
  clearAmbientDbEnv,
  normalizeDatadir,
  isPlausibleOwnershipMarker,
  readWorkspaceOwnershipMarker,
  ownershipBootstrapStatements,
  isDestructiveFixtureSql,
  assertDestructiveSqlAllowed,
};
