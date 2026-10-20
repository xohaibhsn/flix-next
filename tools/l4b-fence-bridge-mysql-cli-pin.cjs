/**
 * Privileged MySQL CLI pinning for L4B fence-bridge disposable validation.
 * Forces TCP loopback + exact port/database independently of defaults-file alone.
 * Never logs passwords. Never connects by itself.
 */
const APPROVED_DB_NAME = "flix_l4b_fence_bridge_rc";
const APPROVED_PORT = "3310";
const APPROVED_HOST = "127.0.0.1";
const APPROVED_VERSION_PREFIX = "8.0.46";

const FORBIDDEN_DB_NAMES = new Set([
  "flix_ledger_l1_disposable",
  "flix_l4b_tx_runtime_rc",
  "flix_v7_lineage_additive_rc",
  "flixnext_restore_rehearsal_20261019",
  "u992747032_flixnext",
]);

/**
 * @param {{
 *   defaultsFile: string,
 *   host?: string,
 *   port?: string,
 *   database?: string,
 * }} opts
 */
function buildPrivilegedMysqlCliArgs(opts) {
  const host = String(opts.host ?? APPROVED_HOST).trim();
  const port = String(opts.port ?? APPROVED_PORT).trim();
  const database = String(opts.database ?? APPROVED_DB_NAME).trim();
  const defaultsFile = String(opts.defaultsFile || "").trim();

  if (!defaultsFile) {
    return { ok: false, reason: "defaults-file path required" };
  }
  if (host !== APPROVED_HOST) {
    return { ok: false, reason: `host must be exactly ${APPROVED_HOST}` };
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

  // Explicit TCP pin AFTER defaults-file so CLI flags win over ini host/port.
  const args = [
    `--defaults-file=${defaultsFile}`,
    "--protocol=TCP",
    `--host=${host}`,
    `--port=${port}`,
    `-u`,
    "root",
    database,
  ];

  return { ok: true, args, host, port, database };
}

/**
 * @param {string} stdout
 */
function parsePrivilegedCliIdentity(stdout) {
  const text = String(stdout || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Expect one data row: db\tport\tbind\tversion  (or space-separated)
  const dataLine =
    lines.find((l) => l.includes(APPROVED_DB_NAME) || /^\S+\t\d+\t/.test(l)) ||
    lines[lines.length - 1] ||
    "";
  const parts = dataLine.split(/\t/).length >= 4 ? dataLine.split(/\t/) : dataLine.split(/\s+/);
  if (parts.length < 4) {
    return { ok: false, reason: "CLI identity output missing required columns" };
  }
  return {
    ok: true,
    database: String(parts[0]).trim(),
    port: String(parts[1]).trim(),
    bindAddress: String(parts[2]).trim(),
    version: String(parts[3]).trim(),
  };
}

/**
 * @param {{ database: string, port: string, bindAddress: string, version: string }} identity
 */
function validatePrivilegedCliIdentity(identity) {
  if (!identity || typeof identity !== "object") {
    return { ok: false, reason: "missing CLI identity" };
  }
  const database = String(identity.database || "").trim();
  const port = String(identity.port || "").trim();
  const bindAddress = String(identity.bindAddress || "").trim();
  const version = String(identity.version || "").trim();

  if (FORBIDDEN_DB_NAMES.has(database)) {
    return { ok: false, reason: `refusing protected/forbidden database name ${database}` };
  }
  if (database !== APPROVED_DB_NAME) {
    return { ok: false, reason: `DATABASE() must be exactly ${APPROVED_DB_NAME}` };
  }
  if (port !== APPROVED_PORT) {
    return { ok: false, reason: `@@port must be exactly ${APPROVED_PORT}` };
  }
  if (bindAddress !== "127.0.0.1" && bindAddress !== "localhost" && bindAddress !== "::1") {
    // Disposable mysqld binds 127.0.0.1; reject wildcards / public binds.
    if (bindAddress === "*" || bindAddress === "0.0.0.0" || !bindAddress) {
      return { ok: false, reason: "@@bind_address is not loopback" };
    }
    return { ok: false, reason: "@@bind_address is not loopback" };
  }
  if (bindAddress !== "127.0.0.1") {
    return { ok: false, reason: "@@bind_address must be 127.0.0.1 for this disposable" };
  }
  if (!version.startsWith(APPROVED_VERSION_PREFIX)) {
    return { ok: false, reason: `MySQL version must start with ${APPROVED_VERSION_PREFIX}` };
  }
  return { ok: true, database, port, bindAddress, version };
}

const PRIVILEGED_IDENTITY_SQL =
  "SELECT DATABASE(), @@port, @@bind_address, @@version";

module.exports = {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  APPROVED_HOST,
  APPROVED_VERSION_PREFIX,
  FORBIDDEN_DB_NAMES,
  PRIVILEGED_IDENTITY_SQL,
  buildPrivilegedMysqlCliArgs,
  parsePrivilegedCliIdentity,
  validatePrivilegedCliIdentity,
};
