/**
 * Planning Draft lifecycle — Archive / Restore / Safe Permanent Delete.
 * Deterministic only. No OpenAI / Gemini / GSC / localhost CMS.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  archiveSeoPlanningDraftRecord,
  assertArchivedForPermanentDelete,
  confirmSeoPlanningPermanentDelete,
  filterSeoPlanningDraftsByLifecycle,
  isSeoPlanningArchivedMutationError,
  isSeoPlanningDraftArchived,
  restoreSeoPlanningDraftRecord,
  seoPlanningPermanentDeleteConfirmToken,
  SEO_PLANNING_ALREADY_ARCHIVED_MESSAGE,
  SEO_PLANNING_ARCHIVED_EDIT_MESSAGE,
  SEO_PLANNING_ARCHIVED_PROCEED_MESSAGE,
  SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE,
  SEO_PLANNING_NOT_ARCHIVED_MESSAGE,
} from "../lib/cms/seo-planning/lifecycle";
import { sanitizeSeoPlanningDraft } from "../lib/cms/seo-planning/sanitize";
import { applySeoPlanningWorkspaceUpdate } from "../lib/cms/seo-planning/workspace";
import { applySeoPlanningSuggestionCommand } from "../lib/cms/seo-planning/suggestions";
import { buildWritingBrief } from "../lib/cms/seo-planning/writing-brief";
import { buildImageBrief } from "../lib/cms/seo-planning/image-brief";
import { proceedSeoOpportunityToPlanningDraft } from "../lib/cms/seo-planning/proceed";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function baseDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return sanitizeSeoPlanningDraft({
    id: "seoplan_life_1",
    recommendation: "REFRESH_EXISTING",
    workflowStatus: "IMAGE_NEEDED",
    fingerprint: "REFRESH_EXISTING:post_hd4k",
    topic: "Understanding streaming quality and home Wi-Fi",
    workingTitle: "HD and 4K streaming: why Wi-Fi quality matters as much as broadband speed",
    proposedSlug: "",
    targetPostId: "post_hd4k",
    matchedPublicUrl: "/blogs/hd-vs-4k-streaming/",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-07T08:00:00.000Z",
    updatedAt: "2026-10-07T08:19:00.000Z",
    archivedAt: null,
    payload: {
      opportunity: {
        topic: "Understanding streaming quality and home Wi-Fi",
        workingTitle: "HD and 4K streaming: why Wi-Fi quality matters as much as broadband speed",
        confidence: "HIGH",
        whyNow: "Ofcom guidance.",
        webEvidence: "Wi-Fi vs broadband.",
        suggestedAngle: "Practical Wi-Fi checks.",
        nextStep: "Refresh article.",
        gscEvidence: [{ id: "gsc_1", kind: "query", clicks: 1, impressions: 10, ctr: 0.1, position: 12 }],
      },
      sources: [{ title: "Ofcom", url: "https://www.ofcom.org.uk/", domain: "ofcom.org.uk" }],
      workspace: { humanNotes: "E2/E3 acceptance — private test — do not publish" },
      writingPrompts: {
        gemini: {
          chatgptPrompt: "Gemini writing prompt cache",
          writingFingerprint: "wf_gemini",
          model: "gemini-3.8-flash",
          generatedAt: "2026-10-07T02:00:00.000Z",
          briefSpec: "d1-1",
        },
      },
      imagePrompts: {
        gemini: {
          chatgptImagePrompt: "Gemini image prompt cache",
          imageFingerprint: "if_gemini",
          model: "gemini-3.8-flash",
          generatedAt: "2026-10-07T03:19:13.449Z",
          briefSpec: "e1-1",
        },
        openai: {
          chatgptImagePrompt: "OpenAI image prompt cache",
          imageFingerprint: "if_openai",
          model: "gpt-6-luna",
          generatedAt: "2026-10-07T16:02:11.322Z",
          briefSpec: "e1-1",
        },
      },
    },
    ...overrides,
  });
}

test("schema version bumped for archived_at column", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 4);
  const schema = read("lib/db/schema.ts");
  const ddl = read("db/cms-schema.sql");
  const migrate = read("lib/cms/mysql-migrate.ts");
  assert.match(schema, /archived_at DATETIME NULL/);
  assert.match(ddl, /archived_at DATETIME NULL/);
  assert.match(migrate, /seo_planning_drafts[\s\S]*archived_at/);
});

test("legacy draft without archivedAt is active", () => {
  const legacy = sanitizeSeoPlanningDraft({
    ...baseDraft(),
    archivedAt: undefined,
  } as SeoPlanningDraft);
  assert.equal(legacy.archivedAt, null);
  assert.equal(isSeoPlanningDraftArchived(legacy), false);
  assert.equal(filterSeoPlanningDraftsByLifecycle([legacy], "active").length, 1);
  assert.equal(filterSeoPlanningDraftsByLifecycle([legacy], "archived").length, 0);
});

test("archive then restore preserves same id, workspace, caches, evidence", () => {
  const stored = baseDraft();
  const archived = archiveSeoPlanningDraftRecord(stored, "2026-10-07T21:00:00.000Z");
  assert.equal(archived.ok, true);
  if (!archived.ok) return;
  assert.equal(archived.draft.id, stored.id);
  assert.equal(archived.draft.archivedAt, "2026-10-07T21:00:00.000Z");
  assert.equal(archived.draft.workflowStatus, "IMAGE_NEEDED");
  assert.equal(archived.draft.fingerprint, stored.fingerprint);
  assert.equal(archived.draft.targetPostId, "post_hd4k");
  assert.deepEqual(archived.draft.payload, stored.payload);

  const restored = restoreSeoPlanningDraftRecord(archived.draft, "2026-10-07T21:05:00.000Z");
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.draft.id, stored.id);
  assert.equal(restored.draft.archivedAt, null);
  assert.equal(restored.draft.workflowStatus, "IMAGE_NEEDED");
  assert.deepEqual(restored.draft.payload, stored.payload);
});

test("active/archived list filters and transition guards", () => {
  const active = baseDraft({ id: "a1" });
  const archived = baseDraft({
    id: "a2",
    archivedAt: "2026-10-07T21:00:00.000Z",
    fingerprint: "REFRESH_EXISTING:other",
  });
  assert.deepEqual(
    filterSeoPlanningDraftsByLifecycle([active, archived], "active").map((d) => d.id),
    ["a1"],
  );
  assert.deepEqual(
    filterSeoPlanningDraftsByLifecycle([active, archived], "archived").map((d) => d.id),
    ["a2"],
  );

  const again = archiveSeoPlanningDraftRecord(archived);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.error, SEO_PLANNING_ALREADY_ARCHIVED_MESSAGE);

  const restoreActive = restoreSeoPlanningDraftRecord(active);
  assert.equal(restoreActive.ok, false);
  if (!restoreActive.ok) assert.equal(restoreActive.error, SEO_PLANNING_NOT_ARCHIVED_MESSAGE);

  assert.equal(assertArchivedForPermanentDelete(active).ok, false);
  assert.equal(assertArchivedForPermanentDelete(archived).ok, true);
});

test("permanent delete confirmation requires exact title token", () => {
  const draft = baseDraft({ archivedAt: "2026-10-07T21:00:00.000Z" });
  const token = seoPlanningPermanentDeleteConfirmToken(draft);
  assert.equal(confirmSeoPlanningPermanentDelete(draft, token).ok, true);
  assert.equal(confirmSeoPlanningPermanentDelete(draft, "wrong title").ok, false);
});

test("archived drafts are not provider eligible", () => {
  const active = baseDraft({
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:wifi-quality",
    proposedSlug: "wifi-quality",
    targetPostId: null,
    matchedPublicUrl: "",
  });
  const archived = baseDraft({
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:wifi-quality-archived",
    proposedSlug: "wifi-quality-archived",
    targetPostId: null,
    matchedPublicUrl: "",
    archivedAt: "2026-10-07T21:00:00.000Z",
  });
  assert.equal(buildWritingBrief(active).providerEligible, true);
  const writing = buildWritingBrief(archived);
  assert.equal(writing.providerEligible, false);
  assert.equal(writing.providerIneligibleReason, SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE);

  const imageActive = baseDraft({
    recommendation: "NEW_BLOG",
    workflowStatus: "IMAGE_NEEDED",
    fingerprint: "NEW_BLOG:wifi-image",
    proposedSlug: "wifi-image",
    targetPostId: null,
    matchedPublicUrl: "",
  });
  const imageArchived = baseDraft({
    recommendation: "NEW_BLOG",
    workflowStatus: "IMAGE_NEEDED",
    fingerprint: "NEW_BLOG:wifi-image-archived",
    proposedSlug: "wifi-image-archived",
    targetPostId: null,
    matchedPublicUrl: "",
    archivedAt: "2026-10-07T21:00:00.000Z",
  });
  assert.equal(buildImageBrief(imageActive).providerEligible, true);
  const image = buildImageBrief(imageArchived);
  assert.equal(image.providerEligible, false);
  assert.equal(image.providerIneligibleReason, SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE);
});

test("Proceed refuses archived fingerprint owner with safe error", async () => {
  const archived = baseDraft({
    archivedAt: "2026-10-07T21:00:00.000Z",
    fingerprint: "REFRESH_EXISTING:post_hd4k",
  });
  const post = {
    id: "post_hd4k",
    title: "HD vs 4K",
    slug: "hd-vs-4k-streaming",
    excerpt: "",
    content: "",
    categoryId: "cat_quality",
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-08-05T00:00:00.000Z",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
  } as BlogPost;
  const catalog = {
    listPosts: async () => [post],
    listPages: async () => [],
    listCategories: async () => [],
    listActiveRedirects: async () => [],
    getSeoPlanningDraftByFingerprint: async () => archived,
    saveSeoPlanningDraft: async () => {
      throw new Error("save should not run");
    },
  };
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: {
      recommendation: "REFRESH_EXISTING",
      topic: "Understanding streaming quality and home Wi-Fi",
      workingTitle: "HD and 4K streaming: why Wi-Fi quality matters as much as broadband speed",
      searchIntent: "INFORMATIONAL",
      whyNow: "Ofcom",
      webEvidence: "Wi-Fi",
      existingCoverage: "PARTIAL",
      matchedTitle: "HD vs 4K",
      matchedPublicUrl: "/blogs/hd-vs-4k-streaming/",
      restorePath: "",
      suggestedAngle: "Angle",
      nextStep: "Next",
      confidence: "HIGH",
      gscEvidenceRefs: [],
      gscEvidence: [],
      historicalSignal: false,
    },
    adminId: "admin_1",
    catalog,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SEO_PLANNING_ARCHIVED_PROCEED_MESSAGE);
});

test("JSON catalog: archive / list / restore / permanent delete isolation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flix-planning-life-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const primary = baseDraft();
    const sibling = baseDraft({
      id: "seoplan_life_sibling",
      fingerprint: "REFRESH_EXISTING:sibling",
      workingTitle: "Sibling draft",
    });
    await cms.saveSeoPlanningDraft(primary);
    await cms.saveSeoPlanningDraft(sibling);

    const archived = await cms.archiveSeoPlanningDraft(primary.id);
    assert.equal(archived.ok, true);
    if (!archived.ok) return;
    assert.equal(archived.draft.archivedAt != null, true);
    assert.deepEqual(archived.draft.payload.writingPrompts, primary.payload.writingPrompts);
    assert.deepEqual(archived.draft.payload.imagePrompts, primary.payload.imagePrompts);

    const activeList = await cms.listSeoPlanningDrafts({ lifecycle: "active" });
    assert.equal(activeList.some((d) => d.id === primary.id), false);
    assert.equal(activeList.some((d) => d.id === sibling.id), true);

    const archivedList = await cms.listSeoPlanningDrafts({ lifecycle: "archived" });
    assert.equal(archivedList.some((d) => d.id === primary.id), true);

    const doubleArchive = await cms.archiveSeoPlanningDraft(primary.id);
    assert.equal(doubleArchive.ok, false);

    const activeDelete = await cms.deleteSeoPlanningDraftPermanently(sibling.id);
    assert.equal(activeDelete.ok, false);

    const restored = await cms.restoreSeoPlanningDraft(primary.id);
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.equal(restored.draft.id, primary.id);
    assert.equal(restored.draft.archivedAt, null);

    const reArchived = await cms.archiveSeoPlanningDraft(primary.id);
    assert.equal(reArchived.ok, true);

    const deleted = await cms.deleteSeoPlanningDraftPermanently(primary.id);
    assert.equal(deleted.ok, true);

    const missing = await cms.getSeoPlanningDraftById(primary.id);
    assert.equal(missing, null);

    const siblingStill = await cms.getSeoPlanningDraftById(sibling.id);
    assert.ok(siblingStill);
    assert.equal(siblingStill!.workingTitle, "Sibling draft");
    assert.equal(siblingStill!.archivedAt, null);

    const missingDelete = await cms.deleteSeoPlanningDraftPermanently(primary.id);
    assert.equal(missingDelete.ok, false);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("source wiring: actions, UI, auth, no BlogPost cascade", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  const list = read("components/sidhu/SeoPlanningList.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const controls = read("components/sidhu/SeoPlanningLifecycleControls.tsx");
  const catalog = read("lib/cms/catalog.ts");
  const mysql = read("lib/cms/mysql-catalog.ts");
  const json = read("lib/cms/json-catalog.ts");
  assert.match(actions, /archiveSeoPlanningDraftAction/);
  assert.match(actions, /restoreSeoPlanningDraftAction/);
  assert.match(actions, /deleteSeoPlanningDraftPermanentlyAction/);
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /SEO_PLANNING_ARCHIVED_EDIT_MESSAGE/);
  assert.match(actions, /isSeoPlanningArchivedMutationError/);
  assert.match(catalog, /deleteSeoPlanningDraftPermanently/);
  assert.match(list, /Archived/);
  assert.match(list, /view=archived/);
  assert.match(detail, /SeoPlanningLifecycleControls/);
  assert.match(controls, /Delete Permanently/);
  assert.match(controls, /Restore/);
  assert.match(controls, /Archive/);
  assert.doesNotMatch(controls, /deletePost|removeMedia|saveRedirect|Cloudinary/);
  assert.doesNotMatch(actions, /deletePost|removeMedia|saveRedirect/);
  // Final ordinary-save guard: re-read under lock/txn; never write archived_at on UPDATE.
  assert.match(mysql, /assertSeoPlanningDraftMutableForOrdinarySave/);
  assert.match(mysql, /SELECT \* FROM seo_planning_drafts WHERE id = \? LIMIT 1 FOR UPDATE/);
  assert.match(mysql, /Do not write archived_at/);
  assert.match(json, /assertSeoPlanningDraftMutableForOrdinarySave/);
  assert.match(mysql, /archived_at = NULL/); // Restore still clears explicitly
});

test("REGRESSION: stale workspace Save after Archive cannot clear archivedAt (JSON)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flix-planning-race-save-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const active = baseDraft({
      id: "seoplan_race_save",
      fingerprint: "REFRESH_EXISTING:race_save",
      workflowStatus: "CONTENT_NEEDED",
      recommendation: "NEW_BLOG",
      proposedSlug: "race-save",
      targetPostId: null,
      matchedPublicUrl: "",
    });
    await cms.saveSeoPlanningDraft(active);

    // Capture ordinary mutation from ACTIVE snapshot (pre-Archive).
    const applied = applySeoPlanningWorkspaceUpdate(active, {
      id: active.id,
      topic: "Stale topic after archive",
      workingTitle: active.workingTitle,
      searchIntent: "INFORMATIONAL",
      workflowStatus: "CONTENT_NEEDED",
      humanNotes: "stale notes",
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.draft.archivedAt, null);

    const archived = await cms.archiveSeoPlanningDraft(active.id);
    assert.equal(archived.ok, true);
    if (!archived.ok) return;
    const archivedAt = archived.draft.archivedAt;
    assert.ok(archivedAt);

    await assert.rejects(
      () => cms.saveSeoPlanningDraft(applied.draft),
      (error: unknown) => {
        assert.equal(isSeoPlanningArchivedMutationError(error), true);
        if (error instanceof Error) {
          assert.equal(error.message, SEO_PLANNING_ARCHIVED_EDIT_MESSAGE);
        }
        return true;
      },
    );

    const stored = await cms.getSeoPlanningDraftById(active.id);
    assert.ok(stored);
    assert.equal(isSeoPlanningDraftArchived(stored), true);
    assert.equal(stored!.archivedAt, archivedAt);
    assert.notEqual(stored!.topic, "Stale topic after archive");
    assert.equal(stored!.topic, active.topic);

    const activeList = await cms.listSeoPlanningDrafts({ lifecycle: "active" });
    assert.equal(activeList.some((d) => d.id === active.id), false);
    const archivedList = await cms.listSeoPlanningDrafts({ lifecycle: "archived" });
    assert.equal(archivedList.some((d) => d.id === active.id), true);

    // Restore remains the authorized clear path.
    const restored = await cms.restoreSeoPlanningDraft(active.id);
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.equal(restored.draft.archivedAt, null);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REGRESSION: stale suggestion mutation after Archive cannot clear archivedAt (JSON)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flix-planning-race-sug-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const active = baseDraft({
      id: "seoplan_race_sug",
      fingerprint: "REFRESH_EXISTING:race_sug",
      workflowStatus: "PLANNING",
    });
    await cms.saveSeoPlanningDraft(active);

    const applied = applySeoPlanningSuggestionCommand(active, {
      id: active.id,
      key: "topic",
      operation: "IGNORE",
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(applied.changed, true);
    assert.equal(applied.draft.archivedAt, null);

    const archived = await cms.archiveSeoPlanningDraft(active.id);
    assert.equal(archived.ok, true);
    if (!archived.ok) return;
    const archivedAt = archived.draft.archivedAt;

    await assert.rejects(() => cms.saveSeoPlanningDraft(applied.draft), (error: unknown) => {
      assert.equal(isSeoPlanningArchivedMutationError(error), true);
      return true;
    });

    const stored = await cms.getSeoPlanningDraftById(active.id);
    assert.ok(stored);
    assert.equal(stored!.archivedAt, archivedAt);
    assert.equal(isSeoPlanningDraftArchived(stored), true);
    // Stale suggestion payload must not land while archived.
    assert.equal(
      (stored!.payload as { suggestions?: unknown }).suggestions == null ||
        !Object.keys((stored!.payload as { suggestions?: Record<string, unknown> }).suggestions || {})
          .length,
      true,
    );
    const activeList = await cms.listSeoPlanningDrafts({ lifecycle: "active" });
    assert.equal(activeList.some((d) => d.id === active.id), false);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REGRESSION: provider final cache merge after Archive is rejected (JSON)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flix-planning-race-provider-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const active = baseDraft({
      id: "seoplan_race_provider",
      fingerprint: "REFRESH_EXISTING:race_provider",
      workflowStatus: "IMAGE_NEEDED",
    });
    await cms.saveSeoPlanningDraft(active);
    const before = await cms.getSeoPlanningDraftById(active.id);
    assert.ok(before);
    const beforeUpdatedAt = before!.updatedAt;
    const beforeImage = before!.payload.imagePrompts;

    const archived = await cms.archiveSeoPlanningDraft(active.id);
    assert.equal(archived.ok, true);
    if (!archived.ok) return;
    const archivedAt = archived.draft.archivedAt;

    const merged = await cms.mergeSeoPlanningImagePromptCache({
      id: active.id,
      provider: "openai",
      entry: {
        chatgptImagePrompt: "Should not persist after archive",
        imageFingerprint: "if_stale",
        model: "gpt-6-luna",
        generatedAt: "2026-10-07T22:00:00.000Z",
        briefSpec: "e1-1",
      },
    });
    assert.equal(merged.ok, false);
    if (!merged.ok) assert.equal(merged.reason, "rejected");

    const stored = await cms.getSeoPlanningDraftById(active.id);
    assert.ok(stored);
    assert.equal(stored!.archivedAt, archivedAt);
    assert.deepEqual(stored!.payload.imagePrompts, beforeImage);
    // Rejected merge must not bump updatedAt beyond archive's own bump.
    assert.equal(stored!.updatedAt, archived.draft.updatedAt);
    assert.notEqual(stored!.updatedAt, beforeUpdatedAt);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});
