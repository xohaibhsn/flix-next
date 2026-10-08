/**
 * Fail-closed disposable MySQL target guards (no DB connection).
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  clearAmbientDbEnv,
  validateDisposableMysqlTarget,
} = require("./ledger-mysql-disposable-guards.cjs") as {
  APPROVED_DB_NAME: string;
  APPROVED_PORT: string;
  clearAmbientDbEnv: (env: Record<string, string | undefined>) => void;
  validateDisposableMysqlTarget: (env: Record<string, string | undefined>) =>
    | { ok: true; host: string; port: string; database: string; user: string }
    | { ok: false; reason: string };
};

function baseOk(overrides: Record<string, string | undefined> = {}) {
  return {
    LEDGER_MYSQL_INTEGRATION: "1",
    DB_HOST: "127.0.0.1",
    DB_PORT: APPROVED_PORT,
    DB_NAME: APPROVED_DB_NAME,
    DB_USER: "ledger_l1_tester",
    DB_PASSWORD: "not-a-real-secret",
    ...overrides,
  };
}

test("guards approve exact disposable loopback target", () => {
  const gate = validateDisposableMysqlTarget(baseOk());
  assert.equal(gate.ok, true);
  if (!gate.ok) return;
  assert.equal(gate.database, "flix_ledger_l1_disposable");
  assert.equal(gate.port, "3310");
  assert.equal(gate.host, "127.0.0.1");
});

test("guards reject missing opt-in", () => {
  const gate = validateDisposableMysqlTarget(baseOk({ LEDGER_MYSQL_INTEGRATION: undefined }));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /opt-in/i);
});

test("guards reject remote Hostinger-shaped host", () => {
  const gate = validateDisposableMysqlTarget(
    baseOk({ DB_HOST: "mysql.hostinger.com" }),
  );
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /loopback|remote|production/i);
});

test("guards reject non-approved database name even if disposable-looking", () => {
  const gate = validateDisposableMysqlTarget(baseOk({ DB_NAME: "disposable_other" }));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /exactly flix_ledger_l1_disposable/);
});

test("guards reject default MySQL port 3306", () => {
  const gate = validateDisposableMysqlTarget(baseOk({ DB_PORT: "3306" }));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /3310|3306/);
});

test("guards reject incomplete credentials", () => {
  const gate = validateDisposableMysqlTarget(baseOk({ DB_PASSWORD: "" }));
  assert.equal(gate.ok, false);
});

test("clearAmbientDbEnv strips production-like DB keys", () => {
  const env: Record<string, string | undefined> = {
    DB_HOST: "mysql.hostinger.com",
    DB_NAME: "production_cms",
    DB_USER: "prod",
    DB_PASSWORD: "secret",
    DATABASE_URL: "mysql://x",
    KEEP: "yes",
  };
  clearAmbientDbEnv(env);
  assert.equal(env.DB_HOST, undefined);
  assert.equal(env.DB_NAME, undefined);
  assert.equal(env.DB_PASSWORD, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.KEEP, "yes");
});

test("launcher and integration files wire fail-closed guards", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.join(__dirname, "..");
  const launcher = fs.readFileSync(
    path.join(root, "tools/run-ledger-mysql-integration.cjs"),
    "utf8",
  );
  const integration = fs.readFileSync(
    path.join(root, "tools/seo-experiment-ledger-mysql.integration.ts"),
    "utf8",
  );
  assert.match(launcher, /clearAmbientDbEnv/);
  assert.match(launcher, /validateDisposableMysqlTarget/);
  assert.match(launcher, /ledger-mysql-disposable-guards/);
  assert.match(integration, /validateDisposableMysqlTarget/);
  assert.match(integration, /assertDisposableTarget/);
  assert.match(integration, /Filename intentionally avoids/);
  assert.doesNotMatch(launcher, /mysql\.hostinger|theflixiptv\.com/);
  assert.doesNotMatch(integration, /DB_PASSWORD\s*=\s*["'][^"']+["']/);
  assert.match(
    fs.readFileSync(path.join(root, "tools/run-ledger-mysql-integration.cjs"), "utf8"),
    /seo-experiment-ledger-mysql\.integration\.ts/,
  );
});
