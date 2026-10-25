import "server-only";

import mysql from "mysql2/promise";
import { getDbConfig } from "@/lib/db/config";
import {
  assertMutationAllowed,
  type MutationIntent,
} from "@/lib/cms/write-fence";
import type { CmsWriteFreezeEnv } from "@/lib/cms/write-freeze";

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (pool) return pool;

  const config = getDbConfig();
  if (!config) {
    throw new Error(
      "MySQL is not configured. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD.",
    );
  }

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.name,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    charset: "utf8mb4",
    timezone: "Z",
  });

  return pool;
}

/**
 * Plain transaction helper. Does NOT imply mutation — callers with DML must
 * use withFencedTransaction or assertMutationAllowed at the sink before DML.
 * Read-only transactional work may call this directly.
 */
export async function withTransaction<T>(
  work: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getDbPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Mutation-intent fence then the same begin/commit/rollback path as withTransaction.
 *
 * Limitation: env/source check is NOT DB-atomic across workers. A freeze flip
 * after this assert (or an old binary without this guard) can still race.
 * Does not query the database solely to evaluate the fence.
 */
export async function withFencedTransaction<T>(
  intent: MutationIntent,
  work: (conn: mysql.PoolConnection) => Promise<T>,
  env: CmsWriteFreezeEnv = process.env,
): Promise<T> {
  assertMutationAllowed(intent, env);
  return withTransaction(work);
}
