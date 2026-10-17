/**
 * Injectable MySQL named-lock lifecycle for CMS schema ensure.
 * Kept free of server-only imports so unit tests can drive the contract.
 */

export type SchemaLockConnection = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
  release: () => void;
  destroy: () => void;
};

export type SchemaAdvisoryLockDeps = {
  getConnection: () => Promise<SchemaLockConnection>;
  readIsFastPath: () => Promise<boolean>;
  ensureSchema: () => Promise<void>;
  lockName?: string;
  timeoutSec?: number;
};

export const DEFAULT_CMS_SCHEMA_ENSURE_LOCK = "flix_next_cms_schema_ensure_v1";
export const DEFAULT_CMS_SCHEMA_ENSURE_LOCK_TIMEOUT_SEC = 30;

function asRowPacket(result: unknown): Record<string, unknown> | null {
  if (!Array.isArray(result) || !result[0] || typeof result[0] !== "object") return null;
  return result[0] as Record<string, unknown>;
}

/**
 * Acquire GET_LOCK on a dedicated connection, run ensure work, RELEASE_LOCK on the
 * same connection. If release is not confirmed, destroy the connection instead of
 * returning it to a reusable pool (pooled release does not drop session locks).
 *
 * Control-flow rule: never `return` from inside the try before post-finally error
 * propagation. Fast-path skips DDL via a conditional ensureSchema call so RELEASE_LOCK
 * failures still reject the promise after cleanup.
 *
 * Error precedence:
 * 1. If RELEASE_LOCK was required and did not confirm success → throw release-cleanliness
 *    error (with operationError as `cause` when the ensure/fast-path body also failed).
 * 2. Else if the body failed → rethrow operationError.
 * 3. Else resolve successfully.
 */
export async function runWithCmsSchemaAdvisoryLock(deps: SchemaAdvisoryLockDeps): Promise<void> {
  const lockName = deps.lockName ?? DEFAULT_CMS_SCHEMA_ENSURE_LOCK;
  const timeoutSec = deps.timeoutSec ?? DEFAULT_CMS_SCHEMA_ENSURE_LOCK_TIMEOUT_SEC;
  const conn = await deps.getConnection();
  let acquired = false;
  let destroyConnection = false;
  let operationError: unknown;

  try {
    const [lockResult] = await conn.query("SELECT GET_LOCK(?, ?) AS acquired", [lockName, timeoutSec]);
    const lockRow = asRowPacket(lockResult);
    const acquiredRaw = lockRow?.acquired;
    if (acquiredRaw == null || Number(acquiredRaw) !== 1) {
      throw new Error("CMS schema ensure could not acquire migration lock.");
    }
    acquired = true;

    // Fast-path: skip DDL, but do NOT return early — finally + post-finally must run.
    if (!(await deps.readIsFastPath())) {
      await deps.ensureSchema();
    }
  } catch (error) {
    operationError = error;
  } finally {
    if (acquired) {
      let releasedOk = false;
      try {
        const [releaseResult] = await conn.query("SELECT RELEASE_LOCK(?) AS released", [lockName]);
        const releaseRow = asRowPacket(releaseResult);
        const releasedRaw = releaseRow?.released;
        releasedOk = releasedRaw != null && Number(releasedRaw) === 1;
      } catch {
        releasedOk = false;
      }
      if (!releasedOk) {
        destroyConnection = true;
      }
    }

    if (destroyConnection) {
      try {
        conn.destroy();
      } catch {
        // Connection already unusable.
      }
    } else {
      conn.release();
    }
  }

  if (destroyConnection) {
    const releaseError = new Error("CMS schema ensure lock was not released cleanly.");
    if (operationError != null) {
      (releaseError as Error & { cause?: unknown }).cause = operationError;
    }
    throw releaseError;
  }
  if (operationError != null) {
    throw operationError;
  }
}
