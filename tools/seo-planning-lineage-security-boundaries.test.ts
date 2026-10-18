/**
 * L4A/L4B hardening — negative security boundaries for test-only capabilities.
 * Provider-free. No production DB. No schema ensure.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import {
  issueLineageSelectionTestGate,
  mintTrustedPlanningDecisionSelectionWithTestGate,
} from "../lib/cms/seo-planning-lineage/selection";
import {
  executeTransactionalProtectedPermanentDelete,
  executeTransactionalTrustedProceedAndLink,
  issueL4B6TestHarnessActivation,
} from "../lib/cms/seo-planning-lineage/transactional-integration";
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
  createL4B6TestHarnessActivationForTests,
  createTrustedPlanningDecisionSelectionForTests,
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
  const real = createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
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

test("3. forged selection test-gate shape cannot mint; deep-import issuer denied", () => {
  const forgedGate = { _lineageSelectionTestGate: true as const };
  // Direct call outside tools harness is denied (caller restriction) before WeakSet.
  assert.throws(
    () =>
      mintTrustedPlanningDecisionSelectionWithTestGate(forgedGate, {
        planningDraftId: "seoplan_sec",
        decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        researchRunId: "seorun_sec",
        actorAdminId: "admin_1",
      }),
    /restricted to tools\/seo-planning-lineage-test-harness/i,
  );
  assert.throws(() => issueLineageSelectionTestGate(), /restricted to tools\/seo-planning-lineage-test-harness/i);
  assert.throws(() => issueL4B6TestHarnessActivation(), /restricted to tools\/seo-planning-lineage-test-harness/i);
});

test("4. arbitrary {mode:test-harness,...} activation is rejected (no DB path)", async () => {
  const forged = {
    mode: "test-harness",
    allowDurableLineageWrites: true,
    allowProtectedDelete: true,
  };
  const emptyCatalog = {
    async listPosts() {
      return [];
    },
    async listPages() {
      return [];
    },
    async listCategories() {
      return [];
    },
    async listActiveRedirects() {
      return [];
    },
    async getSeoPlanningDraftByFingerprint() {
      return null;
    },
    async saveSeoPlanningDraft() {
      throw new Error("must not save");
    },
  };
  const proceed = await executeTransactionalTrustedProceedAndLink({
    activation: forged as never,
    actor: { authorized: true, adminId: "admin_1" },
    ledgerRunId: "seorun_sec",
    opportunityIndex: 0,
    editorialSupplemental: { searchIntent: "INFORMATIONAL" },
    ledgerReader: {
      async getSeoResearchRunDetail() {
        return { ok: false, errorCode: "not_found", errorMessage: "missing" };
      },
    },
    catalog: emptyCatalog,
  });
  assert.equal(proceed.ok, false);
  if (!proceed.ok) assert.equal(proceed.errorCode, "ACTIVATION_DENIED");

  const del = await executeTransactionalProtectedPermanentDelete({
    activation: forged as never,
    actor: { authorized: true, adminId: "admin_1" },
    planningDraftId: "seoplan_sec",
    confirmation: "x",
  });
  assert.equal(del.ok, false);
  if (!del.ok) assert.equal(del.errorCode, "ACTIVATION_DENIED");
});

test("5. production barrel does not expose test-only minting or harness issue", () => {
  const index = read("lib/cms/seo-planning-lineage/index.ts");
  assert.doesNotMatch(index, /createTrustedPlanningDecisionSelectionForTests/);
  assert.doesNotMatch(index, /\bissueLineageSelectionTestGate\b/);
  assert.doesNotMatch(index, /\bmintTrustedPlanningDecisionSelectionWithTestGate\b/);
  assert.doesNotMatch(index, /\bissueL4B6TestHarnessActivation\b/);
  assert.doesNotMatch(index, /transactional-integration/);
  assert.doesNotMatch(index, /seo-planning-lineage-test-harness/);
  // Barrel must keep exporting the real same-request mint path only.
  assert.match(index, /tryMintTrustedPlanningDecisionSelection/);
  assert.match(index, /isTrustedPlanningDecisionSelection/);
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

test("7. duplicate same-pair link remains idempotent", async () => {
  const state = seeded();
  const trusted = createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
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
    trustedSelection: createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_sec",
      decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      researchRunId: "seorun_sec",
      actorAdminId: "admin_1",
    }),
  });
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.status, "IDEMPOTENT");
  assert.equal(state.links.length, 1);
});

test("8. tools harness can mint/activate; structural lookalikes remain unequal", () => {
  const selection = createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: "seoplan_sec",
    decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    researchRunId: "seorun_sec",
    actorAdminId: "admin_1",
  });
  assert.equal(isTrustedPlanningDecisionSelection(selection), true);

  const harness = createL4B6TestHarnessActivationForTests();
  assert.equal(typeof harness, "object");
  assert.notDeepEqual(harness, {
    mode: "test-harness",
    allowDurableLineageWrites: true,
    allowProtectedDelete: true,
  });
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
  assert.doesNotMatch(read("lib/cms/seo-planning-actions.ts"), /issueL4B6TestHarnessActivation/);
  assert.doesNotMatch(
    read("lib/cms/seo-planning-actions.ts"),
    /createTrustedPlanningDecisionSelectionForTests|mintTrustedPlanningDecisionSelectionWithTestGate/,
  );
});
