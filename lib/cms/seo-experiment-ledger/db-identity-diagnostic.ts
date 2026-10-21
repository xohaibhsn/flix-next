/**
 * On-demand MariaDB identity diagnostic for Experiment Ledger.
 * Super-admin + feature-flag gated. Exactly one fixed SELECT per explicit run.
 * No writes, migrations, retries, or persistent diagnostic logging.
 */

import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getAdminSession, type CurrentAdmin } from "@/lib/auth/session";
import { getDbConfig } from "@/lib/db/config";
import { getDbPool } from "@/lib/db/pool";
import { toLedgerMysqlDateTime } from "@/lib/cms/seo-experiment-ledger/read-cursor";

export const FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV =
  "FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED" as const;

/** Exact string match only — not case-insensitive, not "1"/"yes". */
export function isDbIdentityDiagnosticEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env[FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV] === "true";
}

export const DB_IDENTITY_DIAGNOSTIC_QUERY_TIMEOUT_MS = 8_000 as const;

export const DB_IDENTITY_DIAGNOSTIC_SQL = `SELECT
    DATABASE() AS selected_database,
    @@hostname AS server_hostname,
    @@port AS server_port,
    @@server_id AS server_id,
    COUNT(*) AS total_runs,
    MAX(created_at) AS latest_created_at,
    SUM(
        CASE
            WHEN created_at = '2026-10-20 23:08:18'
            THEN 1 ELSE 0
        END
    ) AS oct20_run_present
FROM seo_research_runs` as const;

export type DbIdentityDiagnosticSnapshot = {
  configuredHost: string;
  configuredPort: number;
  selectedDatabase: string;
  serverHostname: string;
  serverPort: number;
  serverId: string;
  totalRuns: number;
  latestCreatedAt: string | null;
  oct20RunPresent: boolean;
};

export type DbIdentityDiagnosticErrorCode =
  | "disabled"
  | "unauthorized"
  | "forbidden"
  | "unavailable"
  | "query_error";

export type DbIdentityDiagnosticResult =
  | { ok: true; snapshot: DbIdentityDiagnosticSnapshot }
  | {
      ok: false;
      errorCode: DbIdentityDiagnosticErrorCode;
      errorMessage: string;
    };

export type DbIdentityPoolLike = {
  getConnection: () => Promise<DbIdentityConnectionLike>;
};

export type DbIdentityConnectionLike = {
  query: (sql: string) => Promise<unknown>;
  release: () => void;
  destroy: () => void;
};

/** Distinguishes client-side race timeout from ordinary settled query failures. */
class DiagnosticTimeoutError extends Error {
  readonly code = "diagnostic_timeout" as const;

  constructor() {
    super("diagnostic_timeout");
    this.name = "DiagnosticTimeoutError";
  }
}

function isDiagnosticTimeoutError(error: unknown): error is DiagnosticTimeoutError {
  return (
    error instanceof DiagnosticTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "diagnostic_timeout")
  );
}

export type DbIdentityDiagnosticDeps = {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  isEnabled?: (
    env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  ) => boolean;
  getAdminSession?: () => Promise<CurrentAdmin | null>;
  getConfiguredEndpoint?: () => { host: string; port: number } | null;
  getPool?: () => DbIdentityPoolLike;
  queryTimeoutMs?: number;
};

type IdentityPacket = RowDataPacket & {
  selected_database: unknown;
  server_hostname: unknown;
  server_port: unknown;
  server_id: unknown;
  total_runs: unknown;
  latest_created_at: unknown;
  oct20_run_present: unknown;
};

function denied(
  errorCode: DbIdentityDiagnosticErrorCode,
  errorMessage: string,
): DbIdentityDiagnosticResult {
  return { ok: false, errorCode, errorMessage };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function mapDbIdentityDiagnosticRow(
  row: IdentityPacket,
  configured: { host: string; port: number },
): DbIdentityDiagnosticSnapshot {
  const totalRuns = asFiniteNumber(row.total_runs) ?? 0;
  const serverPort = asFiniteNumber(row.server_port) ?? 0;
  const oct20Raw = asFiniteNumber(row.oct20_run_present) ?? 0;
  const latestRaw = row.latest_created_at;
  const latestCreatedAt =
    latestRaw == null || latestRaw === ""
      ? null
      : toLedgerMysqlDateTime(latestRaw);

  return {
    configuredHost: configured.host,
    configuredPort: configured.port,
    selectedDatabase: asNonEmptyString(row.selected_database) ?? "",
    serverHostname: asNonEmptyString(row.server_hostname) ?? "",
    serverPort,
    serverId: asNonEmptyString(row.server_id) ?? String(row.server_id ?? ""),
    totalRuns,
    latestCreatedAt,
    oct20RunPresent: oct20Raw > 0,
  };
}

function defaultConfiguredEndpoint(): { host: string; port: number } | null {
  const config = getDbConfig();
  if (!config) return null;
  return { host: config.host, port: config.port };
}

function rowsFromQueryResult(result: unknown): RowDataPacket[] {
  if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
    return result[0] as RowDataPacket[];
  }
  if (Array.isArray(result)) {
    return result as RowDataPacket[];
  }
  return [];
}

async function queryWithTimeout(
  conn: DbIdentityConnectionLike,
  sql: string,
  timeoutMs: number,
): Promise<RowDataPacket[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await Promise.race([
      (async () => rowsFromQueryResult(await conn.query(sql)))(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new DiagnosticTimeoutError());
        }, timeoutMs);
      }),
    ]);
    return rows;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run the fixed identity SELECT once. Auth + feature flag are checked first;
 * unauthorized/disabled paths never borrow a pool connection.
 *
 * Timeout destroys the borrowed connection (never release-to-pool). That does
 * not prove MariaDB cancelled the server-side statement.
 */
export async function runDbIdentityDiagnostic(
  deps: DbIdentityDiagnosticDeps = {},
): Promise<DbIdentityDiagnosticResult> {
  const env = deps.env ?? process.env;
  const isEnabled = deps.isEnabled ?? isDbIdentityDiagnosticEnabled;
  if (!isEnabled(env)) {
    return denied("disabled", "Database identity diagnostic is disabled.");
  }

  const session = await (deps.getAdminSession ?? getAdminSession)();
  if (!session) {
    return denied("unauthorized", "Unauthorized");
  }
  if (session.role !== "super_admin") {
    return denied("forbidden", "Access denied.");
  }

  const configured = (deps.getConfiguredEndpoint ?? defaultConfiguredEndpoint)();
  if (!configured) {
    return denied("unavailable", "Database identity diagnostic unavailable.");
  }

  const pool: DbIdentityPoolLike = deps.getPool
    ? deps.getPool()
    : {
        getConnection: async () => getDbPool().getConnection(),
      };
  const timeoutMs = deps.queryTimeoutMs ?? DB_IDENTITY_DIAGNOSTIC_QUERY_TIMEOUT_MS;
  let conn: DbIdentityConnectionLike | null = null;
  let cleaned = false;

  const releaseHealthy = (): void => {
    if (!conn || cleaned) return;
    cleaned = true;
    try {
      conn.release();
    } catch {
      // Best-effort; never surface pool internals.
    }
  };

  const destroyUncertain = (): void => {
    if (!conn || cleaned) return;
    cleaned = true;
    try {
      conn.destroy();
    } catch {
      // Best-effort; never surface pool internals.
    }
  };

  try {
    conn = await pool.getConnection();
    const rows = await queryWithTimeout(conn, DB_IDENTITY_DIAGNOSTIC_SQL, timeoutMs);
    const row = rows[0] as IdentityPacket | undefined;
    if (!row) {
      return denied("query_error", "Unable to sample database identity.");
    }
    return {
      ok: true,
      snapshot: mapDbIdentityDiagnosticRow(row, configured),
    };
  } catch (error) {
    if (isDiagnosticTimeoutError(error)) {
      destroyUncertain();
    }
    return denied("query_error", "Unable to sample database identity.");
  } finally {
    releaseHealthy();
  }
}
