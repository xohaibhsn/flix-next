/**
 * FLIX-L4B-ACTIVATION-RC-01 — facade boundary, physical readiness, worker overlap.
 * No production MySQL. No schema ensure. No paid AI/GSC.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "../lib/cms/seo-planning-lineage/proceed-integration";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "../lib/cms/seo-planning-lineage/schema-ddl";
import { SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED } from "../lib/cms/seo-planning-lineage/live-wiring-dispatch";
import {
  L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED,
  L4B_ACTIVATION_RC_FACADE_VERSION,
  areTransactionalProductionWritersAuthorized,
  describeTransactionalActivationBoundary,
  executeTransactionalProtectedPermanentDelete,
  executeTransactionalTrustedProceedAndLink,
} from "../lib/cms/seo-planning-lineage/transactional-integration";
import {
  assessLineagePhysicalSchemaReadiness,
  lineagePhysicalReadinessInvocationPolicy,
  type LineagePhysicalSchemaMetadataReader,
} from "../lib/cms/seo-planning-lineage/physical-schema-readiness";
import {
  L4B_WORKER_OVERLAP_MATRIX,
  classifyWorkerOverlap,
  describeCurrentRolloutStage,
} from "../lib/cms/seo-planning-lineage/worker-overlap-compatibility";
import { dispatchSidhuProceedToPlanning } from "../lib/cms/seo-planning-lineage/live-wiring-dispatch";
import type { SeoPlanningCatalog } from "../lib/cms/seo-planning/proceed";
import { simulateTransactionalProceedForTests } from "./seo-planning-lineage-live-wiring-test-dispatch";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function emptyCatalog(overrides: Partial<SeoPlanningCatalog> = {}): SeoPlanningCatalog {
  return {
    listPosts: async () => [],
    listPages: async () => [],
    listCategories: async () => [],
    listActiveRedirects: async () => [],
    getSeoPlanningDraftByFingerprint: async () => null,
    saveSeoPlanningDraft: async (draft) => draft,
    ...overrides,
  };
}

function readyReader(
  overrides: Partial<LineagePhysicalSchemaMetadataReader> = {},
): LineagePhysicalSchemaMetadataReader {
  return {
    getConnectedSchemaName: async () => "flix_app",
    getExpectedSchemaName: async () => "flix_app",
    getTable: async () => ({
      tableName: "seo_planning_decision_links",
      engine: "InnoDB",
      tableCollation: "utf8mb4_unicode_ci",
    }),
    listColumns: async () => [
      { columnName: "id", dataType: "varchar", isNullable: "NO", columnKey: "PRI" },
      { columnName: "planning_draft_id", dataType: "varchar", isNullable: "NO", columnKey: "UNI" },
      { columnName: "decision_id", dataType: "varchar", isNullable: "NO", columnKey: "UNI" },
      { columnName: "linked_by_admin_id", dataType: "varchar", isNullable: "NO" },
      { columnName: "linked_at", dataType: "datetime", isNullable: "NO" },
      { columnName: "selection_marker", dataType: "varchar", isNullable: "NO" },
    ],
    listIndexes: async () => [
      { indexName: "PRIMARY", nonUnique: 0, columnName: "id", seqInIndex: 1 },
      {
        indexName: "seo_planning_decision_links_draft_unique",
        nonUnique: 0,
        columnName: "planning_draft_id",
        seqInIndex: 1,
      },
      {
        indexName: "seo_planning_decision_links_decision_unique",
        nonUnique: 0,
        columnName: "decision_id",
        seqInIndex: 1,
      },
      {
        indexName: "seo_planning_decision_links_linked_at",
        nonUnique: 1,
        columnName: "linked_at",
        seqInIndex: 1,
      },
    ],
    listForeignKeys: async () => [
      {
        constraintName: "seo_planning_decision_links_draft_fk",
        columnName: "planning_draft_id",
        referencedTableName: "seo_planning_drafts",
        referencedColumnName: "id",
        deleteRule: "RESTRICT",
      },
      {
        constraintName: "seo_planning_decision_links_decision_fk",
        columnName: "decision_id",
        referencedTableName: "seo_opportunity_decisions",
        referencedColumnName: "id",
        deleteRule: "RESTRICT",
      },
    ],
    ...overrides,
  };
}

test("production constants remain OFF for activation RC", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED, false);
  assert.equal(SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED, false);
  assert.equal(L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED, false);
  assert.equal(areTransactionalProductionWritersAuthorized(), false);
  assert.equal(L4B_ACTIVATION_RC_FACADE_VERSION, "l4b-activation-rc-v1");
});

test("OFF facade denies without schema probe, DML, or executor import", async () => {
  const boundary = describeTransactionalActivationBoundary();
  assert.equal(boundary.importsUngatedExecutorWhileOff, false);
  assert.equal(boundary.runsSchemaProbeWhileOff, false);
  assert.equal(boundary.runsDmlWhileOff, false);
  assert.equal(boundary.acceptsTestInjection, false);
  assert.equal(boundary.automaticManualFallback, false);
  assert.ok(boundary.futureSourcePatchSteps.length >= 5);

  const facadeSrc = read("lib/cms/seo-planning-lineage/transactional-integration.ts");
  assert.doesNotMatch(facadeSrc, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(facadeSrc, /assessLineagePhysicalSchemaReadiness/);
  assert.doesNotMatch(facadeSrc, /INSERT\s+INTO|ensureCmsSchema/);

  const proceed = await executeTransactionalTrustedProceedAndLink({
    activation: true,
    allowDurableLineageWrites: true,
    mode: "test-harness",
  });
  assert.equal(proceed.ok, false);
  if (!proceed.ok) assert.equal(proceed.errorCode, "ACTIVATION_DENIED");

  const del = await executeTransactionalProtectedPermanentDelete({
    allowProtectedDelete: true,
    activation: true,
  });
  assert.equal(del.ok, false);
  if (!del.ok) assert.equal(del.errorCode, "ACTIVATION_DENIED");
});

test("env cannot authorize transactional writers", () => {
  process.env.L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED = "true";
  process.env.RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED = "1";
  assert.equal(areTransactionalProductionWritersAuthorized(), false);
  delete process.env.L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED;
  delete process.env.RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
});

test("physical readiness: READY / MISSING / MISMATCH / UNKNOWN via injected metadata", async () => {
  const ready = await assessLineagePhysicalSchemaReadiness(readyReader());
  assert.equal(ready.status, "READY");
  assert.equal(ready.mayAuthorizeWriters, true);
  assert.equal(ready.oneTimeProbeIsPermanentAuthorization, false);
  assert.equal(ready.cmsSchemaMarker, 6);
  assert.equal(ready.ddlRegisteredWithEnsure, false);

  const missing = await assessLineagePhysicalSchemaReadiness(
    readyReader({ getTable: async () => null }),
  );
  assert.equal(missing.status, "MISSING");
  assert.equal(missing.mayAuthorizeWriters, false);

  const mismatchEngine = await assessLineagePhysicalSchemaReadiness(
    readyReader({
      getTable: async () => ({
        tableName: "seo_planning_decision_links",
        engine: "MyISAM",
        tableCollation: "utf8mb4_unicode_ci",
      }),
    }),
  );
  assert.equal(mismatchEngine.status, "MISMATCH");
  assert.ok(mismatchEngine.mismatches.some((m) => /InnoDB/i.test(m)));

  const wrongDb = await assessLineagePhysicalSchemaReadiness(
    readyReader({
      getConnectedSchemaName: async () => "other_db",
      getExpectedSchemaName: async () => "flix_app",
    }),
  );
  assert.equal(wrongDb.status, "MISMATCH");

  const unknown = await assessLineagePhysicalSchemaReadiness(
    readyReader({
      getConnectedSchemaName: async () => {
        throw new Error("boom");
      },
    }),
  );
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.mayAuthorizeWriters, false);

  const policy = lineagePhysicalReadinessInvocationPolicy();
  assert.equal(policy.allowedOnImport, false);
  assert.equal(policy.allowedOnBuild, false);
  assert.equal(policy.allowedOnOffFacadeCall, false);
  assert.equal(policy.markerV6ImpliesTableMissing, false);
  assert.equal(policy.ddlRegistrationFalseImpliesTableMissing, false);
  assert.equal(policy.requiredAtFutureWriterActivation, true);
});

test("physical readiness module never mutates schema", () => {
  const src = read("lib/cms/seo-planning-lineage/physical-schema-readiness.ts");
  assert.doesNotMatch(src, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|ensureCmsSchema/);
  assert.doesNotMatch(src, /getDbPool|mysql\.createPool|DB_HOST/);
});

test("OFF manual Proceed regression: dispatch remains manual; no lineage claim", async () => {
  let saved = 0;
  const result = await dispatchSidhuProceedToPlanning({
    rawOpportunity: {
      recommendation: "NEW_BLOG",
      topic: "Activation RC manual topic for UK IPTV",
      workingTitle: "Activation RC Manual Title",
      searchIntent: "INFORMATIONAL",
      whyNow: "manual",
      webEvidence: "manual",
      existingCoverage: "NONE",
      matchedTitle: null,
      matchedPublicUrl: null,
      restorePath: "",
      suggestedAngle: "manual",
      nextStep: "manual",
      confidence: "LOW",
      gscEvidenceRefs: [],
      gscEvidence: [],
      historicalSignal: false,
    },
    adminId: "admin_1",
    catalog: emptyCatalog({
      saveSeoPlanningDraft: async (draft) => {
        saved += 1;
        return draft;
      },
    }),
    createIdFn: () => "seoplan_activation_rc",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.created, true);
    assert.equal(result.id, "seoplan_activation_rc");
  }
  assert.equal(saved, 1);

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /dispatchSidhuProceedToPlanning/);
  assert.doesNotMatch(actions, /transactional-execution/);
  assert.doesNotMatch(actions, /executeTransactionalTrustedProceedAndLink/);
});

test("failed transactional simulation never falls back to manual", async () => {
  let manualSave = 0;
  const failed = await simulateTransactionalProceedForTests({
    transactionalProceed: async () => ({
      ok: false,
      created: false,
      errorCode: "ROLLED_BACK",
      errorMessage: "Lineage link was rolled back.",
    }),
  });
  assert.equal(failed.ok, false);
  assert.equal(manualSave, 0);
  void emptyCatalog({
    saveSeoPlanningDraft: async (d) => {
      manualSave += 1;
      return d;
    },
  });
});

test("worker overlap matrix: Stage-1 PASS; future ON overlap BLOCKED", () => {
  const stage = describeCurrentRolloutStage();
  assert.equal(stage.stage, "DEPLOY_WRITERS_OFF");
  assert.equal(stage.oldManualPlusNewOff, "PASS");
  assert.equal(stage.fullWriterActivation, "NO-GO");

  const oldNewOff = classifyWorkerOverlap("OLD_MANUAL", "NEW_OFF_MANUAL");
  assert.equal(oldNewOff.verdict, "PASS");

  const newOffNewOff = classifyWorkerOverlap("NEW_OFF_MANUAL", "NEW_OFF_MANUAL");
  assert.equal(newOffNewOff.verdict, "PASS");

  const oldOn = classifyWorkerOverlap("OLD_MANUAL", "NEW_ON_TRANSACTIONAL");
  assert.equal(oldOn.verdict, "BLOCKED");
  assert.ok(oldOn.releaseGate);

  const offOn = classifyWorkerOverlap("NEW_OFF_MANUAL", "NEW_ON_TRANSACTIONAL");
  assert.equal(offOn.verdict, "BLOCKED");

  const onOn = classifyWorkerOverlap("NEW_ON_TRANSACTIONAL", "NEW_ON_TRANSACTIONAL");
  assert.equal(onOn.verdict, "CONDITIONAL");

  assert.ok(L4B_WORKER_OVERLAP_MATRIX.length >= 5);
});

test("production import graph: actions/dispatch/facade stay free of ungated executor", () => {
  const forbidden =
    /from\s+["'][^"']*(?:transactional-execution|seo-planning-lineage-test-harness|live-wiring-test-dispatch)[^"']*["']/;
  for (const rel of [
    "lib/cms/seo-planning-actions.ts",
    "lib/cms/seo-planning-lineage/live-wiring-dispatch.ts",
    "lib/cms/seo-planning-lineage/transactional-integration.ts",
    "lib/cms/seo-planning-lineage/index.ts",
  ]) {
    assert.doesNotMatch(read(rel), forbidden, rel);
  }
  assert.doesNotMatch(
    read("lib/cms/seo-planning-lineage/index.ts"),
    /from\s+["'][^"']*transactional-integration/,
  );
});
