/**
 * L4A/L4B hardening — negative security boundaries for production/test trust separation.
 * Provider-free. No production DB. No schema ensure.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  attemptEstablishPlanningDecisionLink,
  isTrustedPlanningDecisionSelection,
  prepareTrustedResearchProceedSelection,
  tryMintTrustedPlanningDecisionSelection,
  type PlanningLineageStore,
  type TrustedPlanningDecisionSelection,
} from "../lib/cms/seo-planning-lineage";
import * as selectionModule from "../lib/cms/seo-planning-lineage/selection";
import {
  executeTransactionalProtectedPermanentDelete,
  executeTransactionalTrustedProceedAndLink,
} from "../lib/cms/seo-planning-lineage/transactional-integration";
import * as transactionalModule from "../lib/cms/seo-planning-lineage/transactional-integration";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import type { SeoPlanningDraft } from "../lib/cms/types";
import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "../lib/cms/seo-planning-lineage/proceed-integration";
import {
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
} from "../lib/cms/seo-planning-lineage/schema-ddl";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  createTrustedPlanningDecisionSelectionForTests,
  executeTransactionalProtectedPermanentDeleteForTests,
  executeTransactionalTrustedProceedAndLinkForTests,
} from "./seo-planning-lineage-test-harness";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_sec",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:sec-topic",
    topic: "Security boundary topic for UK IPTV",
    workingTitle: "Security Boundary Working Title",
    proposedSlug: "security-boundary",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    archivedAt: null,
    payload: {},
    ...overrides,
  };
}

function run(overrides: Partial<SeoResearchRunRow> = {}): SeoResearchRunRow {
  return {
    id: "seorun_sec",
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: "admin_1",
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: "v1",
    pipelineErrorCode: null,
    opportunityCount: 1,
    gscStatus: "OK",
    durabilityStatus: "COMPLETE",
    ...overrides,
  };
}

function decision(overrides: Partial<SeoOpportunityDecisionRow> = {}): SeoOpportunityDecisionRow {
  return {
    id: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    runId: "seorun_sec",
    opportunityIndex: 0,
    opportunityIdentity: "oid_sec",
    createdAt: "2026-10-06T00:00:00.000Z",
    topic: "Security boundary topic for UK IPTV",
    workingTitle: "Security Boundary Working Title",
    researchRecommendation: "NEW_BLOG",
    researchConfidence: "HIGH",
    existingCoverage: "NONE",
    matchedPublicUrl: "",
    restorePath: "",
    targetPostId: null,
    evaluationStatus: "OK",
    rfVerdict: "PASS_NEW_CONTENT",
    rfFingerprint: "rf_sec",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_sec",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_sec",
    pipelineFingerprint: "pipe_sec",
    selected: false,
    selectionSource: "none",
    ...overrides,
  };
}

type Mem = {
  schemaAvailable: boolean;
  drafts: Map<string, SeoPlanningDraft>;
  runs: Map<string, SeoResearchRunRow>;
  decisions: Map<string, SeoOpportunityDecisionRow>;
  links: Array<{
    id: string;
    planningDraftId: string;
    decisionId: string;
    linkedByAdminId: string;
    linkedAt: string;
    selectionMarker: "server_research_binding";
  }>;
  insertCalls: number;
};

function memoryStore(state: Mem): PlanningLineageStore {
  return {
    async isLineageSchemaAvailable() {
      return state.schemaAvailable;
    },
    async getPlanningDraftById(id) {
      return state.drafts.get(id) ?? null;
    },
    async getDecisionById(id) {
      return state.decisions.get(id) ?? null;
    },
    async getResearchRunById(id) {
      return state.runs.get(id) ?? null;
    },
    async getLinkByPlanningDraftId(id) {
      return state.links.find((l) => l.planningDraftId === id) ?? null;
    },
    async getLinkByDecisionId(id) {
      return state.links.find((l) => l.decisionId === id) ?? null;
    },
    async insertLinkInTransaction(link) {
      state.insertCalls += 1;
      state.links.push({ ...link, selectionMarker: "server_research_binding" });
    },
  };
}

function seeded(): Mem {
  const d = draft();
  const r = run();
  const dec = decision();
  return {
    schemaAvailable: true,
    drafts: new Map([[d.id, d]]),
    runs: new Map([[r.id, r]]),
    decisions: new Map([[dec.id, dec]]),
    links: [],
    insertCalls: 0,
  };
}

test("1. plain client-shaped selection is rejected (zero writes)", async () => {
  const state = seeded();
  const forged: TrustedPlanningDecisionSelection = {
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
    boundAt: new Date().toISOString(),
  };
  assert.equal(isTrustedPlanningDecisionSelection(forged), false);
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: forged,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errorCode, "SELECTION_PROVENANCE_UNAVAILABLE");
  assert.equal(state.insertCalls, 0);
  assert.equal(state.links.length, 0);
});

test("2. deserialized selection cannot regain trusted authority", async () => {
  const real = await createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
    topic: "Security boundary topic for UK IPTV",
    workingTitle: "Security Boundary Working Title",
  });
  assert.equal(isTrustedPlanningDecisionSelection(real), true);
  const revived = JSON.parse(JSON.stringify(real)) as TrustedPlanningDecisionSelection;
  assert.equal(isTrustedPlanningDecisionSelection(revived), false);

  const state = seeded();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: revived,
  });
  assert.equal(result.ok, false);
  assert.equal(state.insertCalls, 0);
});

test("3. production modules export no registrar/issuer; shared trust-registries removed", () => {
  assert.equal(existsSync(path.join(root, "lib/cms/seo-planning-lineage/internal/trust-registries.ts")), false);

  const selectionExports = Object.keys(selectionModule);
  for (const name of [
    "issueLineageSelectionTestGate",
    "mintTrustedPlanningDecisionSelectionWithTestGate",
    "createTrustedPlanningDecisionSelectionForTests",
    "addTrustedPlanningDecisionSelection",
    "registerTrustedSelection",
  ]) {
    assert.ok(!selectionExports.includes(name), `selection must not export ${name}`);
    assert.equal(typeof (selectionModule as Record<string, unknown>)[name], "undefined");
  }

  const txExports = Object.keys(transactionalModule);
  for (const name of [
    "issueL4B6TestHarnessActivation",
    "createL4B6TestHarnessActivationForTests",
    "addL4B6HarnessActivation",
    "runTransactionalTrustedProceedAndLink",
  ]) {
    assert.ok(!txExports.includes(name), `transactional-integration must not export ${name}`);
  }

  const selectionSrc = read("lib/cms/seo-planning-lineage/selection.ts");
  assert.doesNotMatch(selectionSrc, /new Error\(\)\.stack/);
  assert.doesNotMatch(selectionSrc, /export function addTrusted|export function registerTrusted/);
  assert.match(selectionSrc, /const mintedSelections = new WeakSet/);
  assert.match(selectionSrc, /mintedSelections\.add\(selection\)/);

  const harnessSrc = read("tools/seo-planning-lineage-test-harness.ts");
  assert.match(harnessSrc, /prepareTrustedResearchProceedSelection/);
  assert.match(harnessSrc, /tryMintTrustedPlanningDecisionSelection/);
  assert.doesNotMatch(harnessSrc, /addTrustedPlanningDecisionSelection|trust-registries/);
  assert.doesNotMatch(harnessSrc, /new Error\(\)\.stack|NODE_ENV/);
});

test("4. production transaction/delete entrypoints deny forged activation inputs", async () => {
  const forged = {
    mode: "test-harness",
    allowDurableLineageWrites: true,
    allowProtectedDelete: true,
  };
  const proceed = await executeTransactionalTrustedProceedAndLink(forged);
  assert.equal(proceed.ok, false);
  if (!proceed.ok) assert.equal(proceed.errorCode, "ACTIVATION_DENIED");

  const del = await executeTransactionalProtectedPermanentDelete(forged);
  assert.equal(del.ok, false);
  if (!del.ok) assert.equal(del.errorCode, "ACTIVATION_DENIED");
});

test("5. production import graph cannot reach harness or ungated execution", () => {
  const index = read("lib/cms/seo-planning-lineage/index.ts");
  assert.doesNotMatch(index, /from\s+["'][^"']*seo-planning-lineage-test-harness/);
  assert.doesNotMatch(index, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(index, /from\s+["'][^"']*trust-registries/);
  assert.doesNotMatch(index, /createTrustedPlanningDecisionSelectionForTests/);
  assert.match(index, /tryMintTrustedPlanningDecisionSelection/);
  assert.match(index, /isTrustedPlanningDecisionSelection/);

  // Closed facade must not load ungated runners (no direct/transitive production edge).
  const facadeSrc = read("lib/cms/seo-planning-lineage/transactional-integration.ts");
  assert.doesNotMatch(facadeSrc, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(facadeSrc, /\brunTransactionalTrustedProceedAndLink\b|\brunTransactionalProtectedPermanentDelete\b/);
  assert.match(facadeSrc, /ACTIVATION_DENIED/);

  // Match import/require edges only — not prose comments.
  const forbiddenImport =
    /(?:from\s+["'][^"']*(?:seo-planning-lineage-test-harness|transactional-execution|trust-registries)[^"']*["']|require\(\s*["'][^"']*(?:seo-planning-lineage-test-harness|transactional-execution|trust-registries)[^"']*["']\s*\)|import\(\s*["'][^"']*(?:seo-planning-lineage-test-harness|transactional-execution|trust-registries)[^"']*["']\s*\))/;

  function scanTree(relDir: string, filter: (name: string) => boolean) {
    const abs = path.join(root, relDir);
    if (!existsSync(abs)) return;
    const entries = readdirSync(abs, { withFileTypes: true });
    for (const entry of entries) {
      const rel = path.join(relDir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        scanTree(rel, filter);
        continue;
      }
      if (!filter(entry.name)) continue;
      if (rel.endsWith("transactional-execution.ts")) continue;
      if (rel.includes("seo-planning-lineage-test-harness")) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".integration.ts")) continue;
      const src = read(rel);
      assert.doesNotMatch(
        src,
        forbiddenImport,
        `${rel} must not import ungated test execution/harness`,
      );
    }
  }

  scanTree("app", (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
  scanTree("lib", (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
  scanTree("components", (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
  for (const top of ["proxy.ts", "middleware.ts", "instrumentation.ts"]) {
    if (!existsSync(path.join(root, top))) continue;
    assert.doesNotMatch(
      read(top),
      forbiddenImport,
      `${top} must not import ungated test execution/harness`,
    );
  }

  // Demonstrated: no current production import edge to execution/harness.
  // Not claimed: JS cannot stop a future developer from adding such an import on purpose.
});

test("6. real authorized same-request preparation still mints trusted selection", async () => {
  const state = seeded();
  const dec = state.decisions.get("seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")!;
  const prepared = await prepareTrustedResearchProceedSelection({
    actor: { authorized: true, adminId: "admin_1" },
    ledgerRunId: "seorun_sec",
    opportunityIndex: 0,
    decisionId: dec.id,
    displayedOpportunity: {
      topic: dec.topic,
      workingTitle: dec.workingTitle,
      recommendation: dec.researchRecommendation,
    },
    ledgerReader: {
      async getSeoResearchRunDetail() {
        return {
          ok: true,
          run: state.runs.get("seorun_sec")!,
          decisions: [dec],
          decisionOverflow: false,
        };
      },
    },
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const minted = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: "seoplan_sec",
    decisionId: dec.id,
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
    serverResearchBinding: prepared.preparation,
  });
  assert.equal(minted.ok, true);
  if (!minted.ok) return;
  assert.equal(isTrustedPlanningDecisionSelection(minted.selection), true);

  const linked = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_sec",
    decisionId: dec.id,
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: minted.selection,
  });
  assert.equal(linked.ok, true);
  assert.equal(state.links.length, 1);
});

test("7. duplicate same-pair link remains idempotent via genuine prepare/mint fixtures", async () => {
  const state = seeded();
  const trusted = await createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
    topic: "Security boundary topic for UK IPTV",
    workingTitle: "Security Boundary Working Title",
  });
  const store = memoryStore(state);
  const first = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    actorAdminId: "admin_1",
    store,
    trustedSelection: trusted,
  });
  assert.equal(first.ok, true);
  const second = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_sec",
      decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      researchRunId: "seorun_sec",
      actorAdminId: "admin_1",
      topic: "Security boundary topic for UK IPTV",
      workingTitle: "Security Boundary Working Title",
    }),
  });
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.status, "IDEMPOTENT");
  assert.equal(state.links.length, 1);
});

test("8. harness uses prepare/mint; production facade stays closed while test wrappers reach execution", async () => {
  const selection = await createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
    topic: "Security boundary topic for UK IPTV",
    workingTitle: "Security Boundary Working Title",
  });
  assert.equal(isTrustedPlanningDecisionSelection(selection), true);

  const productionProceed = await executeTransactionalTrustedProceedAndLink({
    actor: { authorized: true, adminId: "admin_1" },
  });
  assert.equal(productionProceed.ok, false);
  if (!productionProceed.ok) assert.equal(productionProceed.errorCode, "ACTIVATION_DENIED");

  // Test wrapper is a distinct import graph entry (tools → transactional-execution).
  // Without disposable MySQL it still fails closed on missing schema/actor paths,
  // but must not be ACTIVATION_DENIED from the production facade.
  const harnessDelete = await executeTransactionalProtectedPermanentDeleteForTests({
    actor: { authorized: true, adminId: "admin_1" },
    planningDraftId: "seoplan_missing_for_boundary",
    confirmation: "DELETE",
    withTransactionFn: async () => {
      throw Object.assign(new Error("no db"), {
        l4b6Code: "WRITE_ERROR",
        l4b6Message: "no disposable db in unit test",
      });
    },
  });
  assert.equal(harnessDelete.ok, false);
  if (!harnessDelete.ok) assert.notEqual(harnessDelete.errorCode, "ACTIVATION_DENIED");
  void executeTransactionalTrustedProceedAndLinkForTests;
});

test("9. unlinked Planning remains UNLINKED without fabricated history", async () => {
  const state = seeded();
  const { resolvePlanningDecisionLineage } = await import("../lib/cms/seo-planning-lineage");
  const resolved = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_sec",
    store: memoryStore(state),
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.state, "UNLINKED");
});

test("10. production write / schema gates remain OFF", () => {
  assert.equal(RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED, false);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
});
