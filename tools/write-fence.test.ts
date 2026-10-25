import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  APP_WRITE_GENERATION_ENV,
  assertMutationAllowed,
  CMS_WRITE_ALLOWED_GENERATION_ENV,
  CMS_WRITE_GENERATION_ENFORCE_ENV,
  evaluateMutationAllowed,
  evaluateWriteGeneration,
  isMutationIntent,
  isWriteGenerationEnforceActive,
  MUTATION_INTENTS,
} from "../lib/cms/write-fence";
import {
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_ENV,
  CMS_WRITE_FREEZE_MESSAGE,
  isCmsWriteFreezeError,
} from "../lib/cms/write-freeze";

test("mutation intents are exhaustive and typed", () => {
  assert.equal(MUTATION_INTENTS.includes("CMS_EDITORIAL"), true);
  assert.equal(MUTATION_INTENTS.includes("AUTH_SIDE_EFFECT"), true);
  assert.equal(MUTATION_INTENTS.includes("CLI_MAINTENANCE"), true);
  assert.equal(isMutationIntent("PLANNING"), true);
  assert.equal(isMutationIntent("not-a-real-intent"), false);
  assert.equal(isMutationIntent(null), false);
});

test("evaluateMutationAllowed allows writes when freeze inactive and generation unarmed", () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "0" };
  const result = evaluateMutationAllowed("CATALOG", env);
  assert.equal(result.allowed, true);
  if (result.allowed) assert.equal(result.intent, "CATALOG");
});

test("evaluateMutationAllowed denies on active freeze with freeze_active reason", () => {
  const result = evaluateMutationAllowed("LEDGER", { [CMS_WRITE_FREEZE_ENV]: "1" });
  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.reason, "freeze_active");
    assert.equal(result.freezeActive, true);
    assert.equal(result.intent, "LEDGER");
  }
});

test("evaluateMutationAllowed denies unknown intent fail-closed", () => {
  const result = evaluateMutationAllowed("TOTALLY_UNKNOWN", {});
  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.reason, "invalid_intent");
    assert.equal(result.intent, null);
  }
});

test("assertMutationAllowed throws CmsWriteFreezeError compatible with existing code", () => {
  assert.doesNotThrow(() => assertMutationAllowed("CMS_EDITORIAL", { [CMS_WRITE_FREEZE_ENV]: "0" }));
  assert.throws(
    () => assertMutationAllowed("CMS_EDITORIAL", { [CMS_WRITE_FREEZE_ENV]: "yes" }),
    (error: unknown) => {
      assert.equal(isCmsWriteFreezeError(error), true);
      assert.equal((error as { code?: string }).code, CMS_WRITE_FREEZE_CODE);
      assert.equal((error as Error).message, CMS_WRITE_FREEZE_MESSAGE);
      assert.equal((error as { fenceReason?: string }).fenceReason, "freeze_active");
      return true;
    },
  );
});

test("assertMutationAllowed rejects invalid intent with sanitized freeze error", () => {
  assert.throws(
    () => assertMutationAllowed("NOPE" as never, {}),
    (error: unknown) => {
      assert.equal(isCmsWriteFreezeError(error), true);
      assert.equal((error as { fenceReason?: string }).fenceReason, "invalid_intent");
      assert.equal((error as Error).message, CMS_WRITE_FREEZE_MESSAGE);
      return true;
    },
  );
});

test("generation enforce is inactive by default and does not break ordinary writes", () => {
  assert.equal(isWriteGenerationEnforceActive({}), false);
  assert.deepEqual(evaluateWriteGeneration({}), { ok: true });
  assert.equal(evaluateMutationAllowed("AUTH_ADMIN", {}).allowed, true);
});

test("armed generation fails closed on missing tokens", () => {
  const env = {
    [CMS_WRITE_GENERATION_ENFORCE_ENV]: "1",
  };
  const missing = evaluateWriteGeneration(env);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "generation_missing");

  assert.throws(
    () => assertMutationAllowed("CATALOG", env),
    (error: unknown) => {
      assert.equal((error as { fenceReason?: string }).fenceReason, "generation_missing");
      return true;
    },
  );
});

test("armed generation fails closed on stale worker token", () => {
  const env = {
    [CMS_WRITE_GENERATION_ENFORCE_ENV]: "on",
    [CMS_WRITE_ALLOWED_GENERATION_ENV]: "gen-a",
    [APP_WRITE_GENERATION_ENV]: "gen-b",
  };
  const stale = evaluateWriteGeneration(env);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "generation_stale");
});

test("armed generation allows matching tokens", () => {
  const env = {
    [CMS_WRITE_GENERATION_ENFORCE_ENV]: "true",
    [CMS_WRITE_ALLOWED_GENERATION_ENV]: "cutover-2026-10",
    [APP_WRITE_GENERATION_ENV]: "cutover-2026-10",
  };
  assert.deepEqual(evaluateWriteGeneration(env), { ok: true });
  assert.doesNotThrow(() => assertMutationAllowed("PLANNING", env));
});

test("armed generation rejects malformed tokens", () => {
  const env = {
    [CMS_WRITE_GENERATION_ENFORCE_ENV]: "1",
    [CMS_WRITE_ALLOWED_GENERATION_ENV]: "bad token!",
    [APP_WRITE_GENERATION_ENV]: "bad token!",
  };
  const result = evaluateWriteGeneration(env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "generation_enforce_misconfigured");
});

test("sink mutators wire assertMutationAllowed or withFencedTransaction", () => {
  const root = process.cwd();
  const repo = readFileSync(path.join(root, "lib/cms/mysql-repository.ts"), "utf8");
  const catalog = readFileSync(path.join(root, "lib/cms/mysql-catalog.ts"), "utf8");
  const ledger = readFileSync(path.join(root, "lib/cms/seo-experiment-ledger/persist-mysql.ts"), "utf8");
  const health = readFileSync(path.join(root, "lib/cms/seo-health-state.ts"), "utf8");
  const admin = readFileSync(path.join(root, "lib/auth/admin-users.ts"), "utf8");
  const rate = readFileSync(path.join(root, "lib/auth/rate-limit.ts"), "utf8");
  const wp = readFileSync(path.join(root, "lib/cms/wordpress/apply.ts"), "utf8");
  const pool = readFileSync(path.join(root, "lib/db/pool.ts"), "utf8");

  assert.match(pool, /export async function withFencedTransaction/);
  assert.match(repo, /withFencedTransaction\("CMS_EDITORIAL"/);
  assert.match(repo, /assertMutationAllowed\("CMS_EDITORIAL"\)/);
  assert.match(catalog, /assertMutationAllowed\("CATALOG"\)/);
  assert.match(catalog, /assertMutationAllowed\("PLANNING"\)/);
  assert.match(catalog, /async handoffSeoPlanningToBlog[\s\S]*?assertMutationAllowed\("PLANNING"\)/);
  assert.match(ledger, /assertMutationAllowed\("LEDGER"\)/);
  assert.match(health, /assertMutationAllowed\("SEO_HEALTH"\)/);
  assert.match(admin, /markAdminLogin[\s\S]*?assertMutationAllowed\("AUTH_SIDE_EFFECT"\)/);
  assert.match(admin, /assertMutationAllowed\("AUTH_ADMIN"\)/);
  assert.match(admin, /assertMutationAllowed\("SCHEMA_SEED"\)/);
  assert.match(rate, /assertMutationAllowed\("AUTH_SIDE_EFFECT"\)/);
  assert.match(wp, /assertMutationAllowed\("CLI_MAINTENANCE"\)/);
});

test("loginAction early-gates AUTH_SIDE_EFFECT before session issuance", () => {
  const auth = readFileSync(path.join(process.cwd(), "lib/auth/actions.ts"), "utf8");
  const idx = auth.indexOf("export async function loginAction");
  assert.ok(idx >= 0);
  const slice = auth.slice(idx, idx + 2200);
  assert.match(slice, /assertMutationAllowed\("AUTH_SIDE_EFFECT"\)/);
  assert.match(slice, /LOGIN_TEMPORARILY_UNAVAILABLE|temporarily unavailable/i);
  assert.match(slice, /Do not issue a session|createAdminSession/);
  // Session creation must follow the side-effect try block, not precede freeze handling.
  const sessionIdx = slice.indexOf("createAdminSession");
  const fenceIdx = slice.indexOf('assertMutationAllowed("AUTH_SIDE_EFFECT")');
  assert.ok(fenceIdx >= 0 && sessionIdx > fenceIdx);
});

test("importer CLI requires acknowledgement and cannot override freeze", () => {
  const cli = readFileSync(path.join(process.cwd(), "tools/import-wordpress.ts"), "utf8");
  assert.match(cli, /i-understand-writes/);
  assert.match(cli, /assertMutationAllowed\("CLI_MAINTENANCE"\)/);
  assert.match(cli, /cannot override freeze|acknowledgement cannot override freeze/i);
});

test("documents that env fence is not old-worker exclusive", () => {
  const src = readFileSync(path.join(process.cwd(), "lib/cms/write-fence.ts"), "utf8");
  assert.match(src, /old-worker exclusivity|Does NOT provide old-worker/i);
  const pool = readFileSync(path.join(process.cwd(), "lib/db/pool.ts"), "utf8");
  assert.match(pool, /NOT DB-atomic|old binary/i);
});
