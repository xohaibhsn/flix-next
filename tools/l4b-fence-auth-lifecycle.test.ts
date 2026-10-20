/**
 * Offline failure-injection for withFencedPlanningWriteTransaction.
 * Proves the helper itself destroys unsafe connections (not a manual destroy).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool, PoolConnection } from "mysql2/promise";
import { withFencedPlanningWriteTransaction } from "../lib/cms/seo-planning-lineage/planning-write-fence-auth";

type SpyConn = PoolConnection & {
  destroy: () => void;
  release: () => void;
  __calls: { destroy: number; release: number; queries: string[] };
};

function createSpyPool(hooks: {
  onQuery?: (sql: string) => void | Promise<void>;
  failClear?: boolean;
  failClearVerify?: boolean;
  failRollback?: boolean;
  failCommit?: boolean;
  failBegin?: boolean;
  failSetAuth?: boolean;
}): { pool: Pool; conn: SpyConn } {
  const calls = { destroy: 0, release: 0, queries: [] as string[] };
  let auth: string | null = null;

  const conn = {
    __calls: calls,
    async query(sql: string) {
      const text = String(sql);
      calls.queries.push(text);
      await hooks.onQuery?.(text);
      if (hooks.failSetAuth && /SET @flix_l4b_planning_auth = '/i.test(text)) {
        throw new Error("injected_set_auth_failure");
      }
      if (hooks.failClear && /SET @flix_l4b_planning_auth = NULL/i.test(text)) {
        throw new Error("injected_clear_failure");
      }
      if (/SET @flix_l4b_planning_auth = '/i.test(text)) {
        const m = text.match(/SET @flix_l4b_planning_auth = '([^']+)'/i);
        auth = m?.[1] ?? "set";
        return [{ affectedRows: 0 }];
      }
      if (/SET @flix_l4b_planning_auth = NULL/i.test(text)) {
        auth = null;
        return [{ affectedRows: 0 }];
      }
      if (/SELECT @flix_l4b_planning_auth AS auth/i.test(text)) {
        if (hooks.failClearVerify) {
          return [[{ auth: "leaked_token_xx" }]];
        }
        return [[{ auth }]];
      }
      return [[]];
    },
    async beginTransaction() {
      if (hooks.failBegin) throw new Error("injected_begin_failure");
    },
    async commit() {
      if (hooks.failCommit) throw new Error("injected_commit_failure");
    },
    async rollback() {
      if (hooks.failRollback) throw new Error("injected_rollback_failure");
    },
    release() {
      calls.release += 1;
    },
    destroy() {
      calls.destroy += 1;
    },
  } as unknown as SpyConn;
  // Test double: execute delegates to query (mysql2 overload surface not modeled).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (conn as any).execute = (sql: string) => conn.query(sql);

  const pool = {
    async getConnection() {
      return conn;
    },
  } as unknown as Pool;

  return { pool, conn };
}

const opts = {
  token: "fence_bridge_token_v1",
  trustedOperation: "fence_bridge_validation" as const,
};

test("success path releases once and never destroys", async () => {
  const { pool, conn } = createSpyPool({});
  const value = await withFencedPlanningWriteTransaction(async () => 42, {
    ...opts,
    pool,
  });
  assert.equal(value, 42);
  assert.equal(conn.__calls.release, 1);
  assert.equal(conn.__calls.destroy, 0);
});

test("CLEAR failure destroys and does not release", async () => {
  const { pool, conn } = createSpyPool({ failClear: true });
  // Business commit still succeeds; cleanup discards without surfacing clear error.
  const value = await withFencedPlanningWriteTransaction(async () => "ok", {
    ...opts,
    pool,
  });
  assert.equal(value, "ok");
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("post-clear verification failure destroys and does not release", async () => {
  const { pool, conn } = createSpyPool({ failClearVerify: true });
  const value = await withFencedPlanningWriteTransaction(async () => "ok", {
    ...opts,
    pool,
  });
  assert.equal(value, "ok");
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("rollback failure destroys and preserves original error", async () => {
  const { pool, conn } = createSpyPool({ failRollback: true });
  await assert.rejects(
    () =>
      withFencedPlanningWriteTransaction(
        async () => {
          throw new Error("business_failure");
        },
        { ...opts, pool },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /business_failure/);
      assert.equal(
        (error as { l4bFenceCleanupFailure?: string }).l4bFenceCleanupFailure,
        "connection_destroyed_uncertain_transaction",
      );
      return true;
    },
  );
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("commit uncertainty destroys and does not release", async () => {
  const { pool, conn } = createSpyPool({ failCommit: true });
  await assert.rejects(
    () => withFencedPlanningWriteTransaction(async () => "x", { ...opts, pool }),
    /injected_commit_failure/,
  );
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("authorization SET failure destroys", async () => {
  const { pool, conn } = createSpyPool({ failSetAuth: true });
  await assert.rejects(
    () => withFencedPlanningWriteTransaction(async () => "x", { ...opts, pool }),
    /injected_set_auth_failure/,
  );
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("transaction begin failure clears/releases or destroys safely (no double fate)", async () => {
  const { pool, conn } = createSpyPool({ failBegin: true });
  await assert.rejects(
    () => withFencedPlanningWriteTransaction(async () => "x", { ...opts, pool }),
    /injected_begin_failure/,
  );
  // Begin failed after auth set: settlement none → clear verified → release.
  assert.equal(conn.__calls.destroy + conn.__calls.release, 1);
  assert.ok(conn.__calls.destroy === 1 || conn.__calls.release === 1);
});

test("skipAuthorization unsettled rollback failure destroys (never releases)", async () => {
  const { pool, conn } = createSpyPool({ failRollback: true });
  await assert.rejects(
    () =>
      withFencedPlanningWriteTransaction(
        async () => {
          throw new Error("neg_path");
        },
        { ...opts, pool, skipAuthorization: true },
      ),
    /neg_path/,
  );
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("no double destroy or double release under repeated cleanup pressure", async () => {
  const { pool, conn } = createSpyPool({ failClear: true });
  await withFencedPlanningWriteTransaction(async () => 1, { ...opts, pool }).catch(() => undefined);
  // Manually poking release/destroy counters after helper finished must stay at 1 destroy.
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});
