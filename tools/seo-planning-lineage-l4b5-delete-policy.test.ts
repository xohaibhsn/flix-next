/**
 * L4B-5 — Pure Planning lineage permanent-delete policy tests.
 * No MySQL. No live action wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoOpportunityDecisionRow, SeoResearchRunRow } from "../lib/cms/seo-experiment-ledger/types";
import {
  PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY,
  SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
  assessL4bLineageMigrationReadiness,
  evaluatePlanningLifecycleWithLineage,
  evaluatePlanningPermanentDeletePolicy,
  evaluatePlanningPermanentDeletePolicyAsync,
  inspectL4bLineageDdlReadiness,
  type ResolvePlanningDecisionLineageResult,
} from "../lib/cms/seo-planning-lineage";
import {
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  SEO_PLANNING_DECISION_LINKS_DDL,
} from "../lib/cms/seo-planning-lineage/schema-ddl";
import {
  SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE,
  SEO_PLANNING_NOT_ARCHIVED_MESSAGE,
  seoPlanningPermanentDeleteConfirmToken,
} from "../lib/cms/seo-planning/lifecycle";
import type { SeoPlanningDraft } from "../lib/cms/types";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_l4b5",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:l4b5",
    topic: "Delete policy topic",
    workingTitle: "Delete Policy Working Title",
    proposedSlug: "delete-policy-working-title",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "SETUP",
    linkedPostId: null,
    createdBy: "admin_shared",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    archivedAt: null,
    payload: {},
    ...overrides,
  };
}

function linkedLineage(): ResolvePlanningDecisionLineageResult {
  const decision = {
    id: "seodec_l4b5",
    runId: "seorun_l4b5",
    opportunityIndex: 0,
    opportunityIdentity: "oid_l4b5",
    createdAt: "2026-10-06T00:00:00.000Z",
    topic: "Delete policy topic",
    workingTitle: "Delete Policy Working Title",
    researchRecommendation: "NEW_BLOG",
    researchConfidence: "HIGH",
    existingCoverage: "NONE",
    matchedPublicUrl: "",
    restorePath: "",
    targetPostId: null,
    evaluationStatus: "OK",
    rfVerdict: "PASS_NEW_CONTENT",
    rfFingerprint: "rf",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri",
    pipelineFingerprint: "pipe",
    selected: false,
    selectionSource: "none",
  } satisfies SeoOpportunityDecisionRow;
  const researchRun = {
    id: "seorun_l4b5",
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: "admin_shared",
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: "v1",
    pipelineErrorCode: null,
    opportunityCount: 1,
    gscStatus: "OK",
    durabilityStatus: "COMPLETE",
  } satisfies SeoResearchRunRow;
  return {
    ok: true,
    state: "LINKED",
    link: {
      id: "seoplink_l4b5",
      planningDraftId: "seoplan_l4b5",
      decisionId: "seodec_l4b5",
      linkedByAdminId: "admin_shared",
      linkedAt: "2026-10-06T00:00:02.000Z",
      selectionMarker: "server_research_binding",
    },
    decision,
    researchRun,
    pipelineSnapshotIncomplete: false,
  };
}

test("1. unlinked active draft cannot be permanently deleted", () => {
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: draft(),
    confirmation: "Delete Policy Working Title",
    lineageProtectionActive: true,
    lineage: { ok: true, state: "UNLINKED", planningDraftId: "seoplan_l4b5" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.decision, "DENY_NOT_ARCHIVED");
    assert.equal(result.errorMessage, SEO_PLANNING_NOT_ARCHIVED_MESSAGE);
  }
});

test("2. unlinked archived draft may be deleted after valid confirmation", () => {
  const archived = draft({ archivedAt: "2026-10-07T00:00:00.000Z" });
  const token = seoPlanningPermanentDeleteConfirmToken(archived);
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: archived,
    confirmation: token,
    lineageProtectionActive: true,
    lineage: { ok: true, state: "UNLINKED", planningDraftId: "seoplan_l4b5" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.decision, "ALLOW_UNLINKED_ARCHIVED");
    assert.equal(result.mayPermanentlyDelete, true);
    assert.equal(result.automaticUnlink, false);
  }
});

test("3. linked active draft cannot be permanently deleted", () => {
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: draft(),
    confirmation: "Delete Policy Working Title",
    lineageProtectionActive: true,
    lineage: linkedLineage(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.decision, "DENY_LINKED");
    assert.equal(result.errorMessage, SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE);
  }
});

test("4. linked archived draft cannot be permanently deleted", () => {
  const archived = draft({ archivedAt: "2026-10-07T00:00:00.000Z" });
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: archived,
    confirmation: seoPlanningPermanentDeleteConfirmToken(archived),
    lineageProtectionActive: true,
    lineage: linkedLineage(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.decision, "DENY_LINKED");
    assert.equal(result.errorMessage, SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE);
  }
});

test("5. linked draft may be archived/restored/read", () => {
  for (const action of ["ARCHIVE", "RESTORE", "READ"] as const) {
    const allow = evaluatePlanningLifecycleWithLineage({
      action,
      draft: draft(action === "RESTORE" ? { archivedAt: "2026-10-07T00:00:00.000Z" } : {}),
      lineageProtectionActive: true,
      lineage: linkedLineage(),
    });
    assert.equal(allow.ok, true);
    if (allow.ok) assert.equal(allow.linked, true);
  }
});

test("6. failed lineage lookup never becomes UNLINKED", () => {
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: draft({ archivedAt: "2026-10-07T00:00:00.000Z" }),
    confirmation: "Delete Policy Working Title",
    lineageProtectionActive: true,
    lineage: {
      ok: false,
      state: "UNAVAILABLE",
      errorCode: "SCHEMA_UNAVAILABLE",
      errorMessage: "Planning decision lineage schema is unavailable.",
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision, "DENY_LINEAGE_UNAVAILABLE");
});

test("7. malformed/conflicting lineage fails closed", () => {
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: draft({ archivedAt: "2026-10-07T00:00:00.000Z" }),
    confirmation: "Delete Policy Working Title",
    lineageProtectionActive: true,
    lineage: {
      ok: false,
      state: "CONFLICT",
      errorCode: "LINK_CONFLICT",
      errorMessage: "Planning decision lineage is inconsistent.",
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision, "DENY_LINEAGE_CONFLICT");
});

test("8. client-supplied linked state cannot override authoritative UNLINKED", () => {
  const archived = draft({ archivedAt: "2026-10-07T00:00:00.000Z" });
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: archived,
    confirmation: seoPlanningPermanentDeleteConfirmToken(archived),
    lineageProtectionActive: true,
    lineage: { ok: true, state: "UNLINKED", planningDraftId: "seoplan_l4b5" },
    clientClaimedLinked: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.decision, "ALLOW_UNLINKED_ARCHIVED");
});

test("9. sanitized linked-delete message is centralized", () => {
  assert.match(SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE, /archive it instead/i);
  const src = read("lib/cms/seo-planning-lineage/delete-policy.ts");
  assert.match(src, /SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE/);
  assert.equal(
    (src.match(/This Planning draft is linked to a Research decision/g) || []).length,
    1,
  );
});

test("10. confirmation requirements remain intact", () => {
  const archived = draft({ archivedAt: "2026-10-07T00:00:00.000Z" });
  const bad = evaluatePlanningPermanentDeletePolicy({
    draft: archived,
    confirmation: "wrong-token",
    lineageProtectionActive: true,
    lineage: { ok: true, state: "UNLINKED", planningDraftId: "seoplan_l4b5" },
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.decision, "DENY_CONFIRMATION_MISMATCH");
    assert.equal(bad.errorMessage, SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE);
  }
});

test("INCOMPLETE authoritative link also blocks permanent delete", () => {
  const archived = draft({ archivedAt: "2026-10-07T00:00:00.000Z" });
  const linked = linkedLineage();
  assert.equal(linked.ok, true);
  if (!linked.ok || linked.state !== "LINKED") return;
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: archived,
    confirmation: seoPlanningPermanentDeleteConfirmToken(archived),
    lineageProtectionActive: true,
    lineage: {
      ok: true,
      state: "INCOMPLETE",
      planningDraftId: "seoplan_l4b5",
      link: linked.link,
      reason: "incomplete",
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision, "DENY_LINKED");
});

test("missing lineage when protection active fails closed", async () => {
  const result = await evaluatePlanningPermanentDeletePolicyAsync({
    draft: draft({ archivedAt: "2026-10-07T00:00:00.000Z" }),
    confirmation: "Delete Policy Working Title",
    lineageProtectionActive: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.decision, "DENY_LINEAGE_UNAVAILABLE");
});

test("legacy protection inactive ignores lineage and preserves archive/confirm", () => {
  const archived = draft({ archivedAt: "2026-10-07T00:00:00.000Z" });
  const result = evaluatePlanningPermanentDeletePolicy({
    draft: archived,
    confirmation: seoPlanningPermanentDeleteConfirmToken(archived),
    lineageProtectionActive: false,
    lineage: linkedLineage(), // must be ignored
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.decision, "ALLOW_LEGACY_LIFECYCLE_ONLY");
});

test("final integrity contract forbids check-then-delete bypass / cascade / unlink", () => {
  assert.equal(PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY.automaticUnlink, false);
  assert.equal(PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY.cascade, false);
  assert.equal(PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY.checkThenDeleteSafe, false);
  assert.equal(PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY.requiresLockedTransactionOrFkGuard, true);
});

test("migration readiness: no numeric slot, no ensure registration, DDL inspect OK", () => {
  const readiness = assessL4bLineageMigrationReadiness({
    currentCmsSchemaVersion: CURRENT_CMS_SCHEMA_VERSION,
    concurrencyUnreleasedSchemaVersion: 6,
    ddlRegisteredWithEnsure: L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
    lineageTablePresent: false,
    liveDeleteQueriesLineage: false,
  });
  assert.equal(readiness.dependency, "PROVISIONAL_V7_POST_CONCURRENCY_V6");
  assert.equal(readiness.numericVersionAuthorized, false);
  assert.equal(readiness.readyToRegisterWithEnsure, false);
  assert.equal(readiness.deletePolicyDefined, true);
  assert.equal(readiness.liveDeleteWired, false);
  assert.ok(readiness.blockers.length >= 2);

  const ddl = inspectL4bLineageDdlReadiness(SEO_PLANNING_DECISION_LINKS_DDL);
  assert.equal(ddl.ok, true);
});

test("live permanent-delete action remains unwired to lineage policy", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /evaluatePlanningPermanentDeletePolicy/);
  assert.doesNotMatch(actions, /resolvePlanningDecisionLineage/);
  assert.doesNotMatch(actions, /seo_planning_decision_links/);
  assert.match(actions, /deleteSeoPlanningDraftPermanentlyAction/);
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

test("no CASCADE / unlink / Ledger mutation in delete-policy module", () => {
  const src = read("lib/cms/seo-planning-lineage/delete-policy.ts");
  assert.doesNotMatch(src, /ON DELETE CASCADE|unlinkThenDelete|DELETE FROM seo_opportunity/);
  assert.doesNotMatch(src, /selectionSource\s*=/);
});
