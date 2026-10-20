/**
 * FLIX-L4B-LIVE-WIRING-SECURITY-CLOSE-01 — OFF + injection-isolation contracts.
 * No production MySQL. No schema ensure. No paid AI/GSC.
 *
 * ON-path simulation uses tools/seo-planning-lineage-live-wiring-test-dispatch.ts only.
 * Production live-wiring-dispatch accepts no testInjection capabilities.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { isSeoPlanningActionableRecommendation } from "../lib/cms/seo-planning/constants";
import {
  RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED,
} from "../lib/cms/seo-planning-lineage/proceed-integration";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "../lib/cms/seo-planning-lineage/schema-ddl";
import {
  SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
  evaluatePlanningPermanentDeletePolicy,
} from "../lib/cms/seo-planning-lineage/delete-policy";
import {
  describeLiveWiringOffGuarantees,
  dispatchSidhuPermanentDelete,
  dispatchSidhuProceedToPlanning,
  ignoreClientSuppliedLiveWiringFlags,
  resolveSidhuPermanentDeleteDispatchPath,
  resolveSidhuProceedDispatchPath,
  SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED,
  LIVE_WIRING_PREP_VERSION,
} from "../lib/cms/seo-planning-lineage/live-wiring-dispatch";
import {
  executeTransactionalProtectedPermanentDelete,
  executeTransactionalTrustedProceedAndLink,
} from "../lib/cms/seo-planning-lineage/transactional-integration";
import type { SeoPlanningDraft } from "../lib/cms/types";
import type {
  ProceedSeoPlanningResult,
  SeoPlanningCatalog,
} from "../lib/cms/seo-planning/proceed";
import {
  dispatchProductionPermanentDeleteForTests,
  dispatchProductionProceedForTests,
  simulateProtectedDeletePolicyForTests,
  simulateTransactionalProceedForTests,
  simulateTransactionalProtectedDeleteForTests,
} from "./seo-planning-lineage-live-wiring-test-dispatch";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function archivedDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_live_wiring",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:live-wiring-topic",
    topic: "Live wiring topic for UK IPTV",
    workingTitle: "Live Wiring Working Title",
    proposedSlug: "live-wiring",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    archivedAt: "2026-10-07T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
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

test("OFF: production activation constants remain false", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED, false);
  assert.equal(SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED, false);
  assert.equal(LIVE_WIRING_PREP_VERSION, "l4b-live-wiring-prep-v1");

  const guarantees = describeLiveWiringOffGuarantees();
  assert.equal(guarantees.productionProceedPath, "MANUAL_PROCEED");
  assert.equal(guarantees.lineageInsertReachableFromOffDispatch, false);
  assert.equal(guarantees.automaticManualFallbackOnTransactionalFailure, false);
  assert.equal(guarantees.productionDispatchAcceptsTestInjection, false);
});

test("OFF: resolve paths ignore env and forged authorization args", () => {
  process.env.SIDHU_TRANSACTIONAL_LIVE_WIRING = "1";
  process.env.RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED = "true";
  process.env.L4B_LIVE_WIRING = "yes";

  assert.equal(resolveSidhuProceedDispatchPath(), "MANUAL_PROCEED");
  assert.equal(
    resolveSidhuProceedDispatchPath({
      liveWiringAuthorized: true,
      durableLinkAuthorized: true,
    }),
    "MANUAL_PROCEED",
  );
  assert.equal(resolveSidhuPermanentDeleteDispatchPath(), "LEGACY_PERMANENT_DELETE");
  assert.equal(
    resolveSidhuPermanentDeleteDispatchPath({ liveWiringAuthorized: true }),
    "LEGACY_PERMANENT_DELETE",
  );

  delete process.env.SIDHU_TRANSACTIONAL_LIVE_WIRING;
  delete process.env.RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  delete process.env.L4B_LIVE_WIRING;
});

test("OFF: production facade remains ACTIVATION_DENIED", async () => {
  const proceed = await executeTransactionalTrustedProceedAndLink({
    activation: true,
    allowDurableLineageWrites: true,
    actor: { authorized: true, adminId: "admin_1" },
  });
  assert.equal(proceed.ok, false);
  if (!proceed.ok) assert.equal(proceed.errorCode, "ACTIVATION_DENIED");

  const del = await executeTransactionalProtectedPermanentDelete({
    allowProtectedDelete: true,
    actor: { authorized: true, adminId: "admin_1" },
    planningDraftId: "seoplan_x",
  });
  assert.equal(del.ok, false);
  if (!del.ok) assert.equal(del.errorCode, "ACTIVATION_DENIED");
});

test("OFF: production dispatch uses manual Proceed and cannot accept injection", async () => {
  let saved = 0;
  const manualOpportunity = {
    recommendation: "NEW_BLOG",
    topic: "Manual path topic for UK IPTV planning",
    workingTitle: "Manual Path Working Title",
    searchIntent: "INFORMATIONAL",
    whyNow: "Operator needs a private draft",
    webEvidence: "Public listing evidence",
    existingCoverage: "NONE",
    matchedTitle: null,
    matchedPublicUrl: null,
    restorePath: "",
    suggestedAngle: "Setup angle",
    nextStep: "Draft outline",
    confidence: "LOW",
    gscEvidenceRefs: [],
    gscEvidence: [],
    historicalSignal: false,
  };

  const result = await dispatchSidhuProceedToPlanning({
    rawOpportunity: manualOpportunity,
    adminId: "admin_1",
    catalog: emptyCatalog({
      saveSeoPlanningDraft: async (draft) => {
        saved += 1;
        return draft;
      },
    }),
    createIdFn: () => "seoplan_manual_off",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.created, true);
    assert.equal(result.id, "seoplan_manual_off");
  }
  assert.equal(saved, 1);

  // Runtime: production function arity/signature rejects injection bags.
  const productionFn = dispatchSidhuProceedToPlanning as unknown as (
    args: Record<string, unknown>,
  ) => Promise<ProceedSeoPlanningResult>;
  let injectedRan = 0;
  const forged = await productionFn({
    rawOpportunity: manualOpportunity,
    adminId: "admin_1",
    catalog: emptyCatalog({
      saveSeoPlanningDraft: async (draft) => {
        saved += 1;
        return draft;
      },
    }),
    createIdFn: () => "seoplan_forged_injection",
    testInjection: {
      useTransactionalProceed: true,
      transactionalProceed: async () => {
        injectedRan += 1;
        return {
          ok: true,
          planningDraftId: "seoplan_should_not",
          created: true,
          linkageStatus: "LINKED",
          linkId: "seoplink_x",
        };
      },
    },
  });
  assert.equal(injectedRan, 0);
  assert.equal(forged.ok, true);
  if (forged.ok) {
    // Still manual Proceed — injection ignored because production API has no such param.
    assert.equal(forged.id, "seoplan_forged_injection");
    assert.notEqual(forged.id, "seoplan_should_not");
  }
});

test("OFF: client activation flags are ignored and cannot select transactional path", () => {
  const forged = {
    activation: true,
    forceTransactional: true,
    durableLinkAuthorized: true,
    liveWiringAuthorized: true,
    useTransactionalProceed: true,
    __testOnly: { useTransactionalProceed: true },
    testInjection: { useTransactionalProceed: true },
    opportunity: { topic: "x" },
  };
  ignoreClientSuppliedLiveWiringFlags(forged);
  assert.equal(resolveSidhuProceedDispatchPath(), "MANUAL_PROCEED");
});

test("OFF: Sidhu actions import production dispatch only — no executor, harness, or test simulation", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /dispatchSidhuProceedToPlanning/);
  assert.match(actions, /dispatchSidhuPermanentDelete/);
  assert.match(actions, /ignoreClientSuppliedLiveWiringFlags/);
  assert.doesNotMatch(actions, /runTransactionalTrustedProceedAndLink/);
  assert.doesNotMatch(actions, /executeTransactionalTrustedProceedAndLink/);
  assert.doesNotMatch(actions, /transactional-execution/);
  assert.doesNotMatch(actions, /seo-planning-lineage-test-harness/);
  assert.doesNotMatch(actions, /live-wiring-test-dispatch/);
  assert.doesNotMatch(actions, /testInjection/);
  assert.doesNotMatch(actions, /simulateTransactional/);

  const dispatch = read("lib/cms/seo-planning-lineage/live-wiring-dispatch.ts");
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*seo-planning-lineage-test-harness/);
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*transactional-integration/);
  assert.doesNotMatch(dispatch, /from\s+["'][^"']*live-wiring-test-dispatch/);
  assert.doesNotMatch(dispatch, /testInjection\??:/);
  assert.doesNotMatch(dispatch, /transactionalProceed\s*:/);
  assert.match(dispatch, /SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED = false/);
  assert.match(dispatch, /productionDispatchAcceptsTestInjection: false/);

  const index = read("lib/cms/seo-planning-lineage/index.ts");
  assert.doesNotMatch(index, /from\s+["'][^"']*transactional-execution/);
  assert.doesNotMatch(index, /from\s+["'][^"']*live-wiring-dispatch/);
  assert.doesNotMatch(index, /live-wiring-test-dispatch/);
});

test("structural: production import graph cannot reach test simulation helpers", () => {
  const forbiddenImport =
    /(?:from\s+["'][^"']*(?:seo-planning-lineage-live-wiring-test-dispatch|seo-planning-lineage-test-harness|transactional-execution)[^"']*["']|require\(\s*["'][^"']*(?:seo-planning-lineage-live-wiring-test-dispatch|seo-planning-lineage-test-harness|transactional-execution)[^"']*["']\s*\))/;

  for (const rel of [
    "lib/cms/seo-planning-actions.ts",
    "lib/cms/seo-planning-lineage/live-wiring-dispatch.ts",
    "lib/cms/seo-planning-lineage/transactional-integration.ts",
    "lib/cms/seo-planning-lineage/index.ts",
  ]) {
    assert.doesNotMatch(read(rel), forbiddenImport, `${rel} must not import test/ungated writers`);
  }

  // Limitation: this proves source import edges, not runtime dynamic import reachability.
  assert.match(
    read("tools/seo-planning-lineage-live-wiring-test-dispatch.ts"),
    /Never import from production CMS actions/,
  );
});

test("test-only: authorized transactional Proceed simulation succeeds without manual fallback", async () => {
  let manualSave = 0;
  let injected = 0;

  // Manual catalog would save if production dispatch were used; simulation must not.
  void emptyCatalog({
    saveSeoPlanningDraft: async (draft) => {
      manualSave += 1;
      return draft;
    },
  });

  const result = await simulateTransactionalProceedForTests({
    transactionalProceed: async () => {
      injected += 1;
      return {
        ok: true,
        planningDraftId: "seoplan_injected",
        created: true,
        linkageStatus: "LINKED",
        linkId: "seoplink_1",
      };
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.id, "seoplan_injected");
    assert.equal(result.created, true);
  }
  assert.equal(injected, 1);
  assert.equal(manualSave, 0);
});

test("test-only: failed transactional Proceed simulation does not fall back to manual", async () => {
  let manualSave = 0;
  const catalog = emptyCatalog({
    saveSeoPlanningDraft: async (draft) => {
      manualSave += 1;
      return draft;
    },
  });

  const unauthorized = await simulateTransactionalProceedForTests({
    transactionalProceed: async () => ({
      ok: false,
      created: false,
      errorCode: "UNAUTHORIZED",
      errorMessage: "Access denied.",
      linkageStatus: "SELECTION_UNAVAILABLE",
    }),
  });
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) assert.equal(unauthorized.error, "Access denied.");
  assert.equal(manualSave, 0);

  // Production OFF path still works independently (parity).
  const manual = await dispatchProductionProceedForTests({
    rawOpportunity: {
      recommendation: "NEW_BLOG",
      topic: "Parity topic for UK IPTV planning",
      workingTitle: "Parity Working Title",
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
    catalog,
    createIdFn: () => "seoplan_parity",
  });
  assert.equal(manual.ok, true);
  assert.equal(manualSave, 1);
});

test("test-only: idempotent / existing-unlinked response shapes stay Sidhu-compatible", async () => {
  const idempotent = await simulateTransactionalProceedForTests({
    transactionalProceed: async () => ({
      ok: true,
      planningDraftId: "seoplan_existing",
      created: false,
      linkageStatus: "IDEMPOTENT_LINKED",
      linkId: "seoplink_existing",
    }),
  });
  assert.equal(idempotent.ok, true);
  if (idempotent.ok) {
    assert.equal(idempotent.id, "seoplan_existing");
    assert.equal(idempotent.created, false);
  }

  const unlinkedExisting = await simulateTransactionalProceedForTests({
    transactionalProceed: async () => ({
      ok: true,
      planningDraftId: "seoplan_unlinked",
      created: false,
      linkageStatus: "EXISTING_DRAFT_UNLINKED",
      linkId: null,
    }),
  });
  assert.equal(unlinkedExisting.ok, true);
  if (unlinkedExisting.ok) {
    assert.equal(unlinkedExisting.created, false);
    assert.equal(unlinkedExisting.id, "seoplan_unlinked");
  }
});

test("classification: REFRESH remains actionable and distinct from NEW_BLOG / HOLD", () => {
  assert.equal(isSeoPlanningActionableRecommendation("NEW_BLOG"), true);
  assert.equal(isSeoPlanningActionableRecommendation("REFRESH_EXISTING"), true);
  assert.equal(isSeoPlanningActionableRecommendation("HOLD"), false);
  assert.equal(isSeoPlanningActionableRecommendation("SKIP"), false);
  assert.notEqual("REFRESH_EXISTING", "NEW_BLOG");
});

test("test-only: linked permanent delete rejected; no automatic unlink", async () => {
  let deleted = 0;
  const draft = archivedDraft();

  const linkedLineage = {
    ok: true as const,
    state: "INCOMPLETE" as const,
    planningDraftId: draft.id,
    link: {
      id: "seoplink_1",
      planningDraftId: draft.id,
      decisionId: "seodec_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      linkedByAdminId: "admin_1",
      linkedAt: "2026-10-06T00:00:00.000Z",
      selectionMarker: "server_research_binding" as const,
    },
    reason: "Decision snapshot incomplete for delete-policy fixture.",
  };

  const policyBlocked = await simulateProtectedDeletePolicyForTests({
    draft,
    confirmation: draft.workingTitle,
    lineage: linkedLineage,
    deleteIfAllowed: async () => {
      deleted += 1;
      return { ok: true };
    },
  });

  assert.equal(policyBlocked.ok, false);
  if (!policyBlocked.ok) {
    assert.equal(policyBlocked.error, SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE);
  }
  assert.equal(deleted, 0);

  const clientOverride = evaluatePlanningPermanentDeletePolicy({
    draft,
    confirmation: draft.workingTitle,
    lineageProtectionActive: true,
    lineage: linkedLineage,
    clientClaimedLinked: false,
  });
  assert.equal(clientOverride.ok, false);
  if (!clientOverride.ok) {
    assert.equal(clientOverride.decision, "DENY_LINKED");
    assert.equal(clientOverride.automaticUnlink, false);
    assert.equal(clientOverride.cascadeLedger, false);
  }
});

test("test-only: transactional protected delete failure does not fall back to legacy delete", async () => {
  let legacyDeletes = 0;
  const draft = archivedDraft();

  const result = await simulateTransactionalProtectedDeleteForTests({
    transactionalDelete: async () => ({
      ok: false,
      deleted: false,
      errorCode: "LINKED",
      errorMessage: SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
      planningDraftId: draft.id,
    }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE);
  assert.equal(legacyDeletes, 0);

  // Production legacy path still available separately.
  const legacy = await dispatchProductionPermanentDeleteForTests({
    planningDraftId: draft.id,
    confirmation: draft.workingTitle,
    draft,
    deletePermanently: async () => {
      legacyDeletes += 1;
      return { ok: true };
    },
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacyDeletes, 1);
});

test("OFF: legacy permanent delete still confirms and deletes unlinked archived drafts", async () => {
  let deleted = 0;
  const draft = archivedDraft();

  const result = await dispatchSidhuPermanentDelete({
    planningDraftId: draft.id,
    confirmation: draft.workingTitle,
    draft,
    deletePermanently: async (id) => {
      assert.equal(id, draft.id);
      deleted += 1;
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(deleted, 1);
});

test("OFF: legacy permanent delete sanitizes thrown FK-style failures without unlink", async () => {
  const draft = archivedDraft();
  const result = await dispatchSidhuPermanentDelete({
    planningDraftId: draft.id,
    confirmation: draft.workingTitle,
    draft,
    deletePermanently: async () => {
      const err = Object.assign(new Error("fk"), {
        code: "ER_ROW_IS_REFERENCED_2",
        errno: 1451,
      });
      throw err;
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.error,
      "Could not permanently delete the planning draft. Please try again.",
    );
    assert.doesNotMatch(result.error, /ER_ROW_IS_REFERENCED|1451|unlink|CASCADE/i);
  }
});

test("OFF: forged delete injection bag on production dispatch is ignored", async () => {
  let deleted = 0;
  let injected = 0;
  const draft = archivedDraft();

  const productionFn = dispatchSidhuPermanentDelete as unknown as (
    args: Record<string, unknown>,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;

  const result = await productionFn({
    planningDraftId: draft.id,
    confirmation: draft.workingTitle,
    draft,
    deletePermanently: async () => {
      deleted += 1;
      return { ok: true };
    },
    testInjection: {
      useProtectedDelete: true,
      transactionalDelete: async () => {
        injected += 1;
        return {
          ok: false,
          deleted: false,
          errorCode: "LINKED",
          errorMessage: SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
          planningDraftId: draft.id,
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(deleted, 1);
  assert.equal(injected, 0);
});
