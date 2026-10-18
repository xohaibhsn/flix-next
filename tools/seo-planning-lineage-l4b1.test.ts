/**
 * L4B-1 — Durable Planning ↔ Ledger decision lineage foundation tests.
 * Pure validation + injected in-memory store (mocked SQL boundary).
 * No production schema application.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION, CMS_SCHEMA_STATEMENTS } from "../lib/db/schema";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import {
  attemptEstablishPlanningDecisionLink,
  decisionSnapshotIncomplete,
  isTrustedPlanningDecisionSelection,
  L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN,
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT,
  PlanningLineageConflictError,
  resolveDecisionPlanningLineage,
  resolvePlanningDecisionLineage,
  SEO_PLANNING_DECISION_LINKS_DDL,
  SEO_PLANNING_DECISION_LINKS_TABLE,
  tryMintTrustedPlanningDecisionSelection,
  validatePlanningDecisionLineageCandidate,
  type PlanningLineageStore,
  type SeoPlanningDecisionLinkRow,
  type TrustedPlanningDecisionSelection,
} from "../lib/cms/seo-planning-lineage";
import { createTrustedPlanningDecisionSelectionForTests } from "./seo-planning-lineage-test-harness";
import type { SeoPlanningDraft } from "../lib/cms/types";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_l4b1",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:firestick-setup-uk",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    proposedSlug: "firestick-setup-uk",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    archivedAt: null,
    payload: { opportunity: { topic: "client snapshot must not authorize lineage" } },
    ...overrides,
  };
}

function run(overrides: Partial<SeoResearchRunRow> = {}): SeoResearchRunRow {
  return {
    id: "seorun_1",
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
    id: "seodec_1",
    runId: "seorun_1",
    opportunityIndex: 0,
    opportunityIdentity: "oid_firestick_1",
    createdAt: "2026-10-06T00:00:01.000Z",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    researchRecommendation: "NEW_BLOG",
    researchConfidence: "HIGH",
    existingCoverage: "NONE",
    matchedPublicUrl: "",
    restorePath: "",
    targetPostId: null,
    evaluationStatus: "OK",
    rfVerdict: "PASS_NEW_CONTENT",
    rfFingerprint: "rf_1",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_1",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_1",
    pipelineFingerprint: "pipe_1",
    selected: false,
    selectionSource: "none",
    ...overrides,
  };
}

type MemoryState = {
  schemaAvailable: boolean;
  drafts: Map<string, SeoPlanningDraft>;
  runs: Map<string, SeoResearchRunRow>;
  decisions: Map<string, SeoOpportunityDecisionRow>;
  links: SeoPlanningDecisionLinkRow[];
  insertCalls: number;
  readCalls: number;
};

function memoryStore(state: MemoryState): PlanningLineageStore {
  return {
    async isLineageSchemaAvailable() {
      state.readCalls += 1;
      return state.schemaAvailable;
    },
    async getPlanningDraftById(id) {
      state.readCalls += 1;
      return state.drafts.get(id) ?? null;
    },
    async getDecisionById(id) {
      state.readCalls += 1;
      return state.decisions.get(id) ?? null;
    },
    async getResearchRunById(id) {
      state.readCalls += 1;
      return state.runs.get(id) ?? null;
    },
    async getLinkByPlanningDraftId(id) {
      state.readCalls += 1;
      return state.links.find((l) => l.planningDraftId === id) ?? null;
    },
    async getLinkByDecisionId(id) {
      state.readCalls += 1;
      return state.links.find((l) => l.decisionId === id) ?? null;
    },
    async insertLinkInTransaction(link) {
      state.insertCalls += 1;
      if (!state.schemaAvailable) throw new Error("schema missing");
      if (!state.drafts.has(link.planningDraftId)) {
        throw new Error("fk_draft");
      }
      if (!state.decisions.has(link.decisionId)) {
        throw new Error("fk_decision");
      }
      if (state.links.some((l) => l.planningDraftId === link.planningDraftId)) {
        throw new PlanningLineageConflictError();
      }
      if (state.links.some((l) => l.decisionId === link.decisionId)) {
        throw new PlanningLineageConflictError();
      }
      state.links.push({ ...link });
    },
  };
}

function seeded(extra?: Partial<MemoryState>): MemoryState {
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
    readCalls: 0,
    ...extra,
  };
}

async function trusted(state: MemoryState) {
  const d = [...state.drafts.values()][0]!;
  const dec = [...state.decisions.values()][0]!;
  const r = [...state.runs.values()][0]!;
  return await createTrustedPlanningDecisionSelectionForTests({
    planningDraftId: d.id,
    decisionId: dec.id,
    researchRunId: r.id,
    actorAdminId: "admin_1",
    topic: dec.topic,
    workingTitle: dec.workingTitle,
  });
}

// --- Schema / integrity ---

test("1. schema: unique Planning link enforced by store UNIQUE semantics", async () => {
  const state = seeded();
  const store = memoryStore(state);
  const selection = await trusted(state);
  const first = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: selection,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.status, "CREATED");
  assert.equal(state.links.length, 1);

  // Conflicting second decision for same draft
  state.decisions.set(
    "seodec_2",
    decision({ id: "seodec_2", opportunityIndex: 1, opportunityIdentity: "oid_2" }),
  );
  const conflict = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_2",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_l4b1",
      decisionId: "seodec_2",
      researchRunId: "seorun_1",
      actorAdminId: "admin_1",
    }),
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.errorCode, "LINK_CONFLICT");
  assert.equal(state.links.length, 1);
});

test("2. schema: unique decision association enforced", async () => {
  const state = seeded();
  const store = memoryStore(state);
  await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await trusted(state),
  });
  state.drafts.set("seoplan_other", draft({ id: "seoplan_other", fingerprint: "NEW_BLOG:other" }));
  const conflict = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_other",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_other",
      decisionId: "seodec_1",
      researchRunId: "seorun_1",
      actorAdminId: "admin_1",
    }),
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.errorCode, "LINK_CONFLICT");
});

test("3. schema: FK integrity — missing draft/decision rejects insert path", async () => {
  const state = seeded();
  state.drafts.clear();
  const store = memoryStore(state);
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_l4b1",
      decisionId: "seodec_1",
      researchRunId: "seorun_1",
      actorAdminId: "admin_1",
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "MISSING_PLANNING_DRAFT");
  assert.equal(state.insertCalls, 0);
});

test("4. missing linked records fail closed on read", async () => {
  const state = seeded();
  state.links.push({
    id: "seoplink_orphan",
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_missing",
    linkedByAdminId: "admin_1",
    linkedAt: "2026-10-06T00:00:00.000Z",
    selectionMarker: "server_research_binding",
  });
  const resolved = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_l4b1",
    store: memoryStore(state),
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.state, "INCOMPLETE");
});

test("5. existing Ledger history remains intact (no decision mutation)", async () => {
  const state = seeded();
  const before = { ...state.decisions.get("seodec_1")! };
  await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: await trusted(state),
  });
  assert.deepEqual(state.decisions.get("seodec_1"), before);
  assert.equal(state.drafts.get("seoplan_l4b1")?.payload.opportunity != null, true);
});

test("6. schema version collision is not introduced", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  assert.equal(L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN, 6);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(
    L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT,
    "PROVISIONAL_V7_POST_CONCURRENCY_V6",
  );
  assert.ok(SEO_PLANNING_DECISION_LINKS_DDL.includes(SEO_PLANNING_DECISION_LINKS_TABLE));
  const joined = CMS_SCHEMA_STATEMENTS.join("\n");
  assert.doesNotMatch(joined, /seo_planning_decision_links/);
  assert.match(read("lib/db/schema.ts"), /CURRENT_CMS_SCHEMA_VERSION\s*=\s*6/);
  assert.match(read("lib/db/schema.ts"), /content_revision INT NOT NULL DEFAULT 1/);
  assert.doesNotMatch(read("lib/db/schema.ts"), /seo_planning_decision_links/);
});

// --- Linking behavior ---

test("7. valid authoritative relationship passes with trusted selection", async () => {
  const state = seeded();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: await trusted(state),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "CREATED");
  assert.equal(result.link.decisionId, "seodec_1");
  assert.equal(result.link.selectionMarker, "server_research_binding");
});

test("8. missing Planning draft rejected", async () => {
  const state = seeded();
  const selection = await trusted(state);
  state.drafts.clear();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: selection,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "MISSING_PLANNING_DRAFT");
});

test("9. archived Planning rejected", async () => {
  const state = seeded();
  const selection = await trusted(state);
  state.drafts.set("seoplan_l4b1", draft({ archivedAt: "2026-10-07T00:00:00.000Z" }));
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: selection,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "PLANNING_ARCHIVED");
});

test("10. missing decision/run rejected", async () => {
  const state = seeded();
  const selection = await trusted(state);
  state.decisions.clear();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: selection,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "MISSING_DECISION");
});

test("11. mismatched decision/run rejected", () => {
  const validated = validatePlanningDecisionLineageCandidate(
    { planningDraftId: "seoplan_l4b1", decisionId: "seodec_1", actorAdminId: "admin_1" },
    {
      planningDraft: draft(),
      decision: decision({ runId: "seorun_other" }),
      researchRun: run({ id: "seorun_1" }),
      existingLinkByDraft: null,
      existingLinkByDecision: null,
    },
  );
  assert.equal(validated.ok, false);
  if (validated.ok) return;
  assert.equal(validated.errorCode, "DECISION_RUN_MISMATCH");
});

test("12. recommendation/topic/title mismatch rejected", () => {
  const validated = validatePlanningDecisionLineageCandidate(
    { planningDraftId: "seoplan_l4b1", decisionId: "seodec_1", actorAdminId: "admin_1" },
    {
      planningDraft: draft(),
      decision: decision({ topic: "Completely unrelated pricing guide" }),
      researchRun: run(),
      existingLinkByDraft: null,
      existingLinkByDecision: null,
    },
  );
  assert.equal(validated.ok, false);
  if (validated.ok) return;
  assert.equal(validated.errorCode, "IDENTITY_MISMATCH");
});

test("13. missing trusted selection context rejected — zero writes", async () => {
  const state = seeded();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "SELECTION_PROVENANCE_UNAVAILABLE");
  assert.equal(state.insertCalls, 0);
  assert.equal(state.links.length, 0);
});

test("14. forged client IDs / plain objects cannot establish authority", async () => {
  const state = seeded();
  const forged = {
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    researchRunId: "seorun_1",
    actorAdminId: "admin_1",
    boundAt: "2026-10-06T00:00:00.000Z",
  };
  assert.equal(isTrustedPlanningDecisionSelection(forged), false);
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: forged as TrustedPlanningDecisionSelection,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "SELECTION_PROVENANCE_UNAVAILABLE");
  assert.equal(state.insertCalls, 0);

  const mint = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    researchRunId: "seorun_1",
    actorAdminId: "admin_1",
    serverResearchBinding: { decisionId: "seodec_1" },
  });
  assert.equal(mint.ok, false);
});

test("15. unauthorized / different-owner selection rejected", async () => {
  const state = seeded();
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_other",
    store: memoryStore(state),
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_l4b1",
      decisionId: "seodec_1",
      researchRunId: "seorun_1",
      actorAdminId: "admin_other",
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "CROSS_ADMIN_FORBIDDEN");
  assert.equal(state.insertCalls, 0);
});

test("16. same-pair replay is idempotent", async () => {
  const state = seeded();
  const store = memoryStore(state);
  const selection = await trusted(state);
  const first = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: selection,
  });
  const second = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: selection,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.status, "CREATED");
  assert.equal(second.status, "IDEMPOTENT");
  assert.equal(state.links.length, 1);
  assert.equal(state.insertCalls, 1);
});

test("17. conflicting second link rejected", async () => {
  const state = seeded();
  const store = memoryStore(state);
  await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await trusted(state),
  });
  state.decisions.set(
    "seodec_2",
    decision({
      id: "seodec_2",
      opportunityIndex: 1,
      opportunityIdentity: "oid_2",
      topic: "Firestick IPTV setup checklist for UK viewers",
      workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    }),
  );
  const conflict = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_2",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_l4b1",
      decisionId: "seodec_2",
      researchRunId: "seorun_1",
      actorAdminId: "admin_1",
    }),
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.errorCode, "LINK_CONFLICT");
});

test("18. simulated concurrent conflict does not produce two authoritative links", async () => {
  const state = seeded();
  const store = memoryStore(state);
  const selection = await trusted(state);

  // Pre-insert competing link between validation and write simulation via race:
  // first writer succeeds; second hits UNIQUE.
  const a = attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: selection,
  });
  // Inject link mid-flight by wrapping insert — use sequential: first create, second conflict path
  const first = await a;
  assert.equal(first.ok, true);

  const second = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: selection,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.status, "IDEMPOTENT");
  assert.equal(state.links.length, 1);

  // True conflict race: two different decisions — only one may win
  const state2 = seeded();
  state2.decisions.set(
    "seodec_2",
    decision({
      id: "seodec_2",
      opportunityIndex: 1,
      opportunityIdentity: "oid_2",
    }),
  );
  const store2 = memoryStore(state2);
  let inserts = 0;
  const racingStore: PlanningLineageStore = {
    ...store2,
    async insertLinkInTransaction(link) {
      inserts += 1;
      if (inserts === 1) {
        await store2.insertLinkInTransaction(link);
        return;
      }
      throw new PlanningLineageConflictError();
    },
  };
  const r1 = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: racingStore,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_l4b1",
      decisionId: "seodec_1",
      researchRunId: "seorun_1",
      actorAdminId: "admin_1",
    }),
  });
  const r2 = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_2",
    actorAdminId: "admin_1",
    store: racingStore,
    trustedSelection: await createTrustedPlanningDecisionSelectionForTests({
      planningDraftId: "seoplan_l4b1",
      decisionId: "seodec_2",
      researchRunId: "seorun_1",
      actorAdminId: "admin_1",
    }),
  });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  assert.equal(state2.links.length, 1);
});

// --- Read behavior ---

test("19. valid linked Planning resolves to expected decision", async () => {
  const state = seeded();
  const store = memoryStore(state);
  await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await trusted(state),
  });
  const resolved = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_l4b1",
    store,
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok || resolved.state !== "LINKED") {
    assert.fail("expected LINKED");
  }
  assert.equal(resolved.decision.id, "seodec_1");
  assert.equal(resolved.researchRun.id, "seorun_1");
  assert.equal(resolved.pipelineSnapshotIncomplete, false);
});

test("20. unlinked Planning remains unlinked", async () => {
  const state = seeded();
  const resolved = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_l4b1",
    store: memoryStore(state),
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.state, "UNLINKED");
});

test("21. missing schema produces sanitized unavailable response", async () => {
  const state = seeded({ schemaAvailable: false });
  const write = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store: memoryStore(state),
    trustedSelection: await trusted(state),
  });
  assert.equal(write.ok, false);
  if (write.ok) return;
  assert.equal(write.errorCode, "SCHEMA_UNAVAILABLE");

  const resolved = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_l4b1",
    store: memoryStore(state),
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.state, "UNAVAILABLE");
  assert.equal(resolved.errorCode, "SCHEMA_UNAVAILABLE");
});

test("22. incomplete Pipeline history is not promoted to READY-capable snapshot", () => {
  const incomplete = decision({
    rfVerdict: null,
    nbaAction: null,
    priorityAutomationSelectable: null,
    pipelineFingerprint: null,
  });
  assert.equal(decisionSnapshotIncomplete(incomplete), true);
  assert.equal(decisionSnapshotIncomplete(decision()), false);
});

test("23. no broad scans — bounded read calls on resolve", async () => {
  const state = seeded();
  const store = memoryStore(state);
  await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_l4b1",
    decisionId: "seodec_1",
    actorAdminId: "admin_1",
    store,
    trustedSelection: await trusted(state),
  });
  state.readCalls = 0;
  await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_l4b1",
    store,
  });
  // schema + link + reverse link + decision + run ≤ 5
  assert.ok(state.readCalls <= 5, `readCalls=${state.readCalls}`);
});

// --- Existing workflow ---

test("24. legacy manual Proceed module remains present and unlinked to arbitrary decision ids", () => {
  const proceed = read("lib/cms/seo-planning/proceed.ts");
  assert.match(proceed, /proceedSeoPlanning|buildSeoPlanningFingerprint|NEW_BLOG/);
  assert.doesNotMatch(proceed, /seo_planning_decision_links|attemptEstablishPlanningDecisionLink/);
  assert.doesNotMatch(proceed, /decisionId\s*:\s*raw/);
});

test("25. Planning save path does not write lineage", () => {
  const workspace = read("lib/cms/seo-planning/workspace.ts");
  const lineageRepo = read("lib/cms/seo-planning-lineage/repository.ts");
  assert.doesNotMatch(workspace, /seo_planning_decision_links/);
  assert.doesNotMatch(lineageRepo, /saveSeoPlanningDraft|payload\s*=/);
  assert.match(lineageRepo, /Does not mutate seo_planning_drafts\.payload/);
});

test("26. unlinked Planning stays UNLINKED; lineage is not auto-publish authorization", async () => {
  const state = seeded();
  const planning = await resolvePlanningDecisionLineage({
    planningDraftId: "seoplan_l4b1",
    store: memoryStore(state),
  });
  assert.equal(planning.ok, true);
  if (planning.ok) assert.equal(planning.state, "UNLINKED");

  const decision = await resolveDecisionPlanningLineage({
    decisionId: "seodec_1",
    store: memoryStore(state),
  });
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.state, "UNLINKED");

  // Establishing a link still does not grant publish/eligibility authority.
  const repo = read("lib/cms/seo-planning-lineage/repository.ts");
  assert.doesNotMatch(repo, /autonomousEligible|automationSelectable|publicationReady/);
  assert.match(repo, /SELECTION_PROVENANCE_UNAVAILABLE/);
});

test("27. no CMS content writes, publishing or provider calls in lineage modules", () => {
  for (const rel of [
    "lib/cms/seo-planning-lineage/repository.ts",
    "lib/cms/seo-planning-lineage/read.ts",
    "lib/cms/seo-planning-lineage/validate.ts",
    "lib/cms/seo-planning-lineage/selection.ts",
    "lib/cms/seo-planning-lineage/schema-ddl.ts",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bfetch\s*\(/);
    assert.doesNotMatch(src, /requestOpenAi|generateChatgpt|querySearchAnalytics/);
    assert.doesNotMatch(src, /savePost|savePage|INSERT INTO blog_posts|publicationReady:\s*true/);
  }
});

test("DDL documents RESTRICT FKs and uniqueness", () => {
  assert.match(SEO_PLANNING_DECISION_LINKS_DDL, /UNIQUE KEY seo_planning_decision_links_draft_unique/);
  assert.match(SEO_PLANNING_DECISION_LINKS_DDL, /UNIQUE KEY seo_planning_decision_links_decision_unique/);
  assert.match(SEO_PLANNING_DECISION_LINKS_DDL, /ON DELETE RESTRICT/);
  assert.match(SEO_PLANNING_DECISION_LINKS_DDL, /REFERENCES seo_planning_drafts/);
  assert.match(SEO_PLANNING_DECISION_LINKS_DDL, /REFERENCES seo_opportunity_decisions/);
});
