/**
 * CONCURRENCY-13 Finding A — advisory-lock fast-path RELEASE_LOCK propagation.
 * Behavioral tests with injectable fake connections (no MySQL).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  runWithCmsSchemaAdvisoryLock,
  type SchemaLockConnection,
} from "../lib/cms/schema-advisory-lock";

function fakeConn(opts: {
  getLock?: unknown;
  releaseLock?: unknown;
  releaseThrows?: boolean;
  getLockThrows?: boolean;
}) {
  const conn: SchemaLockConnection & {
    releasedToPool: boolean;
    destroyed: boolean;
    releaseCalls: number;
    destroyCalls: number;
    queries: string[];
  } = {
    releasedToPool: false,
    destroyed: false,
    releaseCalls: 0,
    destroyCalls: 0,
    queries: [],
    async query(sql: string): Promise<[unknown, unknown]> {
      conn.queries.push(sql);
      if (sql.includes("GET_LOCK")) {
        if (opts.getLockThrows) throw new Error("get_lock failed");
        return [[{ acquired: opts.getLock }], []];
      }
      if (sql.includes("RELEASE_LOCK")) {
        if (opts.releaseThrows) throw new Error("release_lock failed");
        return [[{ released: opts.releaseLock }], []];
      }
      return [[], []];
    },
    release() {
      conn.releaseCalls += 1;
      conn.releasedToPool = true;
    },
    destroy() {
      conn.destroyCalls += 1;
      conn.destroyed = true;
    },
  };
  return conn;
}

test("A01 — Fast-path success: no DDL, RELEASE_LOCK 1, release once", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 1 });
  let ensured = 0;
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => conn,
    readIsFastPath: async () => true,
    ensureSchema: async () => {
      ensured += 1;
    },
  });
  assert.equal(ensured, 0);
  assert.equal(conn.releasedToPool, true);
  assert.equal(conn.destroyed, false);
  assert.equal(conn.releaseCalls, 1);
  assert.equal(conn.destroyCalls, 0);
  assert.ok(conn.queries.some((q) => q.includes("GET_LOCK")));
  assert.ok(conn.queries.some((q) => q.includes("RELEASE_LOCK")));
});

test("A02 — Fast-path RELEASE_LOCK throws: reject, destroy, no pool reuse, no DDL", async () => {
  const conn = fakeConn({ getLock: 1, releaseThrows: true });
  let ensured = 0;
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => true,
        ensureSchema: async () => {
          ensured += 1;
        },
      }),
    /not released cleanly/i,
  );
  assert.equal(ensured, 0);
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
  assert.equal(conn.destroyCalls, 1);
  assert.equal(conn.releaseCalls, 0);
});

test("A03 — Fast-path RELEASE_LOCK returns 0: reject + destroy", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 0 });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => true,
        ensureSchema: async () => undefined,
      }),
    /not released cleanly/i,
  );
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
});

test("A04 — Fast-path RELEASE_LOCK returns NULL: reject + destroy", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: null });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => true,
        ensureSchema: async () => undefined,
      }),
    /not released cleanly/i,
  );
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
});

test("A05 — Full ensure succeeds and release succeeds", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 1 });
  let ensured = 0;
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => conn,
    readIsFastPath: async () => false,
    ensureSchema: async () => {
      ensured += 1;
    },
  });
  assert.equal(ensured, 1);
  assert.equal(conn.releasedToPool, true);
  assert.equal(conn.destroyed, false);
  assert.equal(conn.releaseCalls, 1);
});

test("A06 — Full ensure succeeds but release fails", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 0 });
  let ensured = 0;
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => {
          ensured += 1;
        },
      }),
    /not released cleanly/i,
  );
  assert.equal(ensured, 1);
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
});

test("A07 — Full ensure fails but release succeeds: original error", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 1 });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => {
          throw new Error("ddl failed");
        },
      }),
    /ddl failed/,
  );
  assert.equal(conn.releasedToPool, true);
  assert.equal(conn.destroyed, false);
});

test("A08 — Full ensure fails and release fails: cleanup not lost; cause inspectable", async () => {
  const conn = fakeConn({ getLock: 1, releaseThrows: true });
  let caught: unknown;
  try {
    await runWithCmsSchemaAdvisoryLock({
      getConnection: async () => conn,
      readIsFastPath: async () => false,
      ensureSchema: async () => {
        throw new Error("ddl exploded");
      },
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /not released cleanly/i);
  assert.ok(caught.cause instanceof Error);
  assert.match((caught.cause as Error).message, /ddl exploded/);
  assert.doesNotMatch(caught.message, /password|secret|sk-/i);
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
});

test("A09 — GET_LOCK timeout/failure: no ensure, no destroy of unacquired lock path", async () => {
  const conn = fakeConn({ getLock: 0 });
  let ensured = 0;
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => {
          ensured += 1;
        },
      }),
    /could not acquire/i,
  );
  assert.equal(ensured, 0);
  assert.equal(conn.releasedToPool, true);
  assert.equal(conn.destroyed, false);
  assert.equal(conn.queries.some((q) => q.includes("RELEASE_LOCK")), false);
});

test("A10 — No duplicate cleanup: exactly one release or destroy decision", async () => {
  const ok = fakeConn({ getLock: 1, releaseLock: 1 });
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => ok,
    readIsFastPath: async () => true,
    ensureSchema: async () => undefined,
  });
  assert.equal(ok.releaseCalls + ok.destroyCalls, 1);

  const bad = fakeConn({ getLock: 1, releaseLock: 0 });
  await assert.rejects(() =>
    runWithCmsSchemaAdvisoryLock({
      getConnection: async () => bad,
      readIsFastPath: async () => true,
      ensureSchema: async () => undefined,
    }),
  );
  assert.equal(bad.releaseCalls + bad.destroyCalls, 1);
  assert.equal(bad.destroyCalls, 1);
});
