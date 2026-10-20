/**
 * Offline failure-injection for arm/disarm connection + session timeout restore.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool, PoolConnection } from "mysql2/promise";
import {
  armPlanningWriteFence,
  disarmPlanningWriteFence,
} from "../lib/cms/seo-planning-lineage/planning-write-fence-arm";

type SpyConn = PoolConnection & {
  destroy: () => void;
  release: () => void;
  __calls: { destroy: number; release: number };
};

function createArmSpyPool(hooks: {
  failRollback?: boolean;
  failCommit?: boolean;
  failRestore?: boolean;
  lockTimeout?: boolean;
  token?: string;
}): { pool: Pool; conn: SpyConn } {
  const calls = { destroy: 0, release: 0 };
  let sessionTimeout = 50;
  const expected = hooks.token ?? "fence_bridge_token_v1";

  const conn = {
    __calls: calls,
    async query(sql: string) {
      const text = String(sql);
      if (/SELECT @@SESSION\.innodb_lock_wait_timeout/i.test(text)) {
        return [[{ t: sessionTimeout }]];
      }
      if (/SET SESSION innodb_lock_wait_timeout/i.test(text)) {
        if (hooks.failRestore && /innodb_lock_wait_timeout = 50/i.test(text)) {
          throw new Error("injected_timeout_restore_failure");
        }
        const m = text.match(/innodb_lock_wait_timeout = (\d+)/i);
        if (m) sessionTimeout = Number(m[1]);
        return [{ affectedRows: 0 }];
      }
      if (/FROM seo_planning_write_fence/i.test(text) && /FOR UPDATE/i.test(text)) {
        if (hooks.lockTimeout) {
          throw Object.assign(new Error("Lock wait timeout exceeded"), {
            code: "ER_LOCK_WAIT_TIMEOUT",
          });
        }
        return [[{ id: 1, fence_active: 0, expected_token: Buffer.from(expected) }]];
      }
      return [[]];
    },
    async execute() {
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {},
    async commit() {
      if (hooks.failCommit) throw new Error("injected_arm_commit_failure");
    },
    async rollback() {
      if (hooks.failRollback) throw new Error("injected_arm_rollback_failure");
    },
    release() {
      calls.release += 1;
    },
    destroy() {
      calls.destroy += 1;
    },
  } as unknown as SpyConn;

  const pool = {
    async getConnection() {
      return conn;
    },
  } as unknown as Pool;

  return { pool, conn };
}

test("arm success restores timeout and releases once", async () => {
  const { pool, conn } = createArmSpyPool({});
  const result = await armPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
    lockWaitSeconds: 3,
  });
  assert.equal(result.ok, true);
  assert.equal(conn.__calls.release, 1);
  assert.equal(conn.__calls.destroy, 0);
});

test("arm lock timeout rolls back and releases when rollback+restore succeed", async () => {
  const { pool, conn } = createArmSpyPool({ lockTimeout: true });
  const result = await armPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
    lockWaitSeconds: 2,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, "ARM_TIMEOUT");
  assert.equal(conn.__calls.release, 1);
  assert.equal(conn.__calls.destroy, 0);
});

test("arm rollback failure destroys and does not release", async () => {
  const { pool, conn } = createArmSpyPool({ lockTimeout: true, failRollback: true });
  const result = await armPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
  });
  assert.equal(result.ok, false);
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("arm commit uncertainty destroys", async () => {
  const { pool, conn } = createArmSpyPool({ failCommit: true });
  const result = await armPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
  });
  assert.equal(result.ok, false);
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});

test("arm timeout restore failure destroys after successful arm commit", async () => {
  const { pool, conn } = createArmSpyPool({ failRestore: true });
  const result = await armPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
    lockWaitSeconds: 4,
  });
  // Commit may succeed; restore failure forces destroy.
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
  void result;
});

test("disarm success releases once", async () => {
  const { pool, conn } = createArmSpyPool({});
  const result = await disarmPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
  });
  assert.equal(result.ok, true);
  assert.equal(conn.__calls.release, 1);
  assert.equal(conn.__calls.destroy, 0);
});

test("disarm rollback failure destroys", async () => {
  const { pool, conn } = createArmSpyPool({
    token: "other_token_zzzz",
    failRollback: true,
  });
  const result = await disarmPlanningWriteFence({
    token: "fence_bridge_token_v1",
    pool,
  });
  assert.equal(result.ok, false);
  assert.equal(conn.__calls.destroy, 1);
  assert.equal(conn.__calls.release, 0);
});
