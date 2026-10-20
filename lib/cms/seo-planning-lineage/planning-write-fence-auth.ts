/**
 * L4B Planning write-fence — transaction-scoped session authorization helper.
 *
 * Owns one pooled connection for Planning DML under an armed fence.
 * Session user-variable survives ROLLBACK; cleanup must be verified and
 * unsafe / uncertain connections must be destroyed (not released for reuse).
 *
 * Not imported by production Server Actions. Transactional-integration remains OFF.
 * Security: compatibility signal only — see planning-write-fence-ddl.ts.
 */

import "server-only";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  L4B_FENCE_ERROR_CODES,
  L4B_PLANNING_AUTH_SESSION_VAR,
} from "@/lib/cms/seo-planning-lineage/planning-write-fence-codes";
import { getDbPool } from "@/lib/db/pool";

export const L4B_PLANNING_WRITE_FENCE_AUTH_VERSION = "l4b-fence-auth-v1" as const;

/** Trusted operations permitted to set the Planning write-fence session marker. */
export const L4B_FENCED_TRUSTED_OPERATIONS = [
  "transactional_proceed_link",
  "transactional_protected_delete",
  "fence_bridge_validation",
] as const;

export type L4bFencedTrustedOperation = (typeof L4B_FENCED_TRUSTED_OPERATIONS)[number];

/** Alphanumeric/underscore only — safe for literal SET (prepared user-var quirks). */
const TOKEN_PATTERN = /^[A-Za-z0-9_]{8,64}$/;

export type FencedPlanningWriteOptions = {
  /** Expected fence token (must match control-row expected_token when fence active). */
  token: string;
  trustedOperation: L4bFencedTrustedOperation;
  /** Optional pool override (tests). */
  pool?: Pool;
  /**
   * When true, skip SET authorization (legacy/unmarked path for negative tests).
   * Production callers must never set this.
   */
  skipAuthorization?: boolean;
};

/** Transaction settlement relative to the pooled connection. */
type TxSettlement =
  | "none"
  | "open"
  | "committed"
  | "rolled_back"
  | "uncertain";

function assertTrustedOperation(op: unknown): L4bFencedTrustedOperation {
  if (
    typeof op !== "string" ||
    !(L4B_FENCED_TRUSTED_OPERATIONS as readonly string[]).includes(op)
  ) {
    throw Object.assign(new Error("FENCE_TRUSTED_OPERATION_REJECTED"), {
      l4bFenceCode: "TRUSTED_OPERATION_REJECTED",
      l4bFenceMessage: "Planning fence authorization requires a trusted server-side operation.",
    });
  }
  return op as L4bFencedTrustedOperation;
}

function assertToken(token: unknown): string {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw Object.assign(new Error("FENCE_TOKEN_INVALID"), {
      l4bFenceCode: "FENCE_TOKEN_INVALID",
      l4bFenceMessage: "Planning fence token format is invalid.",
    });
  }
  return token;
}

/**
 * Literal SET — prepared statements are unreliable for user variables.
 * Token is constrained to alphanumeric/underscore before interpolation.
 */
export async function setPlanningWriteFenceAuth(
  conn: PoolConnection,
  token: string,
): Promise<void> {
  const safe = assertToken(token);
  await conn.query(`SET ${L4B_PLANNING_AUTH_SESSION_VAR} = '${safe}'`);
}

export async function clearPlanningWriteFenceAuth(conn: PoolConnection): Promise<void> {
  await conn.query(`SET ${L4B_PLANNING_AUTH_SESSION_VAR} = NULL`);
}

export async function readPlanningWriteFenceAuth(
  conn: PoolConnection,
): Promise<string | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT ${L4B_PLANNING_AUTH_SESSION_VAR} AS auth`,
  );
  const row = rows[0];
  if (!row || row.auth == null) return null;
  return String(row.auth);
}

async function destroyConnection(conn: PoolConnection): Promise<void> {
  try {
    (conn as PoolConnection & { destroy: () => void }).destroy();
  } catch {
    /* already closed / destroyed */
  }
}

function attachCleanupFailure(error: unknown, cleanupMessage: string): void {
  if (error && typeof error === "object") {
    Object.assign(error, {
      l4bFenceCleanupFailure: cleanupMessage,
    });
  }
}

/**
 * Acquire → authorize → begin → work → commit/rollback → clear auth (verified) →
 * release OR destroy.
 *
 * Never returns a connection to the pool when transaction settlement is uncertain
 * or authorization CLEAR/verification fails. Destroy and release are mutually exclusive.
 */
export async function withFencedPlanningWriteTransaction<T>(
  work: (conn: PoolConnection) => Promise<T>,
  options: FencedPlanningWriteOptions,
): Promise<T> {
  const trusted = assertTrustedOperation(options.trustedOperation);
  void trusted;
  const pool = options.pool ?? getDbPool();
  const conn = await pool.getConnection();

  let settlement: TxSettlement = "none";
  let authSet = false;
  let disposed = false;
  let released = false;
  let primaryError: unknown;

  const discard = async (reason: string): Promise<void> => {
    if (disposed || released) return;
    disposed = true;
    await destroyConnection(conn);
    if (primaryError) {
      attachCleanupFailure(primaryError, reason);
    }
  };

  const releaseHealthy = (): void => {
    if (disposed || released) return;
    released = true;
    conn.release();
  };

  const tryRollback = async (): Promise<boolean> => {
    try {
      await conn.rollback();
      settlement = "rolled_back";
      return true;
    } catch {
      settlement = "uncertain";
      return false;
    }
  };

  const clearAuthVerified = async (): Promise<boolean> => {
    try {
      await clearPlanningWriteFenceAuth(conn);
      const leftover = await readPlanningWriteFenceAuth(conn);
      return leftover == null;
    } catch {
      return false;
    }
  };

  const finishCleanup = async (): Promise<void> => {
    if (disposed || released) return;

    // Unsettled / uncertain transactions are never returned to the pool.
    if (settlement === "open") {
      await tryRollback();
    }
    if (settlement === "uncertain" || settlement === "open") {
      await discard(
        settlement === "uncertain"
          ? "connection_destroyed_uncertain_transaction"
          : "connection_destroyed_unsettled_transaction",
      );
      return;
    }

    if (options.skipAuthorization && !authSet) {
      // Negative-test path: no marker was set; only release when settlement is safe.
      releaseHealthy();
      return;
    }

    if (authSet || !options.skipAuthorization) {
      const clearOk = await clearAuthVerified();
      if (!clearOk) {
        await discard("connection_destroyed_auth_clear_or_verify_failed");
        return;
      }
    }

    // Settled (committed / rolled_back / none-before-begin) and auth clear verified.
    releaseHealthy();
  };

  try {
    if (!options.skipAuthorization) {
      try {
        await setPlanningWriteFenceAuth(conn, options.token);
        authSet = true;
      } catch (error) {
        primaryError = error;
        settlement = "uncertain";
        throw error;
      }
    }

    try {
      await conn.beginTransaction();
      settlement = "open";
    } catch (error) {
      primaryError = error;
      // Begin failed — no open transaction, but session may still hold auth marker.
      settlement = "none";
      throw error;
    }

    try {
      const result = await work(conn);
      try {
        await conn.commit();
        settlement = "committed";
        return result;
      } catch (commitError) {
        primaryError = commitError;
        // Commit threw: outcome uncertain — do not treat as rolled back.
        settlement = "uncertain";
        throw commitError;
      }
    } catch (workError) {
      if (!primaryError) primaryError = workError;
      if (settlement === "open") {
        const rolled = await tryRollback();
        if (!rolled) {
          settlement = "uncertain";
        }
      }
      throw workError;
    }
  } catch (error) {
    if (!primaryError) primaryError = error;
    throw error;
  } finally {
    try {
      await finishCleanup();
    } catch (cleanupError) {
      await discard("connection_destroyed_cleanup_threw");
      void cleanupError;
    }
  }
}

/**
 * Drop-in `withTransaction`-compatible wrapper bound to a fence token.
 * Used by transactional-execution when callers inject fence-aware TX.
 */
export function createFencedPlanningWriteTransactionFn(options: {
  token: string;
  trustedOperation: L4bFencedTrustedOperation;
  pool?: Pool;
}): <T>(work: (conn: PoolConnection) => Promise<T>) => Promise<T> {
  return (work) =>
    withFencedPlanningWriteTransaction(work, {
      token: options.token,
      trustedOperation: options.trustedOperation,
      pool: options.pool,
    });
}

export function isPlanningFenceError(error: unknown, code: string): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes(code);
}

export { L4B_FENCE_ERROR_CODES };
