/**
 * Offline unit tests for the on-demand DB identity diagnostic.
 * Dependency injection / mocks only — never opens a real MariaDB connection.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import type { CurrentAdmin } from "../lib/auth/session";
import {
  DB_IDENTITY_DIAGNOSTIC_SQL,
  FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV,
  isDbIdentityDiagnosticEnabled,
  mapDbIdentityDiagnosticRow,
  runDbIdentityDiagnostic,
  type DbIdentityConnectionLike,
  type DbIdentityPoolLike,
} from "../lib/cms/seo-experiment-ledger/db-identity-diagnostic";
import { SIDHU_SEO_NAV } from "../lib/cms/sidhu-seo-nav";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function admin(role: CurrentAdmin["role"]): CurrentAdmin {
  return {
    id: "adm_test",
    username: "tester",
    displayName: "Tester",
    role,
    permissions: [],
    active: true,
    sessionVersion: 1,
    createdAt: "",
    updatedAt: "",
    lastLoginAt: null,
    createdBy: null,
    isPrimary: role === "super_admin",
    effectivePermissions: [],
    expiresAt: Date.now() + 60_000,
  };
}

function identityRow(overrides: Partial<Record<string, unknown>> = {}): RowDataPacket {
  return {
    selected_database: "u123_flix",
    server_hostname: "srv497.hstgr.io",
    server_port: 3306,
    server_id: 1,
    total_runs: 6,
    latest_created_at: "2026-10-20 23:08:18",
    oct20_run_present: 1,
    ...overrides,
  } as RowDataPacket;
}

function createSpyPool(options?: {
  failQuery?: boolean;
  failGetConnection?: boolean;
  hangQuery?: boolean;
  row?: RowDataPacket;
  leakCredentialsInError?: boolean;
}): {
  pool: DbIdentityPoolLike;
  conn: DbIdentityConnectionLike & {
    __calls: { query: number; release: number; destroy: number; sql: string[] };
  };
} {
  const calls = { query: 0, release: 0, destroy: 0, sql: [] as string[] };
  const conn = {
    __calls: calls,
    async query(sql: string) {
      calls.query += 1;
      calls.sql.push(String(sql));
      if (options?.hangQuery) {
        return new Promise(() => {
          /* pending forever — forces Promise.race timeout */
        });
      }
      if (options?.failQuery) {
        if (options.leakCredentialsInError) {
          throw new Error(
            "Access denied for user 'secret_user'@'%' (using password: YES) pwd=hunter2",
          );
        }
        throw new Error("injected_query_failure");
      }
      return [[options?.row ?? identityRow()]];
    },
    release() {
      calls.release += 1;
    },
    destroy() {
      calls.destroy += 1;
    },
  };

  const pool: DbIdentityPoolLike = {
    async getConnection() {
      if (options?.failGetConnection) {
        throw new Error("injected_getConnection_failure DB_PASSWORD=should-not-leak");
      }
      return conn;
    },
  };

  return { pool, conn };
}

function authorizedDeps(pool: DbIdentityPoolLike, extra?: { queryTimeoutMs?: number }) {
  return {
    env: { [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "true" },
    getAdminSession: async () => admin("super_admin"),
    getConfiguredEndpoint: () => ({ host: "srv497.hstgr.io", port: 3306 }),
    getPool: () => pool,
    ...extra,
  };
}

test("feature flag requires exact string true", () => {
  assert.equal(isDbIdentityDiagnosticEnabled({}), false);
  assert.equal(
    isDbIdentityDiagnosticEnabled({ [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "true" }),
    true,
  );
  assert.equal(
    isDbIdentityDiagnosticEnabled({ [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "TRUE" }),
    false,
  );
  assert.equal(
    isDbIdentityDiagnosticEnabled({ [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "1" }),
    false,
  );
  assert.equal(
    isDbIdentityDiagnosticEnabled({ [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "yes" }),
    false,
  );
});

test("feature OFF denies diagnostic with zero SELECTs", async () => {
  const { pool, conn } = createSpyPool();
  let sessionCalls = 0;
  const result = await runDbIdentityDiagnostic({
    env: { [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "false" },
    getAdminSession: async () => {
      sessionCalls += 1;
      return admin("super_admin");
    },
    getConfiguredEndpoint: () => ({ host: "srv497.hstgr.io", port: 3306 }),
    getPool: () => pool,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, "disabled");
  assert.equal(sessionCalls, 0);
  assert.equal(conn.__calls.query, 0);
  assert.equal(conn.__calls.release, 0);
  assert.equal(conn.__calls.destroy, 0);
});

test("unauthenticated denies with zero SELECTs", async () => {
  const { pool, conn } = createSpyPool();
  const result = await runDbIdentityDiagnostic({
    env: { [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "true" },
    getAdminSession: async () => null,
    getConfiguredEndpoint: () => ({ host: "srv497.hstgr.io", port: 3306 }),
    getPool: () => pool,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, "unauthorized");
  assert.equal(conn.__calls.query, 0);
  assert.equal(conn.__calls.release, 0);
  assert.equal(conn.__calls.destroy, 0);
});

test("authenticated non-super-admin denies with zero SELECTs", async () => {
  const { pool, conn } = createSpyPool();
  const result = await runDbIdentityDiagnostic({
    env: { [FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED_ENV]: "true" },
    getAdminSession: async () => admin("full_access"),
    getConfiguredEndpoint: () => ({ host: "srv497.hstgr.io", port: 3306 }),
    getPool: () => pool,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, "forbidden");
  assert.equal(conn.__calls.query, 0);
  assert.equal(conn.__calls.release, 0);
  assert.equal(conn.__calls.destroy, 0);
});

test("successful query releases once and never destroys", async () => {
  const { pool, conn } = createSpyPool({ row: identityRow({ total_runs: 6 }) });
  let getConnectionCalls = 0;
  const wrappedPool: DbIdentityPoolLike = {
    async getConnection() {
      getConnectionCalls += 1;
      return pool.getConnection();
    },
  };

  const result = await runDbIdentityDiagnostic(authorizedDeps(wrappedPool));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.snapshot.totalRuns, 6);
    assert.equal(result.snapshot.configuredHost, "srv497.hstgr.io");
    assert.equal(result.snapshot.configuredPort, 3306);
    assert.equal(result.snapshot.serverHostname, "srv497.hstgr.io");
    assert.equal(result.snapshot.oct20RunPresent, true);
  }
  assert.equal(getConnectionCalls, 1);
  assert.equal(conn.__calls.query, 1);
  assert.equal(conn.__calls.release, 1);
  assert.equal(conn.__calls.destroy, 0);
  assert.equal(conn.__calls.sql[0], DB_IDENTITY_DIAGNOSTIC_SQL);
  assert.match(DB_IDENTITY_DIAGNOSTIC_SQL, /FROM seo_research_runs/);
  assert.doesNotMatch(DB_IDENTITY_DIAGNOSTIC_SQL, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
});

test("settled query failure releases once, destroys zero, sanitizes errors", async () => {
  const { pool, conn } = createSpyPool({
    failQuery: true,
    leakCredentialsInError: true,
  });
  const result = await runDbIdentityDiagnostic(authorizedDeps(pool));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, "query_error");
    assert.equal(result.errorMessage, "Unable to sample database identity.");
    assert.doesNotMatch(result.errorMessage, /secret_user|hunter2|password|pwd=/i);
  }
  assert.equal(conn.__calls.query, 1);
  assert.equal(conn.__calls.release, 1);
  assert.equal(conn.__calls.destroy, 0);
});

test("pending query timeout destroys once, never releases, sanitizes, no retry", async () => {
  const { pool, conn } = createSpyPool({ hangQuery: true });
  const result = await runDbIdentityDiagnostic(
    authorizedDeps(pool, { queryTimeoutMs: 40 }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, "query_error");
    assert.equal(result.errorMessage, "Unable to sample database identity.");
    assert.doesNotMatch(result.errorMessage, /diagnostic_timeout|password|DB_/i);
  }
  assert.equal(conn.__calls.query, 1);
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("connection not borrowed when getConnection fails; error sanitized", async () => {
  const { pool, conn } = createSpyPool({ failGetConnection: true });
  const result = await runDbIdentityDiagnostic(authorizedDeps(pool));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, "query_error");
    assert.doesNotMatch(result.errorMessage, /DB_PASSWORD|should-not-leak/i);
  }
  assert.equal(conn.__calls.query, 0);
  assert.equal(conn.__calls.release, 0);
  assert.equal(conn.__calls.destroy, 0);
});

test("maps six-run and three-run mocked datasets correctly", () => {
  const six = mapDbIdentityDiagnosticRow(
    identityRow({
      total_runs: 6,
      latest_created_at: "2026-10-20 23:08:18",
      oct20_run_present: 1,
      server_hostname: "srv497.hstgr.io",
    }) as never,
    { host: "srv497.hstgr.io", port: 3306 },
  );
  assert.equal(six.totalRuns, 6);
  assert.equal(six.latestCreatedAt, "2026-10-20 23:08:18");
  assert.equal(six.oct20RunPresent, true);

  const three = mapDbIdentityDiagnosticRow(
    identityRow({
      total_runs: 3,
      latest_created_at: "2026-10-08 22:58:19",
      oct20_run_present: 0,
      server_hostname: "srv1502.hstgr.io",
    }) as never,
    { host: "srv1502.hstgr.io", port: 3306 },
  );
  assert.equal(three.totalRuns, 3);
  assert.equal(three.latestCreatedAt, "2026-10-08 22:58:19");
  assert.equal(three.oct20RunPresent, false);
  assert.equal(three.serverHostname, "srv1502.hstgr.io");
});

test("page render path does not invoke diagnostic query helpers", () => {
  const page = read("app/sidhu/(protected)/seo/ledger/db-identity/page.tsx");
  assert.match(page, /force-dynamic/);
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
  assert.match(page, /requireAdminSession/);
  assert.match(page, /role !== "super_admin"/);
  assert.match(page, /isDbIdentityDiagnosticEnabled/);
  assert.doesNotMatch(page, /runDbIdentityDiagnostic\b/);
  assert.doesNotMatch(page, /getDbPool/);
  assert.doesNotMatch(page, /getConnection/);
  assert.doesNotMatch(page, /DB_IDENTITY_DIAGNOSTIC_SQL/);
});

test("diagnostic is not wired into SEO nav", () => {
  assert.equal(
    SIDHU_SEO_NAV.some((item) => item.href.includes("db-identity")),
    false,
  );
  const nav = read("lib/cms/sidhu-seo-nav.ts");
  assert.doesNotMatch(nav, /db-identity/);
});

test("action module exports only the async server action at runtime", () => {
  const action = read("lib/cms/seo-experiment-ledger/db-identity-diagnostic-action.ts");
  assert.match(action, /"use server"/);
  assert.match(action, /export async function runDbIdentityDiagnosticAction/);
  assert.match(action, /runDbIdentityDiagnostic\(\)/);
  assert.doesNotMatch(action, /DB_IDENTITY_DIAGNOSTIC_ACTION_IDLE/);
  assert.doesNotMatch(action, /export const /);
  assert.doesNotMatch(action, /getDbPool|execute\(|query\(/);
  const panel = read("components/sidhu/DbIdentityDiagnosticPanel.tsx");
  assert.match(panel, /INITIAL_ACTION_STATE/);
  assert.match(panel, /status:\s*"idle"/);
});

test("core module never logs diagnostic values and uses destroy on timeout path", () => {
  const core = read("lib/cms/seo-experiment-ledger/db-identity-diagnostic.ts");
  assert.doesNotMatch(core, /console\.(log|info|debug|warn|error)/);
  assert.doesNotMatch(core, /DB_PASSWORD|password|connectionString/i);
  assert.match(core, /conn\.release\(\)/);
  assert.match(core, /conn\.destroy\(\)/);
  assert.match(core, /destroyUncertain/);
  assert.match(core, /finally/);
});
