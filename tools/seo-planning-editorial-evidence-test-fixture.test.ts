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
  SEO_PLANNING_TEST_FIXTURE_DISABLED_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_EXISTS_MESSAGE,
  SEO_PLANNING_TEST_FIXTURE_FINGERPRINT,
  SEO_PLANNING_TEST_FIXTURE_KIND,
  SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY,
  SEO_PLANNING_TEST_FIXTURE_PURPOSE,
  SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION,
  SEO_PLANNING_TEST_FIXTURE_TOPIC,
  SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
  buildSeoPlanningEditorialEvidenceTestFixtureDraft,
  createSeoPlanningEditorialEvidenceTestFixture,
  evaluateSeoPlanningTestFixturePermanentDelete,
  evaluateTestFixtureCreationGate,
  ignoreClientSuppliedTestFixtureFlags,
  isSeoPlanningEditorialEvidenceTestFixture,
  isSeoPlanningEditorialEvidenceTestFixtureCreationEnabled,
  preserveLockedTestFixtureIdentity,
  readSeoPlanningTestFixtureMarker,
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
      assert.equal(dup.code, "exists");
      assert.equal(dup.error, SEO_PLANNING_TEST_FIXTURE_EXISTS_MESSAGE);
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
    });
    assert.equal(badConfirm.ok, false);
    if (!badConfirm.ok) assert.equal(badConfirm.code, "confirm_mismatch");

    const genuineDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: genuine,
      confirmation: seoPlanningPermanentDeleteConfirmToken(genuine),
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
    });
    assert.equal(linkedDeny.ok, false);
    if (!linkedDeny.ok) assert.equal(linkedDeny.code, "linked");

    const lineageDeny = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: fixtureArchived,
      confirmation: seoPlanningPermanentDeleteConfirmToken(fixtureArchived),
      lineageLinked: true,
    });
    assert.equal(lineageDeny.ok, false);
    if (!lineageDeny.ok) assert.equal(lineageDeny.code, "linked");

    const allow = evaluateSeoPlanningTestFixturePermanentDelete({
      draft: fixtureArchived,
      confirmation: seoPlanningPermanentDeleteConfirmToken(fixtureArchived),
    });
    assert.equal(allow.ok, true);
    const deleted = await catalog.deleteSeoPlanningDraftPermanently(fixtureArchived.id);
    assert.equal(deleted.ok, true);
    assert.equal(await catalog.getSeoPlanningDraftById(fixtureArchived.id), null);
    assert.ok(await catalog.getSeoPlanningDraftById(genuine.id));
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
