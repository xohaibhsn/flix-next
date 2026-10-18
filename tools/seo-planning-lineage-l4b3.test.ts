/**
 * L4B-3 — Same-request Research selection → Planning Proceed integration tests.
 * Injected Ledger reader + in-memory Planning catalog. No MySQL. No schema writes.
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
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED,
  attemptEstablishPlanningDecisionLink,
  isPreparedResearchProceedSelection,
  isTrustedPlanningDecisionSelection,
  proceedFromTrustedResearchSelection,
  researchProceedIntegrationAllowsLinkedStatus,
  tryMintTrustedPlanningDecisionSelection,
  type ResearchProceedEditorialSupplemental,
  type ResearchProceedLedgerReader,
} from "../lib/cms/seo-planning-lineage";
import { proceedSeoOpportunityToPlanningDraft } from "../lib/cms/seo-planning/proceed";
import type { BlogPost, RedirectRule, SeoPlanningDraft } from "../lib/cms/types";
import { buildSeoPlanningFingerprint } from "../lib/cms/seo-planning/fingerprint";
import { slugify } from "../lib/cms/slug";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run(overrides: Partial<SeoResearchRunRow> = {}): SeoResearchRunRow {
  return {
    id: "seorun_l4b3a",
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: "admin_shared",
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
    runId: "seorun_l4b3a",
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
    id: "seodec_l4b3-0",
    opportunityIndex: 0,
    opportunityIdentity: "oid_firestick_a",
  }),
  decision({
    id: "seodec_l4b3-1",
    opportunityIndex: 1,
    opportunityIdentity: "oid_firestick_b",
    topic: "Firestick IPTV troubleshooting for UK Wi-Fi",
    workingTitle: "Firestick IPTV Troubleshooting for UK Wi-Fi",
  }),
];

function reader(args?: {
  detail?: Awaited<ReturnType<ResearchProceedLedgerReader["getSeoResearchRunDetail"]>>;
  throws?: boolean;
  mutateDecision?: (d: SeoOpportunityDecisionRow) => SeoOpportunityDecisionRow;
  calls?: { n: number };
}): ResearchProceedLedgerReader & { calls: { n: number } } {
  const calls = args?.calls || { n: 0 };
  return {
    calls,
    async getSeoResearchRunDetail({ runId }) {
      calls.n += 1;
      if (args?.throws) throw new Error("mysql secret=supersecret stack TRACE");
      if (args?.detail) return args.detail;
      if (runId !== "seorun_l4b3a") {
        return {
          ok: false,
          errorCode: "not_found",
          errorMessage: "Research run not found.",
        };
      }
      const decisions = DECISIONS.map((d) =>
        args?.mutateDecision ? args.mutateDecision({ ...d }) : { ...d },
      );
      return {
        ok: true,
        run: run(),
        decisions,
        decisionOverflow: false,
      };
    },
  };
}

function memoryCatalog(seed: {
  posts?: BlogPost[];
  drafts?: SeoPlanningDraft[];
  failSave?: boolean;
}) {
  const posts = [...(seed.posts || [])];
  const drafts = [...(seed.drafts || [])];
  let openAiCalls = 0;
  let gscCalls = 0;
  let saveCalls = 0;

  return {
    posts,
    drafts,
    openAiCalls: () => openAiCalls,
    gscCalls: () => gscCalls,
    saveCalls: () => saveCalls,
    bumpOpenAi() {
      openAiCalls += 1;
    },
    bumpGsc() {
      gscCalls += 1;
    },
    catalog: {
      listPosts: async () => posts,
      listPages: async () => [],
      listCategories: async () => [],
      listActiveRedirects: async (): Promise<RedirectRule[]> => [],
      getSeoPlanningDraftByFingerprint: async (fingerprint: string) =>
        drafts.find((d) => d.fingerprint === fingerprint) || null,
      saveSeoPlanningDraft: async (draft: SeoPlanningDraft) => {
        saveCalls += 1;
        if (seed.failSave) {
          throw new Error("disk secret=xyz INSERT INTO seo_planning_drafts");
        }
        const owner = drafts.find((d) => d.fingerprint === draft.fingerprint && d.id !== draft.id);
        if (owner) {
          throw Object.assign(new Error("Planning draft fingerprint already exists."), {
            code: "ER_DUP_ENTRY",
            errno: 1062,
          });
        }
        const idx = drafts.findIndex((d) => d.id === draft.id);
        if (idx >= 0) drafts[idx] = draft;
        else drafts.push(draft);
        return draft;
      },
    },
  };
}

function editorial(
  overrides: Partial<ResearchProceedEditorialSupplemental> = {},
): ResearchProceedEditorialSupplemental {
  return {
    searchIntent: "SETUP",
    whyNow: "Seasonal UK Firestick setup demand.",
    webEvidence: "Viewer guides emphasize HDMI and Wi-Fi steps.",
    suggestedAngle: "Checklist for first-time UK Firestick IPTV setup.",
    nextStep: "Draft a bounded setup checklist.",
    sources: [{ title: "Amazon Help", url: "https://www.amazon.co.uk/help", domain: "amazon.co.uk" }],
    ...overrides,
  };
}

async function integrate(overrides: {
  authorized?: boolean;
  adminId?: string;
  ledgerRunId?: unknown;
  opportunityIndex?: unknown;
  decisionId?: unknown;
  displayedOpportunity?: Record<string, unknown> | null;
  editorialSupplemental?: ResearchProceedEditorialSupplemental;
  ledgerReader?: ResearchProceedLedgerReader;
  catalog?: ReturnType<typeof memoryCatalog>["catalog"];
  createIdFn?: (prefix?: string) => string;
  forgedPreparation?: unknown;
  now?: string;
} = {}) {
  const mem = overrides.catalog
    ? null
    : memoryCatalog({});
  return {
    mem,
    result: await proceedFromTrustedResearchSelection({
      actor: {
        authorized: overrides.authorized !== false,
        adminId: overrides.adminId ?? "admin_shared",
      },
      ledgerRunId: overrides.ledgerRunId ?? "seorun_l4b3a",
      opportunityIndex: Object.prototype.hasOwnProperty.call(overrides, "opportunityIndex")
        ? overrides.opportunityIndex
        : 0,
      decisionId: overrides.decisionId,
      displayedOpportunity: overrides.displayedOpportunity,
      editorialSupplemental: overrides.editorialSupplemental ?? editorial(),
      ledgerReader: overrides.ledgerReader ?? reader(),
      catalog: overrides.catalog ?? mem!.catalog,
      createIdFn: overrides.createIdFn ?? (() => "seoplan_l4b3_new"),
      forgedPreparation: overrides.forgedPreparation,
      now: overrides.now ?? "2026-10-15T00:00:00.000Z",
    }),
  };
}

// --- Positive ---

test("1. valid persisted decision + shared Admin account proceeds", async () => {
  const { result, mem } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selection.summary.decisionId, "seodec_l4b3-0");
  assert.equal(result.selection.summary.researchRunId, "seorun_l4b3a");
  assert.equal(result.planning.created, true);
  assert.equal(mem?.drafts[0]?.createdBy, "admin_shared");
});

test("2. same-request selection preparation succeeds", async () => {
  const { result } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selection.status, "SELECTION_PREPARED");
  assert.equal(result.selection.trustedMinted, true);
  assert.equal(result.selection.summary.opportunityIdentity, "oid_firestick_a");
});

test("3. new Planning draft created via existing Proceed implementation", async () => {
  const src = read("lib/cms/seo-planning-lineage/proceed-integration.ts");
  assert.match(src, /proceedSeoOpportunityToPlanningDraft/);
  const { result, mem } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.planning.created, true);
  assert.equal(mem?.drafts.length, 1);
  assert.equal(mem?.drafts[0]?.workflowStatus, "PLANNING");
});

test("4. returned draft id comes from actual saved Planning record", async () => {
  const { result, mem } = await integrate({
    createIdFn: () => "seoplan_from_catalog",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.planning.draftId, "seoplan_from_catalog");
  assert.equal(mem?.drafts[0]?.id, "seoplan_from_catalog");
  assert.equal(result.planning.draftId, mem?.drafts[0]?.id);
});

test("5. authoritative Ledger fields cannot be overridden by browser input", async () => {
  const { result } = await integrate({
    editorialSupplemental: editorial({
      recommendation: "REFRESH_EXISTING",
      topic: "Forged topic",
      workingTitle: "Forged title",
      searchIntent: "SETUP",
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "IDENTITY_MISMATCH");
});

test("6. editorial supplemental fields sanitized and remain unverified", async () => {
  const { result, mem } = await integrate({
    editorialSupplemental: editorial({
      searchIntent: "SETUP",
      whyNow: "  Seasonal demand  ",
      webEvidence: "<script>alert(1)</script>evidence",
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provenance.editorialSupplemental.verified, false);
  assert.equal(
    result.provenance.editorialSupplemental.source,
    "manual_editorial_supplemental",
  );
  assert.equal(result.provenance.editorialSupplemental.searchIntent, "SETUP");
  assert.equal(result.provenance.editorialSupplemental.whyNow, "Seasonal demand");
  // Text sanitize bounds/trim only (same as existing Proceed) — not claimed Ledger-verified.
  assert.equal(mem?.drafts[0]?.searchIntent, "SETUP");
  assert.notEqual(
    (mem?.drafts[0]?.payload as { opportunity?: { searchIntentProvenance?: string } })
      ?.opportunity?.searchIntentProvenance,
    "ledger",
  );
});

test("7. existing Planning draft opens without falsely claiming a new link", async () => {
  const slug = slugify("Firestick IPTV Setup Checklist for UK Viewers");
  const fingerprint = buildSeoPlanningFingerprint({
    recommendation: "NEW_BLOG",
    proposedSlug: slug,
  });
  const mem = memoryCatalog({
    drafts: [
      {
        id: "seoplan_existing",
        recommendation: "NEW_BLOG",
        workflowStatus: "PLANNING",
        fingerprint,
        topic: "Firestick IPTV setup checklist for UK viewers",
        workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
        proposedSlug: slug,
        targetPostId: null,
        matchedPublicUrl: "",
        restorePath: "",
        searchIntent: "INFORMATIONAL",
        linkedPostId: null,
        createdBy: "admin_other",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        archivedAt: null,
        payload: { opportunity: { topic: "prior" } },
      },
    ],
  });
  const priorPayload = JSON.stringify(mem.drafts[0]?.payload);
  const { result } = await integrate({ catalog: mem.catalog });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.planning.created, false);
  assert.equal(result.planning.openedExisting, true);
  assert.equal(result.planning.draftId, "seoplan_existing");
  assert.equal(result.linkage.status, "DRAFT_CONFLICT");
  assert.equal(result.linkage.durableLink, false);
  assert.equal(result.selection.trustedMinted, false);
  assert.equal(JSON.stringify(mem.drafts[0]?.payload), priorPayload);
});

test("8. original opportunity index remains correct after UI filtering", async () => {
  const { result } = await integrate({
    opportunityIndex: 1,
    displayedOpportunity: {
      opportunityIndex: 1,
      topic: "Firestick IPTV troubleshooting for UK Wi-Fi",
      workingTitle: "Firestick IPTV Troubleshooting for UK Wi-Fi",
      recommendation: "NEW_BLOG",
    },
    createIdFn: () => "seoplan_idx1",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selection.summary.opportunityIndex, 1);
  assert.equal(result.selection.summary.decisionId, "seodec_l4b3-1");
  assert.equal(result.provenance.authoritative.opportunityIndex, 1);
});

test("9. same-request trusted selection cannot be serialized/replayed", async () => {
  const { result } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Result must not embed WeakSet capability objects
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /WeakSet|serverResearchBinding/);
  const revived = JSON.parse(serialized);
  assert.equal(isPreparedResearchProceedSelection(revived.selection), false);
  assert.equal(isTrustedPlanningDecisionSelection(revived.selection), false);

  const mint = tryMintTrustedPlanningDecisionSelection({
    planningDraftId: result.planning.draftId,
    decisionId: result.selection.summary.decisionId,
    researchRunId: result.selection.summary.researchRunId,
    actorAdminId: "admin_shared",
    serverResearchBinding: JSON.parse(
      JSON.stringify({
        researchRunId: result.selection.summary.researchRunId,
        decisionId: result.selection.summary.decisionId,
      }),
    ),
  });
  assert.equal(mint.ok, false);
});

// --- Negative ---

test("10. wrong Ledger run rejected", async () => {
  const { result } = await integrate({ ledgerRunId: "seorun_other" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "SELECTION_UNAVAILABLE");
});

test("11. cross-account decision rejected", async () => {
  const { result } = await integrate({ adminId: "admin_other_account" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "SELECTION_UNAVAILABLE");
});

test("12. incorrect opportunity index rejected", async () => {
  const { result } = await integrate({
    opportunityIndex: 0,
    decisionId: "seodec_l4b3-1",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "SELECTION_UNAVAILABLE");
});

test("13. contradictory recommendation/title/topic rejected", async () => {
  const { result } = await integrate({
    displayedOpportunity: {
      topic: "Completely different topic",
      workingTitle: "Completely different title",
      recommendation: "REFRESH_EXISTING",
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "SELECTION_UNAVAILABLE");
});

test("14. missing authoritative decision rejected", async () => {
  const { result } = await integrate({
    ledgerReader: reader({
      detail: {
        ok: true,
        run: run(),
        decisions: [],
        decisionOverflow: false,
      },
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "SELECTION_UNAVAILABLE");
});

test("15. missing required Planning supplemental handled safely", async () => {
  const { result } = await integrate({
    editorialSupplemental: editorial({ searchIntent: "" }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "PLANNING_INPUT_INCOMPLETE");
  assert.equal(result.errorCode, "MISSING_SUPPLEMENTAL");
  assert.match(result.errorMessage, /search intent/i);
});

test("16. unsupported Proceed recommendation rejected", async () => {
  const { result } = await integrate({
    ledgerReader: reader({
      mutateDecision: (d) =>
        d.opportunityIndex === 0
          ? { ...d, researchRecommendation: "SKIP" }
          : d,
    }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "UNSUPPORTED_RECOMMENDATION");
});

test("17. archived existing Planning draft blocked", async () => {
  const slug = slugify("Firestick IPTV Setup Checklist for UK Viewers");
  const fingerprint = buildSeoPlanningFingerprint({
    recommendation: "NEW_BLOG",
    proposedSlug: slug,
  });
  const mem = memoryCatalog({
    drafts: [
      {
        id: "seoplan_archived",
        recommendation: "NEW_BLOG",
        workflowStatus: "PLANNING",
        fingerprint,
        topic: "Firestick IPTV setup checklist for UK viewers",
        workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
        proposedSlug: slug,
        targetPostId: null,
        matchedPublicUrl: "",
        restorePath: "",
        searchIntent: "SETUP",
        linkedPostId: null,
        createdBy: "admin_shared",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        archivedAt: "2026-10-02T00:00:00.000Z",
        payload: {},
      },
    ],
  });
  const { result } = await integrate({ catalog: mem.catalog });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "PROCEED_FAILED");
  assert.equal(result.linkage.status, "PROCEED_FAILED");
});

test("18. conflicting existing draft never silently relinked", async () => {
  const slug = slugify("Firestick IPTV Setup Checklist for UK Viewers");
  const fingerprint = buildSeoPlanningFingerprint({
    recommendation: "NEW_BLOG",
    proposedSlug: slug,
  });
  const mem = memoryCatalog({
    drafts: [
      {
        id: "seoplan_prior_link_claim",
        recommendation: "NEW_BLOG",
        workflowStatus: "PLANNING",
        fingerprint,
        topic: "Firestick IPTV setup checklist for UK viewers",
        workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
        proposedSlug: slug,
        targetPostId: null,
        matchedPublicUrl: "",
        restorePath: "",
        searchIntent: "SETUP",
        linkedPostId: null,
        createdBy: "admin_shared",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        archivedAt: null,
        payload: { note: "prior" },
      },
    ],
  });
  const { result } = await integrate({ catalog: mem.catalog });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.linkage.status, "DRAFT_CONFLICT");
  assert.notEqual(result.linkage.status, "NOT_PERSISTED_SCHEMA_INACTIVE");
  assert.equal(result.selection.status, "SELECTION_DEFERRED");
  assert.equal(mem.saveCalls(), 0);
});

test("19. save failure cannot mint successful draft lineage", async () => {
  const mem = memoryCatalog({ failSave: true });
  const { result } = await integrate({ catalog: mem.catalog });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "PROCEED_FAILED");
  assert.equal(result.planning?.created, false);
  assert.equal(result.linkage.durableLink, false);
  assert.doesNotMatch(result.errorMessage, /secret=|INSERT INTO|stack/i);
});

test("20. forged selection object rejected as orchestration authority", async () => {
  const forged = {
    researchRunId: "seorun_l4b3a",
    decisionId: "seodec_l4b3-0",
    opportunityIndex: 0,
    opportunityIdentity: "forged",
    actorAdminId: "admin_shared",
    topic: "Forged",
    workingTitle: "Forged",
    researchRecommendation: "NEW_BLOG",
    evaluationStatus: "OK",
    pipelineRunStatus: "OK",
    preparedAt: "2026-10-15T00:00:00.000Z",
    missingAuthoritativeFields: [],
  };
  // Even with forgedPreparation smuggled, prepare() still validates Ledger;
  // forged object is not used as the binding for Proceed identity.
  const { result } = await integrate({
    forgedPreparation: forged,
    displayedOpportunity: {
      topic: "Forged",
      workingTitle: "Forged",
      recommendation: "NEW_BLOG",
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "SELECTION_UNAVAILABLE");
});

test("21. missing schema cannot produce LINKED", async () => {
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED, false);
  assert.equal(researchProceedIntegrationAllowsLinkedStatus(), false);
  const { result } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.linkage.status, "NOT_PERSISTED_SCHEMA_INACTIVE");
  assert.equal(result.linkage.durableLink, false);
  assert.notEqual(result.linkage.status as string, "LINKED");
  const src = read("lib/cms/seo-planning-lineage/proceed-integration.ts");
  assert.doesNotMatch(src, /from ["']@\/lib\/cms\/seo-planning-lineage\/repository["']/);
  assert.doesNotMatch(src, /insertLinkInTransaction/);
  assert.doesNotMatch(src, /status:\s*["']LINKED["']/);
  assert.doesNotMatch(src, /SEO_PLANNING_DECISION_LINKS_DDL/);
});

test("22. no old Planning payload overwritten on existing draft open", async () => {
  const slug = slugify("Firestick IPTV Setup Checklist for UK Viewers");
  const fingerprint = buildSeoPlanningFingerprint({
    recommendation: "NEW_BLOG",
    proposedSlug: slug,
  });
  const mem = memoryCatalog({
    drafts: [
      {
        id: "seoplan_keep",
        recommendation: "NEW_BLOG",
        workflowStatus: "PLANNING",
        fingerprint,
        topic: "Firestick IPTV setup checklist for UK viewers",
        workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
        proposedSlug: slug,
        targetPostId: null,
        matchedPublicUrl: "",
        restorePath: "",
        searchIntent: "COMPARISON",
        linkedPostId: null,
        createdBy: "admin_shared",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        archivedAt: null,
        payload: { opportunity: { whyNow: "ORIGINAL_PAYLOAD_MARKER" } },
      },
    ],
  });
  await integrate({ catalog: mem.catalog });
  assert.match(JSON.stringify(mem.drafts[0]?.payload), /ORIGINAL_PAYLOAD_MARKER/);
  assert.equal(mem.drafts[0]?.searchIntent, "COMPARISON");
});

test("23. no Ledger mutation (selected/selectionSource untouched)", async () => {
  const ledgerReader = reader();
  const before = JSON.stringify(DECISIONS);
  await integrate({ ledgerReader });
  assert.equal(JSON.stringify(DECISIONS), before);
  assert.equal(DECISIONS[0]?.selected, false);
  assert.equal(DECISIONS[0]?.selectionSource, "none");
  const src = read("lib/cms/seo-planning-lineage/proceed-integration.ts");
  assert.doesNotMatch(src, /selectionSource\s*=/);
  assert.doesNotMatch(src, /selected:\s*true/);
});

test("24. no automatic publication or readiness", async () => {
  const { result, mem } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(mem?.drafts[0]?.workflowStatus, "PLANNING");
  assert.equal(mem?.drafts[0]?.linkedPostId, null);
  const src = read("lib/cms/seo-planning-lineage/proceed-integration.ts");
  assert.doesNotMatch(src, /READY_FOR_DRAFTING|publicationReady:\s*true|workflowStatus:\s*["']READY/);
});

test("25. no OpenAI/Gemini/GSC/provider requests", async () => {
  const mem = memoryCatalog({});
  const { result } = await integrate({ catalog: mem.catalog });
  assert.equal(result.ok, true);
  assert.equal(mem.openAiCalls(), 0);
  assert.equal(mem.gscCalls(), 0);
  const src = read("lib/cms/seo-planning-lineage/proceed-integration.ts");
  assert.doesNotMatch(src, /\bfetch\s*\(/);
  assert.doesNotMatch(src, /requestOpenAi|generateChatgpt|querySearchAnalytics|gemini/i);
});

test("26. legacy manual Proceed remains functional", async () => {
  const mem = memoryCatalog({});
  const manual = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: {
      recommendation: "NEW_BLOG",
      topic: "Manual proceed topic",
      workingTitle: "Manual Proceed Working Title",
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
    adminId: "admin_shared",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_manual",
  });
  assert.equal(manual.ok, true);
  if (!manual.ok) return;
  assert.equal(manual.created, true);
  assert.equal(manual.id, "seoplan_manual");

  // Live action path must not be replaced by L4B-3 orchestration.
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /proceedFromTrustedResearchSelection/);
  assert.match(actions, /proceedSeoOpportunityToPlanningDraftAction/);
});

test("bounded Ledger reads (no N+1 fan-out)", async () => {
  const ledgerReader = reader();
  await integrate({ ledgerReader });
  // prepare (1) + resolve decision (1) — bounded, not per-opportunity fan-out
  assert.ok(ledgerReader.calls.n <= 2);
  assert.ok(ledgerReader.calls.n >= 1);
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

test("unauthorized actor rejected with zero protected draft writes", async () => {
  const mem = memoryCatalog({});
  const { result } = await integrate({
    authorized: false,
    catalog: mem.catalog,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errorCode, "UNAUTHORIZED");
  assert.equal(mem.drafts.length, 0);
  assert.equal(mem.saveCalls(), 0);
});

test("lineage establish path stays disconnected from L4B-3 success", async () => {
  const { result } = await integrate();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const establish = await attemptEstablishPlanningDecisionLink({
    planningDraftId: result.planning.draftId,
    decisionId: result.selection.summary.decisionId,
    actorAdminId: "admin_shared",
    store: {
      async isLineageSchemaAvailable() {
        return false;
      },
      async getPlanningDraftById() {
        throw new Error("must not read for inactive schema path incorrectly");
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
  assert.equal(establish.ok, false);
});
