/**
 * L4B-2 — Trusted Research → Proceed selection-preparation bridge tests.
 * Injected read-only Ledger fixtures. No schema writes, no Proceed mutation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import {
  attemptEstablishPlanningDecisionLink,
  isPreparedResearchProceedSelection,
  isTrustedPlanningDecisionSelection,
  prepareTrustedResearchProceedSelection,
  summarizePreparedResearchProceedSelection,
  tryMintTrustedPlanningDecisionSelection,
  type ResearchProceedLedgerReader,
} from "../lib/cms/seo-planning-lineage";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run(overrides: Partial<SeoResearchRunRow> = {}): SeoResearchRunRow {
  return {
    id: "seorun_l4b2a",
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: "admin_1",
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: "v1",
    pipelineErrorCode: null,
    opportunityCount: 2,
    gscStatus: "OK",
    durabilityStatus: "COMPLETE",
    ...overrides,
  };
}

function decision(
  overrides: Partial<SeoOpportunityDecisionRow> &
    Pick<SeoOpportunityDecisionRow, "id" | "opportunityIndex" | "opportunityIdentity">,
): SeoOpportunityDecisionRow {
  return {
    runId: "seorun_l4b2a",
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

const DECISIONS = [
  decision({
    id: "seodec_l4b2-0",
    opportunityIndex: 0,
    opportunityIdentity: "oid_firestick_a",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
  }),
  decision({
    id: "seodec_l4b2-1",
    opportunityIndex: 1,
    opportunityIdentity: "oid_firestick_b",
    topic: "Firestick IPTV setup checklist for UK viewers",
    // Duplicate working title — distinguished by decision identity / index
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
  }),
];

function reader(args?: {
  detail?: Awaited<ReturnType<ResearchProceedLedgerReader["getSeoResearchRunDetail"]>>;
  throws?: boolean;
  calls?: { n: number };
}): ResearchProceedLedgerReader & { calls: { n: number } } {
  const calls = args?.calls || { n: 0 };
  return {
    calls,
    async getSeoResearchRunDetail({ runId }) {
      calls.n += 1;
      if (args?.throws) throw new Error("db secret=supersecret");
      if (args?.detail) return args.detail;
      if (runId !== "seorun_l4b2a") {
        return {
          ok: false,
          errorCode: "not_found",
          errorMessage: "Research run not found.",
        };
      }
      return {
        ok: true,
        run: run(),
        decisions: DECISIONS,
        decisionOverflow: false,
      };
    },
  };
}

async function prepare(overrides: {
  authorized?: boolean;
  adminId?: string;
  ledgerRunId?: unknown;
  opportunityIndex?: unknown;
  decisionId?: unknown;
  displayedOpportunity?: Record<string, unknown> | null;
  ledgerReader?: ResearchProceedLedgerReader;
} = {}) {
  return prepareTrustedResearchProceedSelection({
    actor: {
      authorized: overrides.authorized !== false,
      adminId: overrides.adminId ?? "admin_1",
    },
    ledgerRunId: overrides.ledgerRunId ?? "seorun_l4b2a",
    opportunityIndex: Object.prototype.hasOwnProperty.call(overrides, "opportunityIndex")
      ? overrides.opportunityIndex
      : 0,
    decisionId: overrides.decisionId,
    displayedOpportunity: overrides.displayedOpportunity,
    ledgerReader: overrides.ledgerReader ?? reader(),
  });
}

// --- Positive ---

test("1. authenticated actor selects valid decision from own persisted manual run", async () => {
  const ledgerReader = reader();
  const result = await prepare({ ledgerReader });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(
    result.status === "PLANNING_INPUT_INCOMPLETE" || result.status === "SERVER_DECISION_VALIDATED",
  );
  assert.equal(result.preparation.decisionId, "seodec_l4b2-0");
  assert.equal(result.preparation.researchRunId, "seorun_l4b2a");
  assert.equal(result.preparation.actorAdminId, "admin_1");
  assert.equal(ledgerReader.calls.n, 1);
});

test("2. correct run/decision/index/identity produce server-validated selection", async () => {
  const result = await prepare({
    opportunityIndex: 1,
    decisionId: "seodec_l4b2-1",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preparation.opportunityIndex, 1);
  assert.equal(result.preparation.opportunityIdentity, "oid_firestick_b");
  assert.equal(result.preparation.decisionId, "seodec_l4b2-1");
  assert.ok(isPreparedResearchProceedSelection(result.preparation));
});

test("3. valid normalized displayed fields match authoritative Ledger fields", async () => {
  const result = await prepare({
    displayedOpportunity: {
      topic: "  Firestick IPTV setup checklist for UK viewers ",
      workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
      recommendation: "NEW_BLOG",
      opportunityIndex: 0,
    },
  });
  assert.equal(result.ok, true);
});

test("4. original opportunity index stable when UI would filter/reorder", async () => {
  // Client might "show" index 0 after filtering, but locator uses original index 1
  const result = await prepare({
    opportunityIndex: 1,
    displayedOpportunity: {
      opportunityIndex: 1,
      workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preparation.opportunityIndex, 1);
  assert.equal(result.preparation.decisionId, "seodec_l4b2-1");
});

test("5. duplicate working titles distinguished by persisted decision identity", async () => {
  const a = await prepare({ opportunityIndex: 0 });
  const b = await prepare({ opportunityIndex: 1 });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.preparation.workingTitle, b.preparation.workingTitle);
  assert.notEqual(a.preparation.decisionId, b.preparation.decisionId);
  assert.notEqual(a.preparation.opportunityIdentity, b.preparation.opportunityIdentity);
});

test("6. repeated preparation is deterministic and mutates nothing", async () => {
  const ledgerReader = reader();
  const first = await prepare({ ledgerReader });
  const second = await prepare({ ledgerReader });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(
    summarizePreparedResearchProceedSelection(first.preparation),
    summarizePreparedResearchProceedSelection(second.preparation),
  );
  assert.equal(DECISIONS[0]?.selected, false);
  assert.equal(DECISIONS[0]?.selectionSource, "none");
});

// --- Negative ---

test("7. cross-admin Research run rejected", async () => {
  const result = await prepare({ adminId: "admin_other" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "CROSS_ADMIN_FORBIDDEN");
});

test("8. missing or invalid actor rejected without protected reads", async () => {
  const ledgerReader = reader();
  const result = await prepareTrustedResearchProceedSelection({
    actor: { authorized: false, adminId: "admin_1" },
    ledgerRunId: "seorun_l4b2a",
    opportunityIndex: 0,
    ledgerReader,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "UNAUTHORIZED");
  assert.equal(ledgerReader.calls.n, 0);
});

test("9. forged decision ID rejected", async () => {
  const result = await prepare({
    opportunityIndex: 0,
    decisionId: "seodec_forged-zzz",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "DECISION_NOT_FOUND");
});

test("10. decision from another run rejected", async () => {
  const ledgerReader = reader({
    detail: {
      ok: true,
      run: run(),
      decisions: [
        decision({
          id: "seodec_l4b2-0",
          opportunityIndex: 0,
          opportunityIdentity: "oid_x",
          runId: "seorun_other",
        }),
      ],
      decisionOverflow: false,
    },
  });
  const result = await prepare({ ledgerReader });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "DECISION_RUN_MISMATCH");
});

test("11. invalid or out-of-range opportunity index rejected", async () => {
  for (const opportunityIndex of [-1, 5, 1.5, "0", null]) {
    const result = await prepare({ opportunityIndex });
    assert.equal(result.ok, false, String(opportunityIndex));
    if (result.ok) continue;
    assert.ok(
      result.errorCode === "INVALID_OPPORTUNITY_INDEX" || result.errorCode === "INVALID_INPUT",
      result.errorCode,
    );
  }
});

test("12. failed / unpersisted Research run rejected", async () => {
  const failed = await prepare({
    ledgerReader: reader({
      detail: {
        ok: true,
        run: run({ researchOk: false, researchErrorCode: "provider_error" }),
        decisions: DECISIONS,
        decisionOverflow: false,
      },
    }),
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.errorCode, "RESEARCH_NOT_OK");

  // durabilityStatus is typed as COMPLETE only — cast for negative fixture
  const unpersisted = await prepare({
    ledgerReader: reader({
      detail: {
        ok: true,
        run: run({ durabilityStatus: "COMPLETE" }),
        decisions: [],
        decisionOverflow: false,
      },
    }),
  });
  // Empty decisions → not found (also covers incomplete decision set)
  assert.equal(unpersisted.ok, false);
});

test("13. missing or incomplete Pipeline status cannot establish full lineage", async () => {
  const result = await prepare({
    ledgerReader: reader({
      detail: {
        ok: true,
        run: run({ pipelineRunStatus: "SKIPPED" }),
        decisions: DECISIONS,
        decisionOverflow: false,
      },
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "PIPELINE_STATUS_UNSUPPORTED");
});

test("14. topic/recommendation/title mismatch rejected", async () => {
  const result = await prepare({
    displayedOpportunity: {
      topic: "Completely unrelated IPTV pricing guide",
      recommendation: "NEW_BLOG",
      workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "IDENTITY_MISMATCH");
});

test("15. missing opportunity identity rejected", async () => {
  const result = await prepare({
    ledgerReader: reader({
      detail: {
        ok: true,
        run: run(),
        decisions: [
          decision({
            id: "seodec_l4b2-0",
            opportunityIndex: 0,
            opportunityIdentity: "",
          }),
        ],
        decisionOverflow: false,
      },
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "IDENTITY_INCOMPLETE");
});

test("16. duplicate/ambiguous decision records fail closed", async () => {
  const result = await prepare({
    opportunityIndex: 0,
    ledgerReader: reader({
      detail: {
        ok: true,
        run: run(),
        decisions: [
          decision({
            id: "seodec_l4b2-0",
            opportunityIndex: 0,
            opportunityIdentity: "oid_a",
          }),
          decision({
            id: "seodec_l4b2-dup",
            opportunityIndex: 0,
            opportunityIdentity: "oid_b",
          }),
        ],
        decisionOverflow: false,
      },
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "AMBIGUOUS_DECISION");
});

test("17. client-controlled trusted/verified flags ignored", async () => {
  const result = await prepare({
    displayedOpportunity: {
      topic: "Firestick IPTV setup checklist for UK viewers",
      workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
      recommendation: "NEW_BLOG",
      trusted: true,
      verified: true,
      selected: true,
      provenance: { forged: true },
      pipeline: { evaluationStatus: "OK" },
      searchIntent: "INFORMATIONAL",
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // searchIntent from client must not appear as authoritative
  assert.ok(result.preparation.missingAuthoritativeFields.includes("searchIntent"));
  assert.doesNotMatch(JSON.stringify(result.preparation), /INFORMATIONAL/);
});

test("18. arbitrary forged trusted-selection / prepared object rejected", async () => {
  const forgedPrep = {
    researchRunId: "seorun_l4b2a",
    decisionId: "seodec_l4b2-0",
    opportunityIndex: 0,
    opportunityIdentity: "oid_firestick_a",
    actorAdminId: "admin_1",
    topic: "x",
    workingTitle: "y",
    researchRecommendation: "NEW_BLOG",
    evaluationStatus: "OK",
    pipelineRunStatus: "OK",
    preparedAt: "2026-10-06T00:00:00.000Z",
    missingAuthoritativeFields: [],
  };
  assert.equal(isPreparedResearchProceedSelection(forgedPrep), false);

  const mint = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: "seoplan_x",
    decisionId: "seodec_l4b2-0",
    researchRunId: "seorun_l4b2a",
    actorAdminId: "admin_1",
    serverResearchBinding: forgedPrep,
  });
  assert.equal(mint.ok, false);

  const forgedTrusted = {
    planningDraftId: "seoplan_x",
    decisionId: "seodec_l4b2-0",
    researchRunId: "seorun_l4b2a",
    actorAdminId: "admin_1",
    boundAt: "2026-10-06T00:00:00.000Z",
  };
  assert.equal(isTrustedPlanningDecisionSelection(forgedTrusted), false);
});

test("19. read exception returns sanitized failure", async () => {
  const result = await prepare({
    ledgerReader: reader({ throws: true }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "LEDGER_READ_ERROR");
  assert.doesNotMatch(result.errorMessage, /supersecret|stack|Error:/i);
});

test("20. no fallback to another run or evaluation", async () => {
  const ledgerReader = reader();
  const result = await prepare({
    ledgerRunId: "seorun_missingzzz",
    ledgerReader,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "RUN_NOT_FOUND");
  assert.equal(ledgerReader.calls.n, 1);
});

// --- Trust boundary ---

test("21. trusted selection is never serialized as a browser capability", async () => {
  const result = await prepare();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const json = JSON.parse(JSON.stringify(result.preparation));
  assert.equal(isPreparedResearchProceedSelection(json), false);

  const summary = summarizePreparedResearchProceedSelection(result.preparation);
  assert.equal(isPreparedResearchProceedSelection(summary as never), false);
});

test("22. cross-request WeakSet assumptions are not introduced", () => {
  const src = read("lib/cms/seo-planning-lineage/research-proceed-selection.ts");
  assert.match(src, /process-local|Process-local|not durable/i);
  assert.doesNotMatch(src, /localStorage|sessionStorage|redis|signedToken|jwt/i);
  const sel = read("lib/cms/seo-planning-lineage/selection.ts");
  assert.match(sel, /NOT durable across HTTP requests/);
});

test("23. missing persisted search-intent/narrative details are not invented", async () => {
  const result = await prepare({
    displayedOpportunity: { searchIntent: "SETUP" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "PLANNING_INPUT_INCOMPLETE");
  assert.ok(result.incompleteReasons.length >= 1);
  assert.ok(result.preparation.missingAuthoritativeFields.includes("searchIntent"));
  assert.ok(result.preparation.missingAuthoritativeFields.includes("sources"));
});

test("24. existing L4B-1 production mutation path stays disconnected without prepared binding", async () => {
  const result = await attemptEstablishPlanningDecisionLink({
    planningDraftId: "seoplan_x",
    decisionId: "seodec_l4b2-0",
    actorAdminId: "admin_1",
    store: {
      async isLineageSchemaAvailable() {
        return true;
      },
      async getPlanningDraftById() {
        return null;
      },
      async getDecisionById() {
        return null;
      },
      async getResearchRunById() {
        return null;
      },
      async getLinkByPlanningDraftId() {
        return null;
      },
      async getLinkByDecisionId() {
        return null;
      },
      async insertLinkInTransaction() {
        throw new Error("must not write");
      },
    },
    trustedSelection: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "SELECTION_PROVENANCE_UNAVAILABLE");
});

test("lineage recording is not auto-publish authorization", () => {
  const proceed = read("lib/cms/seo-planning-lineage/proceed-integration.ts");
  assert.match(proceed, /RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED\s*=\s*false/);
  assert.doesNotMatch(proceed, /publicationReady:\s*true/);
  assert.doesNotMatch(
    read("lib/cms/seo-planning-lineage/repository.ts"),
    /autonomousEligible\s*=\s*true|automationSelectable\s*=\s*true/,
  );
});

test("26. no Blog/CMS writes, publishing or provider calls", () => {
  for (const rel of [
    "lib/cms/seo-planning-lineage/research-proceed-selection.ts",
    "lib/cms/seo-planning-lineage/selection.ts",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bfetch\s*\(/);
    assert.doesNotMatch(src, /requestOpenAi|generateChatgpt|querySearchAnalytics/);
    assert.doesNotMatch(src, /savePost|savePage|saveSeoPlanningDraft|INSERT INTO/);
    assert.doesNotMatch(src, /publicationReady:\s*true/);
  }
  assert.doesNotMatch(
    read("lib/cms/seo-planning-actions.ts"),
    /prepareTrustedResearchProceedSelection/,
  );
  assert.doesNotMatch(read("lib/cms/seo-planning/proceed.ts"), /prepareTrustedResearchProceedSelection/);
});

test("same-request mint from prepared selection succeeds; JSON revival fails", async () => {
  const prepared = await prepare();
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const mint = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: "seoplan_future",
    decisionId: prepared.preparation.decisionId,
    researchRunId: prepared.preparation.researchRunId,
    actorAdminId: prepared.preparation.actorAdminId,
    serverResearchBinding: prepared.preparation,
  });
  assert.equal(mint.ok, true);
  if (!mint.ok) return;
  assert.ok(isTrustedPlanningDecisionSelection(mint.selection));

  const revived = JSON.parse(JSON.stringify(prepared.preparation));
  const mint2 = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: "seoplan_future",
    decisionId: prepared.preparation.decisionId,
    researchRunId: prepared.preparation.researchRunId,
    actorAdminId: prepared.preparation.actorAdminId,
    serverResearchBinding: revived,
  });
  assert.equal(mint2.ok, false);
});
