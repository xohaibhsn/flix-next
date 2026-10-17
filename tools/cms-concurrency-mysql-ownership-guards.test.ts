/**
 * CONCURRENCY-13 Finding C — disposable MySQL ownership / isolation guards (offline).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const guards = require("./cms-concurrency-mysql-disposable-guards.cjs") as {
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
  assertDestructiveSqlAllowed: (
    ownership: { ok: boolean; reason?: string },
    sql: string,
  ) => void;
  isDestructiveFixtureSql: (sql: string) => boolean;
  normalizeDatadir: (value: string) => string;
};

const MARKER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WORKSPACE = "C:/tmp/flix-next-mysql-phase1-13-testws";
const DATADIR = `${WORKSPACE}/data`;

function ownedEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    CMS_CONCURRENCY_MYSQL_INTEGRATION: "1",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3307",
    DB_NAME: guards.APPROVED_DB_NAME,
    DB_USER: "flix_cms_test",
    DB_PASSWORD: "test-only-not-real",
    [guards.OWNERSHIP_MARKER_ENV]: MARKER,
    [guards.OWNERSHIP_DATADIR_ENV]: DATADIR,
    [guards.OWNERSHIP_WORKSPACE_ENV]: WORKSPACE,
    ...overrides,
  };
}

function ownedServer(overrides: Record<string, string | number | undefined> = {}) {
  return {
    version: "8.0.46",
    port: 3307,
    bindAddress: "127.0.0.1",
    datadir: DATADIR,
    database: guards.APPROVED_DB_NAME,
    ...overrides,
  };
}

test("C01 — Wrong datadir fails closed", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer({ datadir: "C:/other/mysql/data" }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /datadir/i);
});

test("C02 — Missing marker fails closed", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer(),
    workspaceMarker: null,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /workspace ownership marker missing/i);

  const r2 = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer(),
    workspaceMarker: MARKER,
    databaseMarker: null,
  });
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /database ownership marker missing/i);
});

test("C03 — Mismatched marker fails closed", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer(),
    workspaceMarker: MARKER,
    databaseMarker: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /mismatch/i);
});

test("C04 — Wrong database fails closed", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer({ database: "production_cms" }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /DATABASE/i);
});

test("C05 — Wrong port/host fails closed", () => {
  const envPort = guards.validateDisposableMysqlTarget(ownedEnv({ DB_PORT: "3306" }));
  assert.equal(envPort.ok, false);

  const envHost = guards.validateDisposableMysqlTarget(ownedEnv({ DB_HOST: "hostinger.example" }));
  assert.equal(envHost.ok, false);

  const livePort = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer({ port: 3310 }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(livePort.ok, false);
  assert.match(livePort.reason, /port/i);
});

test("C06 — Existing unowned instance on port 3307 (wrong datadir/marker) refused", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer({
      datadir: "C:/ProgramData/MySQL/MySQL Server 8.0/Data",
    }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, false);
});

test("C07 — Missing environment isolation fails closed", () => {
  const noOptIn = guards.validateDisposableMysqlTarget(
    ownedEnv({ CMS_CONCURRENCY_MYSQL_INTEGRATION: undefined }),
  );
  assert.equal(noOptIn.ok, false);

  const noDatadir = guards.validateOwnedDisposableInstance({
    env: ownedEnv({ [guards.OWNERSHIP_DATADIR_ENV]: undefined }),
    server: ownedServer(),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(noDatadir.ok, false);
  assert.match(noDatadir.reason, /DATADIR/i);
});

test("C08 — Ownership failure causes ZERO destructive SQL authorization", () => {
  const bad = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer({ datadir: "C:/evil/data" }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(bad.ok, false);
  assert.equal(guards.isDestructiveFixtureSql("DELETE FROM pages"), true);
  assert.throws(
    () => guards.assertDestructiveSqlAllowed(bad, "DELETE FROM pages"),
    /OWNERSHIP_BLOCKED/,
  );
  assert.throws(
    () => guards.assertDestructiveSqlAllowed(bad, "SET FOREIGN_KEY_CHECKS=0"),
    /OWNERSHIP_BLOCKED/,
  );
});

test("C09 — Correctly owned fresh instance permits synthetic fixture setup", () => {
  const r = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer(),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  assert.equal(r.ok, true);
  assert.doesNotThrow(() =>
    guards.assertDestructiveSqlAllowed(r, "DELETE FROM pages"),
  );
});

test("C10 — Marker/connection failure never falls back to Hostinger or other DB", () => {
  const hostinger = guards.validateDisposableMysqlTarget(
    ownedEnv({ DB_HOST: "mysql.hostinger.com" }),
  );
  assert.equal(hostinger.ok, false);

  const otherDb = guards.validateOwnedDisposableInstance({
    env: ownedEnv({ DB_NAME: "theflix_production" }),
    server: ownedServer({ database: "theflix_production" }),
    workspaceMarker: MARKER,
    databaseMarker: MARKER,
  });
  // Env gate fails first on DB name
  assert.equal(otherDb.ok, false);

  // No alternate host/db accepted when marker missing — still fail closed
  const missing = guards.validateOwnedDisposableInstance({
    env: ownedEnv(),
    server: ownedServer(),
    workspaceMarker: "",
    databaseMarker: "",
  });
  assert.equal(missing.ok, false);
  assert.doesNotMatch(JSON.stringify(missing), /hostinger|fallback|retry/i);
});

test("normalizeDatadir is case/slash tolerant on Windows paths", () => {
  assert.equal(
    guards.normalizeDatadir("C:\\Tmp\\Data\\"),
    guards.normalizeDatadir("c:/tmp/data"),
  );
});
