/**
 * L4B Planning write-fence — exclusive arming / disarming against the control row.
 *
 * Arming takes SELECT … FOR UPDATE on seo_planning_write_fence id=1, then sets
 * fence_active=1. INSERT/DELETE triggers also lock that row, so an in-flight
 * legacy Planning write that already passed the trigger holds the lock until
 * COMMIT/ROLLBACK — arming waits (or times out) rather than completing early.
 *
 * Session innodb_lock_wait_timeout is restored before pool release. Uncertain
 * transaction settlement or failed session restoration destroys the connection.
 *
 * Not a production activation switch. Local disposable + prepared ops only.
 */

import "server-only";

import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/pool";

export const L4B_PLANNING_WRITE_FENCE_ARM_VERSION = "l4b-fence-arm-v1" as const;

export type FenceArmResult =
  | {
      ok: true;
      fenceActive: 1;
      waitedMs: number;
    }
  | {
      ok: false;
      errorCode: "ARM_TIMEOUT" | "ARM_FAILED" | "METADATA_MISSING" | "TOKEN_MISMATCH";
      errorMessage: string;
      waitedMs: number;
    };

export type FenceDisarmResult =
  | { ok: true; fenceActive: 0 }
  | { ok: false; errorCode: string; errorMessage: string };

const TOKEN_PATTERN = /^[A-Za-z0-9_]{8,64}$/;

type TxSettlement = "none" | "open" | "committed" | "rolled_back" | "uncertain";

function assertToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("Fence arm token must be 8–64 alphanumeric/underscore characters.");
  }
  return token;
}

async function destroyConnection(conn: PoolConnection): Promise<void> {
  try {
    (conn as PoolConnection & { destroy: () => void }).destroy();
  } catch {
    /* already closed / destroyed */
  }
}

async function readLockWaitTimeout(conn: PoolConnection): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT @@SESSION.innodb_lock_wait_timeout AS t`,
  );
  const value = Number(rows[0]?.t);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Unable to read session innodb_lock_wait_timeout.");
  }
  return value;
}

/**
 * Apply a bounded session lock-wait timeout, run work, restore prior value.
 * Returns whether the original timeout was successfully restored.
 */
async function withLockWaitTimeout<T>(
  conn: PoolConnection,
  timeoutSeconds: number,
  work: () => Promise<T>,
): Promise<{ value: T; timeoutRestored: boolean }> {
  const previous = await readLockWaitTimeout(conn);
  const bounded = Math.max(1, Math.min(30, Math.floor(timeoutSeconds)));
  await conn.query(`SET SESSION innodb_lock_wait_timeout = ${bounded}`);
  try {
    const value = await work();
    try {
      await conn.query(`SET SESSION innodb_lock_wait_timeout = ${previous}`);
      const verified = await readLockWaitTimeout(conn);
      return { value, timeoutRestored: verified === previous };
    } catch {
      return { value, timeoutRestored: false };
    }
  } catch (error) {
    try {
      await conn.query(`SET SESSION innodb_lock_wait_timeout = ${previous}`);
      const verified = await readLockWaitTimeout(conn);
      if (verified !== previous) {
        Object.assign(error && typeof error === "object" ? error : {}, {
          l4bFenceTimeoutRestoreFailed: true,
        });
      }
    } catch {
      Object.assign(error && typeof error === "object" ? error : {}, {
        l4bFenceTimeoutRestoreFailed: true,
      });
    }
    throw error;
  }
}

async function tryRollback(conn: PoolConnection): Promise<boolean> {
  try {
    await conn.rollback();
    return true;
  } catch {
    return false;
  }
}

/**
 * Exclusive arm: lock control row, verify token, set fence_active=1.
 * Contends with trigger-side FOR UPDATE from in-flight Planning writes.
 */
export async function armPlanningWriteFence(args: {
  token: string;
  armedBy?: string;
  lockWaitSeconds?: number;
  pool?: Pool;
}): Promise<FenceArmResult> {
  const token = assertToken(args.token);
  const pool = args.pool ?? getDbPool();
  const started = Date.now();
  const conn = await pool.getConnection();

  let settlement: TxSettlement = "none";
  let disposed = false;
  let released = false;
  let timeoutRestored = true;

  const discard = async (): Promise<void> => {
    if (disposed || released) return;
    disposed = true;
    await destroyConnection(conn);
  };

  const releaseHealthy = (): void => {
    if (disposed || released) return;
    released = true;
    conn.release();
  };

  const finish = async (): Promise<void> => {
    if (disposed || released) return;
    let finalSettlement: TxSettlement = settlement;
    if (finalSettlement === "open") {
      const ok = await tryRollback(conn);
      finalSettlement = ok ? "rolled_back" : "uncertain";
      settlement = finalSettlement;
    }
    if (finalSettlement === "uncertain" || !timeoutRestored) {
      await discard();
      return;
    }
    releaseHealthy();
  };

  try {
    const wrapped = await withLockWaitTimeout(conn, args.lockWaitSeconds ?? 8, async () => {
      await conn.beginTransaction();
      settlement = "open";
      try {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT id, fence_active, expected_token
           FROM seo_planning_write_fence
           WHERE id = 1
           FOR UPDATE`,
        );
        if (!rows.length) {
          const ok = await tryRollback(conn);
          settlement = ok ? "rolled_back" : "uncertain";
          return {
            ok: false as const,
            errorCode: "METADATA_MISSING" as const,
            errorMessage: "PLANNING_FENCE_METADATA_MISSING",
            waitedMs: Date.now() - started,
          };
        }

        const expected = Buffer.isBuffer(rows[0].expected_token)
          ? rows[0].expected_token.toString("utf8")
          : String(rows[0].expected_token ?? "");
        if (expected !== token) {
          const ok = await tryRollback(conn);
          settlement = ok ? "rolled_back" : "uncertain";
          return {
            ok: false as const,
            errorCode: "TOKEN_MISMATCH" as const,
            errorMessage: "Fence arm token does not match control-row expected_token.",
            waitedMs: Date.now() - started,
          };
        }

        await conn.execute<ResultSetHeader>(
          `UPDATE seo_planning_write_fence
           SET fence_active = 1,
               armed_at = UTC_TIMESTAMP(),
               armed_by = ?,
               note = 'l4b-fence-armed'
           WHERE id = 1`,
          [args.armedBy ?? "l4b-fence-arm"],
        );
        try {
          await conn.commit();
          settlement = "committed";
        } catch {
          settlement = "uncertain";
          return {
            ok: false as const,
            errorCode: "ARM_FAILED" as const,
            errorMessage: "Fence arm commit result is uncertain; connection will be discarded.",
            waitedMs: Date.now() - started,
          };
        }
        return {
          ok: true as const,
          fenceActive: 1 as const,
          waitedMs: Date.now() - started,
        };
      } catch (error) {
        if (settlement === "open") {
          const ok = await tryRollback(conn);
          settlement = ok ? "rolled_back" : "uncertain";
        }
        const msg = error instanceof Error ? error.message : String(error);
        const timedOut = /Lock wait timeout|ER_LOCK_WAIT_TIMEOUT|1213|Deadlock/i.test(msg);
        return {
          ok: false as const,
          errorCode: timedOut ? ("ARM_TIMEOUT" as const) : ("ARM_FAILED" as const),
          errorMessage: timedOut
            ? "Fence arm blocked by in-flight Planning write lock (fail closed)."
            : msg.slice(0, 200),
          waitedMs: Date.now() - started,
        };
      }
    });
    timeoutRestored = wrapped.timeoutRestored;
    return wrapped.value;
  } catch (error) {
    timeoutRestored = false;
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errorCode: "ARM_FAILED",
      errorMessage: msg.slice(0, 200),
      waitedMs: Date.now() - started,
    };
  } finally {
    await finish();
  }
}

export async function disarmPlanningWriteFence(args: {
  token: string;
  pool?: Pool;
}): Promise<FenceDisarmResult> {
  const token = assertToken(args.token);
  const pool = args.pool ?? getDbPool();
  const conn = await pool.getConnection();

  let settlement: TxSettlement = "none";
  let disposed = false;
  let released = false;

  const discard = async (): Promise<void> => {
    if (disposed || released) return;
    disposed = true;
    await destroyConnection(conn);
  };

  const releaseHealthy = (): void => {
    if (disposed || released) return;
    released = true;
    conn.release();
  };

  const finish = async (): Promise<void> => {
    if (disposed || released) return;
    let finalSettlement: TxSettlement = settlement;
    if (finalSettlement === "open") {
      const ok = await tryRollback(conn);
      finalSettlement = ok ? "rolled_back" : "uncertain";
      settlement = finalSettlement;
    }
    if (finalSettlement === "uncertain") {
      await discard();
      return;
    }
    releaseHealthy();
  };

  try {
    await conn.beginTransaction();
    settlement = "open";
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, expected_token FROM seo_planning_write_fence WHERE id = 1 FOR UPDATE`,
    );
    if (!rows.length) {
      const ok = await tryRollback(conn);
      settlement = ok ? "rolled_back" : "uncertain";
      return {
        ok: false,
        errorCode: "METADATA_MISSING",
        errorMessage: "PLANNING_FENCE_METADATA_MISSING",
      };
    }
    const expected = Buffer.isBuffer(rows[0].expected_token)
      ? rows[0].expected_token.toString("utf8")
      : String(rows[0].expected_token ?? "");
    if (expected !== token) {
      const ok = await tryRollback(conn);
      settlement = ok ? "rolled_back" : "uncertain";
      return {
        ok: false,
        errorCode: "TOKEN_MISMATCH",
        errorMessage: "Fence disarm token mismatch.",
      };
    }
    await conn.execute(
      `UPDATE seo_planning_write_fence
       SET fence_active = 0, armed_at = NULL, note = 'l4b-fence-disarmed'
       WHERE id = 1`,
    );
    try {
      await conn.commit();
      settlement = "committed";
    } catch {
      settlement = "uncertain";
      return {
        ok: false,
        errorCode: "DISARM_FAILED",
        errorMessage: "Fence disarm commit result is uncertain; connection will be discarded.",
      };
    }
    return { ok: true, fenceActive: 0 };
  } catch (error) {
    if (settlement === "open") {
      const ok = await tryRollback(conn);
      settlement = ok ? "rolled_back" : "uncertain";
    }
    return {
      ok: false,
      errorCode: "DISARM_FAILED",
      errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 200),
    };
  } finally {
    await finish();
  }
}
