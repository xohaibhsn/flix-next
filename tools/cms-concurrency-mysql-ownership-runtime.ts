/**
 * Runtime ownership proof for CMS concurrency disposable MySQL/MariaDB integration.
 * Queries the live disposable server and fail-closes before destructive SQL.
 * CONCURRENCY-20: engine selected via CMS_CONCURRENCY_ENGINE (mysql|mariadb).
 */
import { createRequire } from "node:module";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "../lib/db/pool";

const require = createRequire(import.meta.url);
const { loadGuards } = require("./cms-concurrency-engine-guards.cjs") as {
  loadGuards: (env?: NodeJS.ProcessEnv) => {
    engine: string;
    OWNERSHIP_TABLE: string;
    OWNERSHIP_WORKSPACE_ENV: string;
    OWNERSHIP_MARKER_ENV: string;
    readWorkspaceOwnershipMarker: (workspacePath: string) => string | null;
    validateOwnedDisposableInstance: (input: {
      env: NodeJS.ProcessEnv;
      server: {
        version?: string;
        port?: number | string;
        bindAddress?: string;
        datadir?: string;
        database?: string;
      };
      workspaceMarker?: string | null;
      databaseMarker?: string | null;
    }) =>
      | {
          ok: true;
          host: string;
          port: string;
          database: string;
          user: string;
          datadir: string;
          marker: string;
        }
      | { ok: false; reason: string };
    assertDestructiveSqlAllowed: (
      ownership: { ok: boolean; reason?: string },
      sql: string,
    ) => void;
    ownershipBootstrapStatements: (marker: string) => string[];
  };
};

const guards = loadGuards(process.env);

export type OwnershipGate =
  | {
      ok: true;
      host: string;
      port: string;
      database: string;
      user: string;
      datadir: string;
      marker: string;
    }
  | { ok: false; reason: string };

/** Prove the live pool target is the owned disposable workspace instance. */
export async function proveOwnedDisposableMysql(): Promise<OwnershipGate> {
  const workspace = String(process.env[guards.OWNERSHIP_WORKSPACE_ENV] || "").trim();
  const workspaceMarker = workspace ? guards.readWorkspaceOwnershipMarker(workspace) : null;

  let databaseMarker: string | null = null;
  try {
    const [markerRows] = await getDbPool().query<Array<RowDataPacket & { marker: string }>>(
      `SELECT marker FROM \`${guards.OWNERSHIP_TABLE}\` WHERE id = 1 LIMIT 1`,
    );
    databaseMarker = markerRows[0] ? String(markerRows[0].marker) : null;
  } catch {
    databaseMarker = null;
  }

  const [identity] = await getDbPool().query<
    Array<
      RowDataPacket & {
        version: string;
        port: number;
        bind_address: string;
        datadir: string;
        db: string;
      }
    >
  >(
    `SELECT VERSION() AS version, @@port AS port, @@bind_address AS bind_address,
            @@datadir AS datadir, DATABASE() AS db`,
  );

  const row = identity[0];
  return guards.validateOwnedDisposableInstance({
    env: process.env,
    server: {
      version: row ? String(row.version) : "",
      port: row?.port,
      bindAddress: row ? String(row.bind_address) : "",
      datadir: row ? String(row.datadir) : "",
      database: row ? String(row.db) : "",
    },
    workspaceMarker,
    databaseMarker,
  });
}

/** Execute SQL only after ownership PASS. */
export async function execOwnedDestructive(
  ownership: OwnershipGate,
  sql: string,
  params: Array<string | number | boolean | null> = [],
) {
  guards.assertDestructiveSqlAllowed(ownership, sql);
  await getDbPool().execute(sql, params);
}

export async function rawOwnedDestructive(ownership: OwnershipGate, sql: string) {
  guards.assertDestructiveSqlAllowed(ownership, sql);
  await getDbPool().query(sql);
}

/** Ensure ownership table/row exists (idempotent; used after schema boots). */
export async function ensureOwnershipRowPresent() {
  const marker = String(process.env[guards.OWNERSHIP_MARKER_ENV] || "").trim();
  for (const statement of guards.ownershipBootstrapStatements(marker)) {
    await getDbPool().query(statement);
  }
}

export const OWNERSHIP_TABLE = guards.OWNERSHIP_TABLE;
export const DISPOSABLE_ENGINE = guards.engine;
