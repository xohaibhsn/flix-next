/**
 * Fail-closed guards for CMS Concurrency Phase 1 disposable MariaDB 11.8.9 integration.
 * CONCURRENCY-20: engine-specific contract. Never connects to a database.
 * Never loads production .env. Does not weaken ownership fail-closed rules.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS guard module */
const path = require("path");
const fs = require("fs");

const APPROVED_DB_NAME = "flix_cms_concurrency_mdb_test";
const APPROVED_PORT = "3312";
const APPROVED_HOSTS = new Set(["127.0.0.1"]);
/** MariaDB VERSION() examples: 11.8.9-MariaDB, 11.8.9-MariaDB-log */
const APPROVED_VERSION_RE = /^11\.8\.9-MariaDB\b/i;
const OWNERSHIP_MARKER_ENV = "CMS_CONCURRENCY_OWNERSHIP_MARKER";
const OWNERSHIP_DATADIR_ENV = "CMS_CONCURRENCY_MYSQL_DATADIR";
const OWNERSHIP_WORKSPACE_ENV = "CMS_CONCURRENCY_MYSQL_WORKSPACE";
const OWNERSHIP_TABLE = "cms_concurrency_test_owner";
const OWNERSHIP_MARKER_FILENAME = "ownership.marker";

function normalizeDatadir(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let n = raw.replace(/\\/g, "/");
  if (n.length > 3 && n.endsWith("/")) n = n.slice(0, -1);
  return n.toLowerCase();
}

function validateDisposableMysqlTarget(env) {
  if (String(env.CMS_CONCURRENCY_MYSQL_INTEGRATION || "") !== "1") {
    return { ok: false, reason: "CMS_CONCURRENCY_MYSQL_INTEGRATION opt-in missing" };
  }
  if (String(env.CMS_CONCURRENCY_ENGINE || "").toLowerCase() !== "mariadb") {
    return { ok: false, reason: "CMS_CONCURRENCY_ENGINE must be mariadb for this guard module" };
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
  if (port === "3306" || port === "3307" || port === "3310") {
    return { ok: false, reason: "refusing ports reserved for other local MySQL/MariaDB instances" };
  }
  return { ok: true, host, port, database, user };
}

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
    "CMS_CONCURRENCY_ENGINE",
  ]) {
    delete env[key];
  }
}

function isPlausibleOwnershipMarker(marker) {
  const m = String(marker || "").trim();
  return /^[a-f0-9]{32,64}$/i.test(m);
}

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
  const wsNorm = normalizeDatadir(workspacePath);
  if (!expectedDatadir.startsWith(wsNorm + "/") && expectedDatadir !== wsNorm) {
    return { ok: false, reason: "expected datadir is outside declared workspace" };
  }

  const envMarker = String(input.env[OWNERSHIP_MARKER_ENV] || "").trim();
  if (!isPlausibleOwnershipMarker(envMarker)) {
    return { ok: false, reason: "CMS_CONCURRENCY_OWNERSHIP_MARKER missing or invalid" };
  }

  const version = String(input.server.version || "");
  if (!APPROVED_VERSION_RE.test(version)) {
    return { ok: false, reason: "server version must be MariaDB 11.8.9" };
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

function readWorkspaceOwnershipMarker(workspacePath) {
  const file = path.join(workspacePath, OWNERSHIP_MARKER_FILENAME);
  if (!fs.existsSync(file)) return null;
  return String(fs.readFileSync(file, "utf8")).trim();
}

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

function isDestructiveFixtureSql(sql) {
  const s = String(sql);
  if (/SET\s+FOREIGN_KEY_CHECKS\s*=\s*0/i.test(s)) return true;
  if (/^\s*DELETE\s+FROM\s+/i.test(s)) return true;
  if (/^\s*TRUNCATE\s+/i.test(s)) return true;
  if (/^\s*DROP\s+TABLE\s+/i.test(s)) return true;
  return false;
}

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
  APPROVED_VERSION_RE,
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
