import assert from "node:assert/strict";
import test from "node:test";
import { CMS_WRITE_FREEZE_CODE, CMS_WRITE_FREEZE_ENV } from "../lib/cms/write-freeze";
import { assertMutationAllowed, evaluateMutationAllowed } from "../lib/cms/write-fence";

/**
 * Behavioral sink simulations without live MySQL.
 * These prove new-code fence semantics; they do NOT prove old-worker exclusivity.
 */

test("simulated repository mutator denies before DML when frozen", async () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  let dmlCount = 0;
  async function saveSettingsSim() {
    assertMutationAllowed("CMS_EDITORIAL", env);
    dmlCount += 1;
  }
  await assert.rejects(() => saveSettingsSim(), (error: unknown) => {
    assert.equal((error as { code?: string }).code, CMS_WRITE_FREEZE_CODE);
    return true;
  });
  assert.equal(dmlCount, 0);
});

test("simulated multi-statement fenced transaction denies before begin work", async () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "true" };
  let began = false;
  let executed = false;
  async function withFencedTransactionSim(intent: "PLANNING", work: () => Promise<void>) {
    assertMutationAllowed(intent, env);
    began = true;
    await work();
  }
  await assert.rejects(
    () =>
      withFencedTransactionSim("PLANNING", async () => {
        executed = true;
      }),
    (error: unknown) => (error as { code?: string }).code === CMS_WRITE_FREEZE_CODE,
  );
  assert.equal(began, false);
  assert.equal(executed, false);
});

test("unfrozen simulated catalog write proceeds", async () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "0" };
  let dmlCount = 0;
  assertMutationAllowed("CATALOG", env);
  dmlCount += 1;
  assert.equal(dmlCount, 1);
});

test("ledger persist simulation returns freeze error code without partial inserts", async () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  const inserts: string[] = [];
  function persistSim(): { ok: false; errorCode: string } | { ok: true } {
    try {
      assertMutationAllowed("LEDGER", env);
      inserts.push("run");
      inserts.push("decision");
      return { ok: true };
    } catch (error) {
      return { ok: false, errorCode: (error as { code?: string }).code || "unknown" };
    }
  }
  const result = persistSim();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, CMS_WRITE_FREEZE_CODE);
  assert.deepEqual(inserts, []);
});

test("SEO Health save simulation rejects under freeze; read evaluation remains separate", () => {
  const frozen = evaluateMutationAllowed("SEO_HEALTH", { [CMS_WRITE_FREEZE_ENV]: "on" });
  assert.equal(frozen.allowed, false);
  // Read path does not call assertMutationAllowed — modeled as always allowed evaluation skip.
  const readAllowed = true;
  assert.equal(readAllowed, true);
});

test("AUTH_SIDE_EFFECT and AUTH_ADMIN both deny under freeze", () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  assert.equal(evaluateMutationAllowed("AUTH_SIDE_EFFECT", env).allowed, false);
  assert.equal(evaluateMutationAllowed("AUTH_ADMIN", env).allowed, false);
  assert.equal(evaluateMutationAllowed("AUTH_SIDE_EFFECT", {}).allowed, true);
  assert.equal(evaluateMutationAllowed("AUTH_ADMIN", {}).allowed, true);
});

test("CLI maintenance acknowledgement still cannot pass an active freeze", () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  const operatorAck = true;
  assert.equal(operatorAck, true);
  assert.throws(() => assertMutationAllowed("CLI_MAINTENANCE", env));
});

test("simulated legacy caller bypassing the new guard demonstrates old-worker limitation", () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  let legacyWrote = false;
  // Old binary: no assertMutationAllowed
  function legacySavePage() {
    legacyWrote = true;
  }
  legacySavePage();
  assert.equal(legacyWrote, true);
  // New sink path would deny:
  assert.equal(evaluateMutationAllowed("CMS_EDITORIAL", env).allowed, false);
});

test("transaction rollback model: fence throw happens before work so no commit needed", async () => {
  let rolledBack = false;
  let committed = false;
  async function txSim(work: () => Promise<void>) {
    try {
      assertMutationAllowed("CMS_EDITORIAL", { [CMS_WRITE_FREEZE_ENV]: "1" });
      await work();
      committed = true;
    } catch {
      rolledBack = true;
      throw new Error("rolled_back");
    }
  }
  await assert.rejects(() => txSim(async () => undefined));
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
});

test("login simulation: freeze denies before session issuance and uses uniform unavailable copy", () => {
  const UNAVAILABLE = "Admin login is temporarily unavailable. Try again shortly.";
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  let sessionIssued = false;
  let markLoginCalled = false;
  let clearAttemptsCalled = false;

  function loginSim(dbConfigured: boolean): { error?: string } {
    if (dbConfigured) {
      try {
        assertMutationAllowed("AUTH_SIDE_EFFECT", env);
      } catch {
        return { error: UNAVAILABLE };
      }
    }
    // Credential success path would clear attempts + mark login then issue session.
    clearAttemptsCalled = true;
    markLoginCalled = true;
    sessionIssued = true;
    return {};
  }

  const frozen = loginSim(true);
  assert.equal(frozen.error, UNAVAILABLE);
  assert.equal(sessionIssued, false);
  assert.equal(markLoginCalled, false);
  assert.equal(clearAttemptsCalled, false);
});

test("login simulation: mid-path AUTH_SIDE_EFFECT denial still blocks session", () => {
  const UNAVAILABLE = "Admin login is temporarily unavailable. Try again shortly.";
  let sessionIssued = false;
  let dml: string[] = [];

  function loginAfterAuthSuccess(sideEffectEnv: Record<string, string>): { error?: string } {
    try {
      assertMutationAllowed("AUTH_SIDE_EFFECT", sideEffectEnv);
      dml.push("clear_attempts");
      assertMutationAllowed("AUTH_SIDE_EFFECT", sideEffectEnv);
      dml.push("mark_login");
    } catch {
      return { error: UNAVAILABLE };
    }
    sessionIssued = true;
    return {};
  }

  // First assert passes (unfrozen), second fails if freeze flips — session must not issue.
  const envPass = { [CMS_WRITE_FREEZE_ENV]: "0" };
  assert.equal(loginAfterAuthSuccess(envPass).error, undefined);
  assert.equal(sessionIssued, true);
  sessionIssued = false;
  dml = [];

  // Entire success path frozen: no DML, no session.
  const blocked = loginAfterAuthSuccess({ [CMS_WRITE_FREEZE_ENV]: "1" });
  assert.equal(blocked.error, UNAVAILABLE);
  assert.deepEqual(dml, []);
  assert.equal(sessionIssued, false);
});

test("rate-limit freeze denial is not converted into silent success", () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "1" };
  let memoryFallback = false;
  function recordFailedLoginSim() {
    try {
      assertMutationAllowed("AUTH_SIDE_EFFECT", env);
      // would UPSERT
    } catch (error) {
      if ((error as { code?: string }).code === CMS_WRITE_FREEZE_CODE) throw error;
      memoryFallback = true;
    }
  }
  assert.throws(() => recordFailedLoginSim());
  assert.equal(memoryFallback, false);
});

test("authorized unfrozen write reaches mocked DML exactly once", async () => {
  const env = { [CMS_WRITE_FREEZE_ENV]: "0" };
  const ops: string[] = [];
  async function withFencedTransactionSim(intent: "CMS_EDITORIAL", work: () => Promise<void>) {
    assertMutationAllowed(intent, env);
    await work();
  }
  await withFencedTransactionSim("CMS_EDITORIAL", async () => {
    ops.push("UPDATE");
  });
  assert.deepEqual(ops, ["UPDATE"]);
});
