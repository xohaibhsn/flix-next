import "server-only";

import mysql from "mysql2/promise";
import { getDbConfig } from "@/lib/db/config";

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
