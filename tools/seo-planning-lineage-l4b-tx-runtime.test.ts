/**
 * L4B transactional runtime — focused unit contracts (no MySQL).
 * Confirms production facade stays fail-closed while harness reaches execution.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { isSeoPlanningActionableRecommendation } from "../lib/cms/seo-planning/constants";
import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "../lib/cms/seo-planning-lineage/proceed-integration";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "../lib/cms/seo-planning-lineage/schema-ddl";
import {
  L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED,
  executeTransactionalProtectedPermanentDelete,
  executeTransactionalTrustedProceedAndLink,
} from "../lib/cms/seo-planning-lineage/transactional-integration";
import {
  runTransactionalProtectedPermanentDelete,
  runTransactionalTrustedProceedAndLink,
} from "../lib/cms/seo-planning-lineage/transactional-execution";
import {
  executeTransactionalProtectedPermanentDeleteForTests,
  executeTransactionalTrustedProceedAndLinkForTests,
} from "./seo-planning-lineage-test-harness";

const require = createRequire(import.meta.url);
const root = path.join(__dirname, "..");

test("production safeguards remain OFF", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED, false);
  assert.equal(L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED, false);
});

test("production facade denies Proceed and protected delete without wiring", async () => {
  const proceed = await executeTransactionalTrustedProceedAndLink({
    actor: { authorized: true, adminId: "admin_shared" },
    ledgerRunId: "seorun_x",
    opportunityIndex: 0,
  });
  assert.equal(proceed.ok, false);
  if (!proceed.ok) {
    assert.equal(proceed.errorCode, "ACTIVATION_DENIED");
    assert.equal(proceed.linkageStatus, "SELECTION_UNAVAILABLE");
  }

  const del = await executeTransactionalProtectedPermanentDelete({
    actor: { authorized: true, adminId: "admin_shared" },
    planningDraftId: "seoplan_x",
    confirmation: "DELETE",
  });
  assert.equal(del.ok, false);
  if (!del.ok) assert.equal(del.errorCode, "ACTIVATION_DENIED");
});

test("unauthorized actor rejected before any transaction work", async () => {
  let txEntered = false;
  const proceed = await runTransactionalTrustedProceedAndLink({
    actor: { authorized: false, adminId: "admin_shared" },
    ledgerRunId: "seorun_x",
    opportunityIndex: 0,
    editorialSupplemental: {
      searchIntent: "SETUP",
      whyNow: "x",
      webEvidence: "y",
      suggestedAngle: "z",
      nextStep: "n",
    },
    ledgerReader: {
      async getSeoResearchRunDetail() {
        throw new Error("ledger must not be read for unauthorized actor");
      },
    },
    catalog: {
      listPosts: async () => [],
      listPages: async () => [],
      listCategories: async () => [],
      listActiveRedirects: async () => [],
      getSeoPlanningDraftByFingerprint: async () => null,
      saveSeoPlanningDraft: async () => {
        throw new Error("catalog save must not run");
      },
    },
    withTransactionFn: async (work) => {
      txEntered = true;
      return work({} as never);
    },
  });
  assert.equal(proceed.ok, false);
  if (!proceed.ok) assert.equal(proceed.errorCode, "UNAUTHORIZED");
  assert.equal(txEntered, false);

  const del = await runTransactionalProtectedPermanentDelete({
    actor: { authorized: false, adminId: "admin_shared" },
    planningDraftId: "seoplan_x",
    confirmation: "DELETE",
    withTransactionFn: async (work) => {
      txEntered = true;
      return work({} as never);
    },
  });
  assert.equal(del.ok, false);
  if (!del.ok) assert.equal(del.errorCode, "UNAUTHORIZED");
  assert.equal(txEntered, false);
});

test("recommendation gate separates actionable Planning from HOLD/SKIP", () => {
  assert.equal(isSeoPlanningActionableRecommendation("NEW_BLOG"), true);
  assert.equal(isSeoPlanningActionableRecommendation("REFRESH_EXISTING"), true);
  assert.equal(isSeoPlanningActionableRecommendation("HOLD"), false);
  assert.equal(isSeoPlanningActionableRecommendation("SKIP"), false);
  assert.equal(isSeoPlanningActionableRecommendation("INTERNAL_LINK"), false);
});

test("live CMS actions and barrel stay disconnected from transactional writers", () => {
  const actions = readFileSync(path.join(root, "lib/cms/seo-planning-actions.ts"), "utf8");
  assert.match(actions, /dispatchSidhuProceedToPlanning/);
  assert.match(actions, /live-wiring-dispatch/);
  assert.doesNotMatch(actions, /runTransactionalTrustedProceedAndLink/);
  assert.doesNotMatch(actions, /executeTransactionalTrustedProceedAndLink/);
  assert.doesNotMatch(actions, /transactional-execution/);
  assert.doesNotMatch(actions, /seo-planning-lineage-test-harness/);

  const index = readFileSync(path.join(root, "lib/cms/seo-planning-lineage/index.ts"), "utf8");
  assert.doesNotMatch(index, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(index, /from\s+["'][^"']*transactional-integration/);
  assert.doesNotMatch(index, /from\s+["'][^"']*live-wiring-dispatch/);

  const facade = readFileSync(
    path.join(root, "lib/cms/seo-planning-lineage/transactional-integration.ts"),
    "utf8",
  );
  assert.doesNotMatch(facade, /from\s+["'][^"']*transactional-execution/);
  assert.match(facade, /ACTIVATION_DENIED/);

  const dispatch = readFileSync(
    path.join(root, "lib/cms/seo-planning-lineage/live-wiring-dispatch.ts"),
    "utf8",
  );
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*transactional-integration/);
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*live-wiring-test-dispatch/);
  assert.doesNotMatch(dispatch, /testInjection\??:/);
  assert.match(dispatch, /SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED = false/);
  assert.match(dispatch, /productionDispatchAcceptsTestInjection: false/);
});

test("test harness wrappers reach execution without opening production facade", async () => {
  const production = await executeTransactionalTrustedProceedAndLink({
    mode: "test-harness",
    activation: true,
  });
  assert.equal(production.ok, false);
  if (!production.ok) assert.equal(production.errorCode, "ACTIVATION_DENIED");

  const harness = await executeTransactionalTrustedProceedAndLinkForTests({
    actor: { authorized: false, adminId: "admin_shared" },
    ledgerRunId: "seorun_x",
    opportunityIndex: 0,
    editorialSupplemental: {
      searchIntent: "SETUP",
      whyNow: "x",
      webEvidence: "y",
      suggestedAngle: "z",
      nextStep: "n",
    },
    ledgerReader: {
      async getSeoResearchRunDetail() {
        throw new Error("must not read ledger");
      },
    },
    catalog: {
      listPosts: async () => [],
      listPages: async () => [],
      listCategories: async () => [],
      listActiveRedirects: async () => [],
      getSeoPlanningDraftByFingerprint: async () => null,
      saveSeoPlanningDraft: async () => {
        throw new Error("must not save");
      },
    },
  });
  assert.equal(harness.ok, false);
  if (!harness.ok) {
    assert.equal(harness.errorCode, "UNAUTHORIZED");
    assert.notEqual(harness.errorCode, "ACTIVATION_DENIED");
  }

  const harnessDelete = await executeTransactionalProtectedPermanentDeleteForTests({
    actor: { authorized: false, adminId: "admin_shared" },
    planningDraftId: "seoplan_x",
    confirmation: "DELETE",
  });
  assert.equal(harnessDelete.ok, false);
  if (!harnessDelete.ok) {
    assert.equal(harnessDelete.errorCode, "UNAUTHORIZED");
    assert.notEqual(harnessDelete.errorCode, "ACTIVATION_DENIED");
  }

  void runTransactionalTrustedProceedAndLink;
  void runTransactionalProtectedPermanentDelete;
});

test("tx-runtime disposable guards refuse ledger and production-shaped targets", () => {
  const {
    APPROVED_DB_NAME,
    validateL4bTxRuntimeMysqlTarget,
  } = require("./l4b-tx-runtime-mysql-disposable-guards.cjs") as {
    APPROVED_DB_NAME: string;
    validateL4bTxRuntimeMysqlTarget: (
      env: NodeJS.ProcessEnv | Record<string, string | undefined>,
    ) => { ok: true } | { ok: false; reason: string };
  };

  assert.equal(APPROVED_DB_NAME, "flix_l4b_tx_runtime_rc");

  const missing = validateL4bTxRuntimeMysqlTarget({});
  assert.equal(missing.ok, false);

  const ledgerName = validateL4bTxRuntimeMysqlTarget({
    L4B_TX_RUNTIME_MYSQL_VALIDATION: "1",
    L4B_TX_RUNTIME_MYSQL_USE_LOCAL_ROOT: "1",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3310",
    DB_NAME: "flix_ledger_l1_disposable",
    DB_USER: "ledger_l1_tester",
    DB_PASSWORD: "tester",
  });
  assert.equal(ledgerName.ok, false);

  const ok = validateL4bTxRuntimeMysqlTarget({
    L4B_TX_RUNTIME_MYSQL_VALIDATION: "1",
    L4B_TX_RUNTIME_MYSQL_USE_LOCAL_ROOT: "1",
    DB_HOST: "127.0.0.1",
    DB_PORT: "3310",
    DB_NAME: "flix_l4b_tx_runtime_rc",
    DB_USER: "ledger_l1_tester",
    DB_PASSWORD: "tester",
  });
  assert.equal(ok.ok, true);
});
