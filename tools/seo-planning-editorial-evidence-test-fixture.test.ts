/**
 * Editorial Evidence TEST FIXTURE — offline security + lifecycle + evidence CAS.
 * No production MySQL. No Research/Proceed/GSC/AI. Compile-time OFF enforced.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import {
  fingerprintEditorialEvidenceFromPayload,
  mergeEditorialEvidenceIntoPayload,
  parseSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "../lib/cms/seo-planning/editorial-evidence";
import { evaluateSeoPlanningHandoffEligibility } from "../lib/cms/seo-planning/handoff";
import { seoPlanningPermanentDeleteConfirmToken } from "../lib/cms/seo-planning/lifecycle";
import { sanitizeSeoPlanningDraft } from "../lib/cms/seo-planning/sanitize";
import {
  SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED,
  SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM,
  SEO_PLANNING_TEST_FIXTURE_DISABLED_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_EXISTS_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_FINGERPRINT,
  SEO_PLANNING_TEST_FIXTURE_KIND,
  SEO_PLANNING_TEST_FIXTURE_LINEAGE_UNKNOWN_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_OFF_BEFORE_CLEANUP_ORDER,
  SEO_PLANNING_TEST_FIXTURE_ONESHOT_CONSUMED_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY,
  SEO_PLANNING_TEST_FIXTURE_PURPOSE,
  SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION,
  SEO_PLANNING_TEST_FIXTURE_TOPIC,
  SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
  buildSeoPlanningEditorialEvidenceTestFixtureDraft,
  confirmSeoPlanningTestFixtureCreate,
  createSeoPlanningEditorialEvidenceTestFixture,
  evaluateSeoPlanningTestFixturePermanentDelete,
  evaluateTestFixtureCreationGate,
  ignoreClientSuppliedTestFixtureFlags,
  isReservedOrFixtureMarkedSeoPlanningDraft,
  isSeoPlanningEditorialEvidenceTestFixture,
  isSeoPlanningEditorialEvidenceTestFixtureCreationEnabled,
  preserveLockedTestFixtureIdentity,
  readSeoPlanningTestFixtureMarker,
  shouldRenderSeoPlanningTestFixtureCreateControl,
} from "../lib/cms/seo-planning/test-fixture";
import { applySeoPlanningWorkspaceUpdate } from "../lib/cms/seo-planning/workspace";
import type { SeoPlanningDraft } from "../lib/cms/types";

async function withTempCatalog<T>(fn: (catalog: JsonCatalogRepository) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "flix-fixture-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn(new JsonCatalogRepository());
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

function genuineRefreshDraft(): SeoPlanningDraft {
  return sanitizeSeoPlanningDraft({
    id: "seoplan_983c98c4-fc15-414d-93cf-0ab4c2f08e32",
    recommendation: "REFRESH_EXISTING",
    workflowStatus: "PLANNING",
    fingerprint: "REFRESH_EXISTING:post_buffering",
    topic: "Diagnosing IPTV buffering",
    workingTitle: "IPTV Buffering Guide",
    proposedSlug: "",
    targetPostId: "post_buffering",
    matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-07T08:00:00.000Z",
    updatedAt: "2026-10-07T08:00:00.000Z",
    archivedAt: null,
    payload: {
      opportunity: {
        topic: "Diagnosing IPTV buffering",
        workingTitle: "IPTV Buffering Guide",
        confidence: "HIGH",
        whyNow: "Real opportunity",
        webEvidence: "Real evidence",
      },
    },
  });
}

test("compile-time fixture gate is OFF and client flags cannot enable", () => {
  assert.equal(SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED, false);
  assert.equal(isSeoPlanningEditorialEvidenceTestFixtureCreationEnabled(), false);
  const denied = evaluateTestFixtureCreationGate();
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.error, /disabled/i);

  ignoreClientSuppliedTestFixtureFlags({
    enabled: true,
    testOnlyForceEnabled: true,
    forceEnable: true,
    testFixtureV1: { kind: "TEST_FIXTURE" },
  });
  assert.equal(evaluateTestFixtureCreationGate().ok, false);
  assert.equal(evaluateTestFixtureCreationGate({ testOnlyForceEnabled: true }).ok, true);
});

test("create-control render predicate — OFF hides for every role; ON needs super_admin", () => {
  assert.equal(
    shouldRenderSeoPlanningTestFixtureCreateControl({
      creationEnabled: false,
      role: "super_admin",
    }),
    false,
  );
  assert.equal(
    shouldRenderSeoPlanningTestFixtureCreateControl({
      creationEnabled: false,
      role: "admin",
    }),
    false,
  );
  assert.equal(
    shouldRenderSeoPlanningTestFixtureCreateControl({
      creationEnabled: true,
      role: "admin",
    }),
    false,
  );
  assert.equal(
    shouldRenderSeoPlanningTestFixtureCreateControl({
      creationEnabled: true,
      role: null,
    }),
    false,
  );
  assert.equal(
    shouldRenderSeoPlanningTestFixtureCreateControl({
      creationEnabled: true,
      role: "super_admin",
    }),
    true,
  );
  // Page wires the real compile-time constant — stays hidden while OFF.
  assert.equal(
    shouldRenderSeoPlanningTestFixtureCreateControl({
      creationEnabled: SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED,
      role: "super_admin",
    }),
    false,
  );
});

test("SEO naming: reserved purpose/fingerprint/title; no person-specific fixture strings", () => {
  assert.equal(SEO_PLANNING_TEST_FIXTURE_PURPOSE, "seo_editorial_evidence_acceptance");
  assert.equal(
    SEO_PLANNING_TEST_FIXTURE_FINGERPRINT,
    "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1",
  );
  assert.equal(
    SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
    "TEST — SEO Editorial Evidence Acceptance — DO NOT PUBLISH",
  );
  assert.equal(SEO_PLANNING_TEST_FIXTURE_KIND, "TEST_FIXTURE");

  const root = process.cwd();
  // Active feature/fixture sources (this test file intentionally names the legacy
  // purpose only inside dynamic checks below — keep it out of the scan list).
  const activePaths = [
    "lib/cms/seo-planning/test-fixture.ts",
    "components/sidhu/SeoPlanningEditorialEvidence.tsx",
    "components/sidhu/SeoPlanningDetail.tsx",
    "tools/seo-planning-editorial-evidence-ui.test.ts",
  ];
  const legacyPurpose = ["junaid", "_editorial_evidence_acceptance"].join("");
  const personRe = new RegExp(["ju", "naid"].join(""), "i");
  for (const rel of activePaths) {
    const text = readFileSync(path.join(root, rel), "utf8");
    assert.equal(personRe.test(text), false, `person-specific naming must be absent from ${rel}`);
    assert.equal(
      text.includes(legacyPurpose),
      false,
      `legacy purpose string must be absent from ${rel}`,
    );
  }

  const ui = readFileSync(
    path.join(root, "components/sidhu/SeoPlanningEditorialEvidence.tsx"),
    "utf8",
  );
  assert.match(ui, /Private editorial notes for SEO Team/);
  assert.match(ui, /EDITORIAL_UNVERIFIED/);
});

test("production create path denies when gate OFF even with force claim in raw input", async () => {
  await withTempCatalog(async (catalog) => {
    const result = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "disabled");
      assert.equal(result.error, SEO_PLANNING_TEST_FIXTURE_DISABLED_MESSAGE);
    }
    assert.equal(await catalog.getSeoPlanningDraftByFingerprint(SEO_PLANNING_TEST_FIXTURE_FINGERPRINT), null);
  });
});

test("forced create builds honest TEST fixture — no Research/GSC/Blog linkage", async () => {
  await withTempCatalog(async (catalog) => {
    const genuine = genuineRefreshDraft();
    await catalog.saveSeoPlanningDraft(genuine);

    const created = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      now: "2026-10-22T01:00:00.000Z",
      createIdFn: () => "seoplan_test_fixture_1",
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("expected create");

    const draft = created.draft;
    assert.equal(draft.id, "seoplan_test_fixture_1");
    assert.equal(draft.fingerprint, SEO_PLANNING_TEST_FIXTURE_FINGERPRINT);
    assert.equal(draft.recommendation, SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION);
    assert.equal(draft.workflowStatus, "PLANNING");
    assert.equal(draft.workingTitle, SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE);
    assert.equal(draft.topic, SEO_PLANNING_TEST_FIXTURE_TOPIC);
    assert.equal(draft.linkedPostId, null);
    assert.equal(draft.targetPostId, null);
    assert.equal(draft.matchedPublicUrl, "");
    assert.equal(draft.restorePath, "");
    assert.equal(draft.proposedSlug, "");
    assert.ok(isSeoPlanningEditorialEvidenceTestFixture(draft));

    const marker = readSeoPlanningTestFixtureMarker(draft.payload);
    assert.ok(marker);
    assert.equal(marker!.kind, SEO_PLANNING_TEST_FIXTURE_KIND);
    assert.equal(marker!.purpose, SEO_PLANNING_TEST_FIXTURE_PURPOSE);

    const payload = draft.payload as Record<string, unknown>;
    assert.equal(payload.opportunity, undefined);
    assert.equal(payload.sources, undefined);
    assert.equal(payload.gsc, undefined);
    assert.equal(payload.editorialEvidenceV1, undefined);

    const still = await catalog.getSeoPlanningDraftById(genuine.id);
    assert.ok(still);
    assert.equal(still!.fingerprint, genuine.fingerprint);
    assert.ok((still!.payload as Record<string, unknown>).opportunity);

    const dup = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_test_fixture_2",
    });
    assert.equal(dup.ok, false);
    if (!dup.ok) {
      // Durable oneshot is consumed on first success — blocks recreate even before fingerprint check.
      assert.equal(dup.code, "oneshot_consumed");
      assert.equal(dup.error, SEO_PLANNING_TEST_FIXTURE_ONESHOT_CONSUMED_MESSAGE);
    }
    assert.equal(await catalog.isSeoPlanningEditorialEvidenceTestFixtureOneshotConsumed(), true);
  });
});

test("UNIQUE fingerprint still blocks create when oneshot unused but reserved row exists", async () => {
  await withTempCatalog(async (catalog) => {
    const planted = buildSeoPlanningEditorialEvidenceTestFixtureDraft({
      adminId: "admin_seo",
      createIdFn: () => "seoplan_planted_fp",
    });
    await catalog.saveSeoPlanningDraft(planted);
    assert.equal(await catalog.isSeoPlanningEditorialEvidenceTestFixtureOneshotConsumed(), false);

    const blocked = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_planted_fp_2",
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, "exists");
      assert.equal(blocked.error, SEO_PLANNING_TEST_FIXTURE_EXISTS_MESSAGE);
    }
  });
});

test("fixture identity survives workspace save and spoofed payload rewrite", async () => {
  await withTempCatalog(async (catalog) => {
    const created = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_fix_id",
    });
    assert.ok(created.ok);
    if (!created.ok) throw new Error("create");

    const applied = applySeoPlanningWorkspaceUpdate(created.draft, {
      id: created.draft.id,
      topic: "Hijacked topic",
      workingTitle: "Hijacked title — publish me",
      searchIntent: "COMMERCIAL",
      humanNotes: "TEST notes only",
      workflowStatus: "CONTENT_NEEDED",
    });
    assert.ok(applied.ok);
    if (!applied.ok) throw new Error("workspace");
    assert.equal(applied.draft.topic, SEO_PLANNING_TEST_FIXTURE_TOPIC);
    assert.equal(applied.draft.workingTitle, SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE);
    assert.equal(applied.draft.workflowStatus, "PLANNING");

    const forged = sanitizeSeoPlanningDraft({
      ...applied.draft,
      recommendation: "NEW_BLOG",
      fingerprint: "NEW_BLOG:evil-slug",
      proposedSlug: "evil-slug",
      linkedPostId: "post_evil",
      payload: {
        opportunity: { topic: "fake", workingTitle: "fake", confidence: "HIGH" },
        sources: [{ title: "x", url: "https://example.com/", domain: "example.com" }],
        [SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]: { kind: "NOT_A_FIXTURE" },
      },
    });
    const saved = await catalog.saveSeoPlanningDraft(forged);
    assert.equal(saved.recommendation, SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION);
    assert.equal(saved.fingerprint, SEO_PLANNING_TEST_FIXTURE_FINGERPRINT);
    assert.equal(saved.proposedSlug, "");
    assert.equal(saved.linkedPostId, null);
    assert.ok(isSeoPlanningEditorialEvidenceTestFixture(saved));
    assert.equal((saved.payload as Record<string, unknown>).opportunity, undefined);
  });
});

test("preserveLockedTestFixtureIdentity is a no-op for genuine Planning", () => {
  const genuine = genuineRefreshDraft();
  const incoming = sanitizeSeoPlanningDraft({
    ...genuine,
    topic: "Updated topic",
    workingTitle: "Updated title",
  });
  const out = preserveLockedTestFixtureIdentity(genuine, incoming);
  assert.equal(out.topic, "Updated topic");
  assert.equal(out.fingerprint, genuine.fingerprint);
});

test("handoff and eligibility blocked for TEST fixture", () => {
  const fixture = buildSeoPlanningEditorialEvidenceTestFixtureDraft({
    adminId: "admin_seo",
    createIdFn: () => "seoplan_handoff_block",
  });
  const handoff = evaluateSeoPlanningHandoffEligibility(fixture);
  assert.equal(handoff.ok, false);
  if (!handoff.ok) assert.equal(handoff.code, "test_fixture");
});

test("editorial evidence save/reload/edit/stale/clear on fixture via catalog CAS", async () => {
  await withTempCatalog(async (catalog) => {
    const created = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_ev_1",
    });
    assert.ok(created.ok);
    if (!created.ok) throw new Error("create");

    const emptyRev = fingerprintEditorialEvidenceFromPayload(created.draft.payload);
    const parsed = parseSeoPlanningEditorialEvidence({
      version: "v1",
      originalContribution: "TEST SEO EDITORIAL EVIDENCE ACCEPTANCE — DO NOT PUBLISH",
      readerBenefit: "TEST reader-benefit placeholder",
      missingEvidenceNotes: "",
      entries: [
        {
          id: "ee_1",
          evidenceType: "PROPOSED_SITE_FACT",
          claim: "TEST source note",
          url: "",
          location: "",
          notes: "",
          trust: "VERIFIED_FORGED",
        },
      ],
    });
    assert.ok(parsed.ok);
    if (!parsed.ok) throw new Error("parse");
    assert.equal(parsed.value.entries[0]!.trust, SEO_PLANNING_EDITORIAL_TRUST);

    const save1 = await catalog.mergeSeoPlanningEditorialEvidence({
      id: created.draft.id,
      expectedEvidenceRevision: emptyRev,
      evidence: parsed.value,
    });
    assert.equal(save1.ok, true);
    if (!save1.ok) throw new Error("save1");
    assert.ok(isSeoPlanningEditorialEvidenceTestFixture(save1.draft));
    assert.ok(readSeoPlanningTestFixtureMarker(save1.draft.payload));

    const rev1 = fingerprintEditorialEvidenceFromPayload(save1.draft.payload);

    const stale = await catalog.mergeSeoPlanningEditorialEvidence({
      id: created.draft.id,
      expectedEvidenceRevision: emptyRev,
      evidence: parsed.value,
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.reason, "stale");

    const editParsed = parseSeoPlanningEditorialEvidence({
      ...parsed.value,
      originalContribution: `${parsed.value.originalContribution} · edit1`,
    });
    assert.ok(editParsed.ok);
    if (!editParsed.ok) throw new Error("edit parse");
    const save2 = await catalog.mergeSeoPlanningEditorialEvidence({
      id: created.draft.id,
      expectedEvidenceRevision: rev1,
      evidence: editParsed.value,
    });
    assert.equal(save2.ok, true);
    if (!save2.ok) throw new Error("save2");
    const payload2 = save2.draft.payload as Record<string, unknown>;
    const ev2 = payload2.editorialEvidenceV1 as { originalContribution: string };
    assert.match(ev2.originalContribution, /edit1/);
    assert.ok(payload2[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]);

    const rev2 = fingerprintEditorialEvidenceFromPayload(save2.draft.payload);
    const cleared = await catalog.mergeSeoPlanningEditorialEvidence({
      id: created.draft.id,
      expectedEvidenceRevision: rev2,
      evidence: null,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) throw new Error("clear");
    assert.equal((cleared.draft.payload as Record<string, unknown>).editorialEvidenceV1, undefined);
    assert.ok(isSeoPlanningEditorialEvidenceTestFixture(cleared.draft));
  });
});

test("fixture permanent-delete policy — archive, confirm, identity, no genuine delete", async () => {
  await withTempCatalog(async (catalog) => {
    const genuine = genuineRefreshDraft();
    await catalog.saveSeoPlanningDraft(genuine);

    const created = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_del_1",
    });
    assert.ok(created.ok);
    if (!created.ok) throw new Error("create");

    const activeDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: created.draft,
      confirmation: seoPlanningPermanentDeleteConfirmToken(created.draft),
      lineageStatus: "unlinked",
    });
    assert.equal(activeDeny.ok, false);
    if (!activeDeny.ok) assert.equal(activeDeny.code, "not_archived");

    const archRes = await catalog.archiveSeoPlanningDraft(created.draft.id);
    assert.ok(archRes.ok);
    if (!archRes.ok) throw new Error("archive");
    const fixtureArchived = archRes.draft;

    const badConfirm = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: fixtureArchived,
      confirmation: "wrong title",
      lineageStatus: "unlinked",
    });
    assert.equal(badConfirm.ok, false);
    if (!badConfirm.ok) assert.equal(badConfirm.code, "confirm_mismatch");

    const genuineDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: genuine,
      confirmation: seoPlanningPermanentDeleteConfirmToken(genuine),
      lineageStatus: "unlinked",
    });
    assert.equal(genuineDeny.ok, false);
    if (!genuineDeny.ok) assert.equal(genuineDeny.code, "not_fixture");

    const linked = sanitizeSeoPlanningDraft({
      ...fixtureArchived,
      linkedPostId: "post_x",
    });
    const linkedDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: linked,
      confirmation: seoPlanningPermanentDeleteConfirmToken(linked),
      lineageStatus: "unlinked",
    });
    assert.equal(linkedDeny.ok, false);
    if (!linkedDeny.ok) assert.equal(linkedDeny.code, "linked");

    const lineageDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: fixtureArchived,
      confirmation: seoPlanningPermanentDeleteConfirmToken(fixtureArchived),
      lineageStatus: "linked",
    });
    assert.equal(lineageDeny.ok, false);
    if (!lineageDeny.ok) assert.equal(lineageDeny.code, "linked");

    const unknownDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: fixtureArchived,
      confirmation: seoPlanningPermanentDeleteConfirmToken(fixtureArchived),
      lineageStatus: "unknown",
    });
    assert.equal(unknownDeny.ok, false);
    if (!unknownDeny.ok) {
      assert.equal(unknownDeny.code, "rejected");
      assert.equal(unknownDeny.error, SEO_PLANNING_TEST_FIXTURE_LINEAGE_UNKNOWN_MESSAGE);
    }

    const allow = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: fixtureArchived,
      confirmation: seoPlanningPermanentDeleteConfirmToken(fixtureArchived),
      lineageStatus: "unlinked",
    });
    assert.equal(allow.ok, true);

    const genericBlocked = await catalog.deleteSeoPlanningDraftPermanently(fixtureArchived.id);
    assert.equal(genericBlocked.ok, false);
    if (!genericBlocked.ok) {
      assert.equal(genericBlocked.error, SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE);
    }
    assert.ok(await catalog.getSeoPlanningDraftById(fixtureArchived.id));

    const deleted = await catalog.deleteSeoPlanningEditorialEvidenceTestFixturePermanentlyAtomic({
      id: fixtureArchived.id,
      confirmation: seoPlanningPermanentDeleteConfirmToken(fixtureArchived),
    });
    assert.equal(deleted.ok, true);
    assert.equal(await catalog.getSeoPlanningDraftById(fixtureArchived.id), null);
    assert.ok(await catalog.getSeoPlanningDraftById(genuine.id));
    assert.equal(await catalog.isSeoPlanningEditorialEvidenceTestFixtureOneshotConsumed(), true);

    const recreate = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_del_2",
    });
    assert.equal(recreate.ok, false);
    if (!recreate.ok) {
      assert.equal(recreate.code, "oneshot_consumed");
      assert.equal(recreate.error, SEO_PLANNING_TEST_FIXTURE_ONESHOT_CONSUMED_MESSAGE);
    }
  });
});

test("create confirmation phrase and OFF-before-cleanup order are stable", () => {
  assert.equal(confirmSeoPlanningTestFixtureCreate(SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM), true);
  assert.equal(confirmSeoPlanningTestFixtureCreate("nope"), false);
  assert.deepEqual([...SEO_PLANNING_TEST_FIXTURE_OFF_BEFORE_CLEANUP_ORDER], [
    "approved_on_release",
    "create_one_fixture",
    "approved_off_release",
    "verify_off_without_mutating_create",
    "evidence_acceptance_on_existing_id",
    "archive_exact_id",
    "fixture_specific_permanent_delete",
  ]);
});

test("reserved/corrupt fixture fence — generic delete rejected; notes alone not protected", async () => {
  await withTempCatalog(async (catalog) => {
    async function archiveThenGenericDelete(id: string) {
      const arch = await catalog.archiveSeoPlanningDraft(id);
      assert.ok(arch.ok);
      return catalog.deleteSeoPlanningDraftPermanently(id);
    }

    // 1) Exact fingerprint + valid marker (full fixture).
    const valid = await createSeoPlanningEditorialEvidenceTestFixture({
      adminId: "admin_seo",
      catalog,
      testOnlyForceEnabled: true,
      createIdFn: () => "seoplan_fence_valid",
    });
    assert.ok(valid.ok);
    if (!valid.ok) throw new Error("valid create");
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(valid.draft), true);
    assert.equal(isSeoPlanningEditorialEvidenceTestFixture(valid.draft), true);
    const validGeneric = await archiveThenGenericDelete(valid.draft.id);
    assert.equal(validGeneric.ok, false);
    if (!validGeneric.ok) {
      assert.equal(validGeneric.error, SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE);
    }
    assert.ok(await catalog.getSeoPlanningDraftById(valid.draft.id));

    // Clean via fixture-specific delete so later cases can reuse fingerprint.
    const validArchived = await catalog.getSeoPlanningDraftById(valid.draft.id);
    assert.ok(validArchived);
    const cleaned = await catalog.deleteSeoPlanningEditorialEvidenceTestFixturePermanentlyAtomic({
      id: validArchived!.id,
      confirmation: seoPlanningPermanentDeleteConfirmToken(validArchived!),
    });
    assert.equal(cleaned.ok, true);

    // 2) Exact fingerprint + corrupted marker.
    const corruptMarker = sanitizeSeoPlanningDraft({
      ...buildSeoPlanningEditorialEvidenceTestFixtureDraft({
        adminId: "admin_seo",
        createIdFn: () => "seoplan_fence_corrupt",
      }),
      payload: {
        [SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]: { kind: "NOT_A_FIXTURE", broken: true },
      },
    });
    assert.equal(isSeoPlanningEditorialEvidenceTestFixture(corruptMarker), false);
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(corruptMarker), true);
    await catalog.saveSeoPlanningDraft(corruptMarker);
    const corruptGeneric = await archiveThenGenericDelete(corruptMarker.id);
    assert.equal(corruptGeneric.ok, false);
    if (!corruptGeneric.ok) {
      assert.equal(corruptGeneric.error, SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE);
    }
    const corruptSpecific = await catalog.deleteSeoPlanningEditorialEvidenceTestFixturePermanentlyAtomic({
      id: corruptMarker.id,
      confirmation: seoPlanningPermanentDeleteConfirmToken(
        (await catalog.getSeoPlanningDraftById(corruptMarker.id))!,
      ),
    });
    assert.equal(corruptSpecific.ok, false);
    if (!corruptSpecific.ok) assert.equal(corruptSpecific.code, "not_fixture");
    assert.ok(await catalog.getSeoPlanningDraftById(corruptMarker.id));
  });

  await withTempCatalog(async (catalog) => {
    async function archiveThenGenericDelete(id: string) {
      const arch = await catalog.archiveSeoPlanningDraft(id);
      assert.ok(arch.ok);
      return catalog.deleteSeoPlanningDraftPermanently(id);
    }

    // Missing marker + reserved fingerprint.
    const missingMarker = sanitizeSeoPlanningDraft({
      id: "seoplan_fence_missing_marker",
      recommendation: SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION,
      workflowStatus: "PLANNING",
      fingerprint: SEO_PLANNING_TEST_FIXTURE_FINGERPRINT,
      topic: SEO_PLANNING_TEST_FIXTURE_TOPIC,
      workingTitle: SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
      proposedSlug: "",
      targetPostId: null,
      matchedPublicUrl: "",
      restorePath: "",
      searchIntent: "INFORMATIONAL",
      linkedPostId: null,
      createdBy: "admin_seo",
      createdAt: "2026-10-22T00:00:00.000Z",
      updatedAt: "2026-10-22T00:00:00.000Z",
      archivedAt: null,
      payload: { workspace: { humanNotes: "no marker key" } },
    });
    assert.equal(isSeoPlanningEditorialEvidenceTestFixture(missingMarker), false);
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(missingMarker), true);
    await catalog.saveSeoPlanningDraft(missingMarker);
    const missingGeneric = await archiveThenGenericDelete(missingMarker.id);
    assert.equal(missingGeneric.ok, false);
    if (!missingGeneric.ok) {
      assert.equal(missingGeneric.error, SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE);
    }
    const missingSpecific = await catalog.deleteSeoPlanningEditorialEvidenceTestFixturePermanentlyAtomic({
      id: missingMarker.id,
      confirmation: seoPlanningPermanentDeleteConfirmToken(
        (await catalog.getSeoPlanningDraftById(missingMarker.id))!,
      ),
    });
    assert.equal(missingSpecific.ok, false);
    if (!missingSpecific.ok) assert.equal(missingSpecific.code, "not_fixture");
  });

  await withTempCatalog(async (catalog) => {
    async function archiveThenGenericDelete(id: string) {
      const arch = await catalog.archiveSeoPlanningDraft(id);
      assert.ok(arch.ok);
      return catalog.deleteSeoPlanningDraftPermanently(id);
    }

    // 4) Valid-looking marker + altered fingerprint.
    const alteredFp = sanitizeSeoPlanningDraft({
      id: "seoplan_fence_alt_fp",
      recommendation: "REFRESH_EXISTING",
      workflowStatus: "PLANNING",
      fingerprint: "REFRESH_EXISTING:post_altered_fixture_probe",
      topic: "Altered fingerprint probe",
      workingTitle: "Altered fingerprint probe",
      proposedSlug: "",
      targetPostId: null,
      matchedPublicUrl: "",
      restorePath: "",
      searchIntent: "INFORMATIONAL",
      linkedPostId: null,
      createdBy: "admin_seo",
      createdAt: "2026-10-22T00:00:00.000Z",
      updatedAt: "2026-10-22T00:00:00.000Z",
      archivedAt: null,
      payload: {
        [SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]: {
          kind: SEO_PLANNING_TEST_FIXTURE_KIND,
          purpose: SEO_PLANNING_TEST_FIXTURE_PURPOSE,
          version: 1,
          createdAt: "2026-10-22T00:00:00.000Z",
          createdBy: "admin_seo",
        },
      },
    });
    assert.equal(isSeoPlanningEditorialEvidenceTestFixture(alteredFp), false);
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(alteredFp), true);
    await catalog.saveSeoPlanningDraft(alteredFp);
    const altGeneric = await archiveThenGenericDelete(alteredFp.id);
    assert.equal(altGeneric.ok, false);
    if (!altGeneric.ok) {
      assert.equal(altGeneric.error, SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE);
    }

    // 5) Partial / malformed marker only.
    const partial = sanitizeSeoPlanningDraft({
      id: "seoplan_fence_partial",
      recommendation: "NEW_BLOG",
      workflowStatus: "PLANNING",
      fingerprint: "NEW_BLOG:partial_marker_probe",
      topic: "Partial marker probe",
      workingTitle: "Partial marker probe",
      proposedSlug: "",
      targetPostId: null,
      matchedPublicUrl: "",
      restorePath: "",
      searchIntent: "INFORMATIONAL",
      linkedPostId: null,
      createdBy: "admin_seo",
      createdAt: "2026-10-22T00:00:00.000Z",
      updatedAt: "2026-10-22T00:00:00.000Z",
      archivedAt: null,
      payload: {
        [SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]: { kind: SEO_PLANNING_TEST_FIXTURE_KIND },
      },
    });
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(partial), true);
    await catalog.saveSeoPlanningDraft(partial);
    const partialGeneric = await archiveThenGenericDelete(partial.id);
    assert.equal(partialGeneric.ok, false);
    if (!partialGeneric.ok) {
      assert.equal(partialGeneric.error, SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE);
    }

    // 8–10) Genuine archived Buffering / Firestick-style drafts remain deletable;
    // "TEST" in notes alone is not protected.
    const buffering = sanitizeSeoPlanningDraft({
      ...genuineRefreshDraft(),
      id: "seoplan_fence_buffering",
      fingerprint: "REFRESH_EXISTING:post_buffering",
      topic: "Diagnosing IPTV buffering",
      workingTitle: "IPTV Buffering Guide",
      targetPostId: "post_buffering",
      payload: {
        workspace: { humanNotes: "TEST notes must not fence this genuine draft" },
        opportunity: {
          topic: "Diagnosing IPTV buffering",
          workingTitle: "IPTV Buffering Guide",
          confidence: "HIGH",
          whyNow: "Real",
          webEvidence: "Real",
        },
      },
    });
    const firestick = sanitizeSeoPlanningDraft({
      id: "seoplan_fence_firestick",
      recommendation: "REFRESH_EXISTING",
      workflowStatus: "PLANNING",
      fingerprint: "REFRESH_EXISTING:post_firestick",
      topic: "Firestick IPTV setup",
      workingTitle: "Firestick IPTV setup",
      proposedSlug: "",
      targetPostId: "post_firestick",
      matchedPublicUrl: "/blogs/firestick/",
      restorePath: "",
      searchIntent: "INFORMATIONAL",
      linkedPostId: null,
      createdBy: "admin_1",
      createdAt: "2026-10-07T08:00:00.000Z",
      updatedAt: "2026-10-07T08:00:00.000Z",
      archivedAt: null,
      payload: {
        opportunity: {
          topic: "Firestick IPTV setup",
          workingTitle: "Firestick IPTV setup",
          confidence: "HIGH",
          whyNow: "Real",
          webEvidence: "Real",
        },
      },
    });
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(buffering), false);
    assert.equal(isReservedOrFixtureMarkedSeoPlanningDraft(firestick), false);
    await catalog.saveSeoPlanningDraft(buffering);
    await catalog.saveSeoPlanningDraft(firestick);

    const activeDeny = await catalog.deleteSeoPlanningDraftPermanently(buffering.id);
    assert.equal(activeDeny.ok, false);

    const bufferingDel = await archiveThenGenericDelete(buffering.id);
    assert.equal(bufferingDel.ok, true);
    assert.equal(await catalog.getSeoPlanningDraftById(buffering.id), null);

    const firestickDel = await archiveThenGenericDelete(firestick.id);
    assert.equal(firestickDel.ok, true);
    assert.equal(await catalog.getSeoPlanningDraftById(firestick.id), null);

    // Partial/altered fixture-marked rows still present (not deleted).
    assert.ok(await catalog.getSeoPlanningDraftById(alteredFp.id));
    assert.ok(await catalog.getSeoPlanningDraftById(partial.id));
  });
});

test("mergeEditorialEvidenceIntoPayload does not invent opportunity provenance", () => {
  const fixture = buildSeoPlanningEditorialEvidenceTestFixtureDraft({
    adminId: "admin_seo",
    createIdFn: () => "seoplan_merge",
  });
  const base = { ...(fixture.payload as Record<string, unknown>) };
  const next = mergeEditorialEvidenceIntoPayload(base, {
    version: "v1",
    originalContribution: "TEST",
    readerBenefit: "",
    missingEvidenceNotes: "",
    entries: [],
  });
  assert.ok(next[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]);
  assert.equal(next.opportunity, undefined);
});
