/**
 * CONCURRENCY-20 — disposable MariaDB 11.8.9 ownership / isolation guards (offline).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const guards = require("./cms-concurrency-mariadb-disposable-guards.cjs") as {
  APPROVED_DB_NAME: string;
  APPROVED_PORT: string;
  OWNERSHIP_MARKER_ENV: string;
  OWNERSHIP_DATADIR_ENV: string;
  OWNERSHIP_WORKSPACE_ENV: string;
  validateDisposableMysqlTarget: (env: Record<string, string | undefined>) =>
    | { ok: true; host: string; port: string; database: string; user: string }
    | { ok: false; reason: string };
  validateOwnedDisposableInstance: (input: {
    env: Record<string, string | undefined>;
    server: {
      version?: string;
      port?: number | string;
      bindAddress?: string;
      datadir?: string;
      database?: string;
    };
    workspaceMarker?: string | null;
    databaseMarker?: string | null;
  }) => { ok: true } | { ok: false; reason: string };
};

const MARKER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const WORKSPACE = "C:/tmp/flix-next-mariadb-phase1-20-testws";
const DATADIR = `${WORKSPACE}/data`;

function ownedEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    CMS_CONCURRENCY_MYSQL_INTEGRATION: "1",
    CMS_CONCURRENCY_ENGINE: "mariadb",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3312",
    DB_NAME: guards.APPROVED_DB_NAME,
    DB_USER: "flix_cms_mdb_test",
    DB_PASSWORD: "test-only-not-real",
    [guards.OWNERSHIP_MARKER_ENV]: MARKER,
    [guards.OWNERSHIP_DATADIR_ENV]: DATADIR,
    [guards.OWNERSHIP_WORKSPACE_ENV]: WORKSPACE,
    ...overrides,
  };
}

function ownedServer(overrides: Record<string, string | number | undefined> = {}) {
  return {
    version: "11.8.9-MariaDB",
    port: 3312,
    bindAddress: "127.0.0.1",
    datadir: DATADIR,
    database: guards.APPROVED_DB_NAME,
    ...overrides,
  };
}

test("MDB-C01 — MySQL 8 version rejected by MariaDB guards", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer({ version: "8.0.46" }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /MariaDB 11\.8\.9/i);
});

test("MDB-C02 — Port 3307 rejected", () => {
  const r = guards.validateDisposableMysqlTarget(ownedEnv({ DB_PORT: "3307" }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /3312|port/i);
});

test("MDB-C03 — Missing CMS_CONCURRENCY_ENGINE=mariadb fails closed", () => {
  const r = guards.validateDisposableMysqlTarget(ownedEnv({ CMS_CONCURRENCY_ENGINE: "mysql" }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /mariadb/i);
});

test("MDB-C04 — Owned MariaDB 11.8.9 instance passes", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer(),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, true);
});

test("MDB-C05 — Production-like host rejected", () => {
  const r = guards.validateDisposableMysqlTarget(ownedEnv({ DB_HOST: "srv497.hstgr.io" }));
  assert.equal(r.ok, false);
});
