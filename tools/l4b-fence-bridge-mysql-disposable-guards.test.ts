import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  FORBIDDEN_DB_NAMES,
  clearAmbientDbEnv,
  validateL4bFenceBridgeMysqlTarget,
} = require("./l4b-fence-bridge-mysql-disposable-guards.cjs") as {
  APPROVED_DB_NAME: string;
  APPROVED_PORT: string;
  FORBIDDEN_DB_NAMES: Set<string>;
  clearAmbientDbEnv: (env: Record<string, string | undefined>) => void;
  validateL4bFenceBridgeMysqlTarget: (env: Record<string, string | undefined>) =>
    | { ok: true; host: string; port: string; database: string; user: string }
    | { ok: false; reason: string };
};

test("fence-bridge guard requires opt-in and exact DB name", () => {
  assert.equal(APPROVED_DB_NAME, "flix_l4b_fence_bridge_rc");
  assert.equal(APPROVED_PORT, "3310");
  assert.ok(FORBIDDEN_DB_NAMES.has("flix_ledger_l1_disposable"));
  assert.ok(FORBIDDEN_DB_NAMES.has("flix_l4b_tx_runtime_rc"));

  const base = {
    L4B_FENCE_BRIDGE_MYSQL_VALIDATION: "1",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3310",
    DB_NAME: "flix_l4b_fence_bridge_rc",
    DB_USER: "tester",
    DB_PASSWORD: "x",
  };
  const ok = validateL4bFenceBridgeMysqlTarget(base);
  assert.equal(ok.ok, true);

  const ledger = validateL4bFenceBridgeMysqlTarget({
    ...base,
    DB_NAME: "flix_ledger_l1_disposable",
  });
  assert.equal(ledger.ok, false);
  assert.match(String((ledger as { reason: string }).reason), /forbidden|exactly/i);

  const noOpt = validateL4bFenceBridgeMysqlTarget({
    ...base,
    L4B_FENCE_BRIDGE_MYSQL_VALIDATION: "0",
  });
  assert.equal(noOpt.ok, false);
});

test("clearAmbientDbEnv strips DB credentials", () => {
  const env: Record<string, string | undefined> = {
    DB_HOST: "127.0.0.1",
    DB_NAME: "x",
    DATABASE_URL: "mysql://x",
  };
  clearAmbientDbEnv(env);
  assert.equal(env.DB_HOST, undefined);
  assert.equal(env.DATABASE_URL, undefined);
});
