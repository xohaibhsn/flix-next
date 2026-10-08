/**
 * Phase C — private planning suggestions from the frozen opportunity snapshot.
 * Mocks only. No Google / OpenAI / production CMS writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { SEO_PLANNING_FIELD_CAPS } from "../lib/cms/seo-planning/constants";
import {
  SEO_PLANNING_SUGGESTION_DIRTY_MESSAGE,
  SEO_PLANNING_SUGGESTION_DRIFT_MESSAGE,
  SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE,
  SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE,
  allowedSeoPlanningSuggestionKeys,
  applySeoPlanningSuggestionCommand,
  applySeoPlanningWorkspaceUpdate,
  deriveSeoPlanningSuggestions,
  parseSeoPlanningSuggestionInput,
  parseSeoPlanningWorkspaceInput,
  readPersistedSeoPlanningSuggestions,
  seoPlanningSuggestionDrift,
  seoPlanningSuggestionsForDisplay,
  type SeoPlanningSuggestionCommand,
  type SeoPlanningSuggestionKey,
} from "../lib/cms/seo-planning";
import type { SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();
const NOW = "2026-10-06T12:00:00.000Z";
const LATER = "2026-10-06T13:00:00.000Z";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function opportunity(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Fire TV buffering",
    workingTitle: "Fire TV buffering UK",
    searchIntent: "TROUBLESHOOTING",
    whyNow: "Amazon help is current.",
    webEvidence: "Check the network status tool.",
    existingCoverage: "PARTIAL",
    matchedTitle: "How to Watch IPTV on Firestick",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    recommendation: "REFRESH_EXISTING",
    restorePath: "",
    suggestedAngle: "Add a short checklist.",
    nextStep: "Review the existing guide.",
    confidence: "HIGH",
    gscEvidenceRefs: ["Q1"],
    gscEvidence: [{ id: "Q1", kind: "QUERY" }],
    historicalSignal: false,
    ...overrides,
  };
}

function baseDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  const recommendation = overrides.recommendation || "REFRESH_EXISTING";
  return {
    id: "seoplan_c1",
    recommendation,
    workflowStatus: "PLANNING",
    fingerprint: "REFRESH_EXISTING:post_1",
    topic: "Fire TV buffering",
    workingTitle: "Fire TV buffering UK",
    proposedSlug: "fire-tv-buffering-uk",
    targetPostId: "post_1",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    payload: {
      opportunity: opportunity({ recommendation }),
      sources: [{ title: "Amazon", url: "https://example.com/a", domain: "example.com" }],
      gsc: { status: "AVAILABLE", statusLabel: "GSC evidence included", helperText: "UK window" },
      workspace: { humanNotes: "Keep me", keeper: "yes" },
      futureBlock: { ok: true },
    },
    ...overrides,
  };
}

function workspaceOf(draft: SeoPlanningDraft) {
  return (draft.payload as { workspace?: Record<string, unknown> }).workspace || {};
}

function suggestionsOf(draft: SeoPlanningDraft) {
  return readPersistedSeoPlanningSuggestions(draft.payload);
}

function run(
  draft: SeoPlanningDraft,
  command: Omit<SeoPlanningSuggestionCommand, "id"> & { id?: string },
  now = NOW,
) {
  return applySeoPlanningSuggestionCommand(
    draft,
    { id: draft.id, ...command },
    now,
  );
}

function assertUnchanged(before: SeoPlanningDraft, after: SeoPlanningDraft) {
  assert.deepEqual(after, before);
}

test("Phase C seed: frozen opportunity only, deterministic, empty sources omitted, view does not write", () => {
  const draft = baseDraft();
  const before = structuredClone(draft);
  const derived = deriveSeoPlanningSuggestions(draft);
  const displayed = seoPlanningSuggestionsForDisplay(draft);
  assert.deepEqual(displayed, derived);
  assert.deepEqual(draft, before);
  assert.equal(readPersistedSeoPlanningSuggestions(draft.payload), null);
  assert.deepEqual(Object.keys(derived), [
    "workingTitle",
    "topic",
    "searchIntent",
    "contentAngle",
    "nextStep",
  ]);
  assert.equal(derived.workingTitle?.originalValue, "Fire TV buffering UK");
  assert.equal(derived.workingTitle?.value, "Fire TV buffering UK");
  assert.equal(derived.workingTitle?.status, "PENDING");
  assert.equal(derived.topic?.originalValue, "Fire TV buffering");
  assert.equal(derived.contentAngle?.originalValue, "Add a short checklist.");
  assert.equal(derived.nextStep?.originalValue, "Review the existing guide.");
  assert.equal("whyNow" in derived, false);
  assert.equal("restorePath" in derived, false);
  assert.equal("matchedPublicUrl" in derived, false);
  assert.equal("gscEvidence" in derived, false);

  const sparse = baseDraft();
  const opp = opportunity({ suggestedAngle: "   ", nextStep: "", searchIntent: "NOPE" });
  sparse.payload = { ...(sparse.payload as object), opportunity: opp };
  const sparseDerived = deriveSeoPlanningSuggestions(sparse);
  assert.deepEqual(Object.keys(sparseDerived), ["workingTitle", "topic"]);
  assert.equal(sparseDerived.contentAngle, undefined);
  assert.equal(sparseDerived.nextStep, undefined);
  assert.equal(sparseDerived.searchIntent, undefined);
});

test("Phase C seed: content recommendations allow five keys; internal link allows angle and next step only", () => {
  for (const recommendation of ["NEW_BLOG", "REFRESH_EXISTING", "RESTORE_HISTORICAL"] as const) {
    assert.deepEqual(
      [...allowedSeoPlanningSuggestionKeys(recommendation)],
      ["workingTitle", "topic", "searchIntent", "contentAngle", "nextStep"],
    );
  }
  assert.deepEqual(
    [...allowedSeoPlanningSuggestionKeys("INTERNAL_LINK_ONLY")],
    ["contentAngle", "nextStep"],
  );

  const link = baseDraft({
    recommendation: "INTERNAL_LINK_ONLY",
    fingerprint: "INTERNAL_LINK_ONLY:post_1",
    proposedSlug: "",
  });
  const derived = deriveSeoPlanningSuggestions(link);
  assert.deepEqual(Object.keys(derived), ["contentAngle", "nextStep"]);
  const rejected = run(link, { key: "workingTitle", operation: "EDIT", value: "Nope" });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error, "That suggestion is not available for this plan.");
  }
  assert.equal(readPersistedSeoPlanningSuggestions(link.payload), null);
});

test("Phase C seed: first successful edit persists the full set and a later edit does not reset it", () => {
  const draft = baseDraft();
  const displayed = seoPlanningSuggestionsForDisplay(draft);
  const edited = run(draft, { key: "topic", operation: "EDIT", value: "Edited topic" });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  const seeded = suggestionsOf(edited.draft);
  assert.ok(seeded);
  for (const key of Object.keys(displayed) as SeoPlanningSuggestionKey[]) {
    assert.equal(seeded?.[key]?.originalValue, displayed[key]?.originalValue);
    if (key === "topic") {
      assert.equal(seeded?.[key]?.value, "Edited topic");
      assert.equal(seeded?.[key]?.status, "PENDING");
    } else {
      assert.deepEqual(seeded?.[key], displayed[key]);
    }
  }
  assert.equal(edited.draft.topic, draft.topic);
  assert.equal(edited.draft.workingTitle, draft.workingTitle);

  const second = run(edited.draft, { key: "workingTitle", operation: "EDIT", value: "Edited title" }, LATER);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const again = suggestionsOf(second.draft);
  assert.equal(again?.topic?.originalValue, "Fire TV buffering");
  assert.equal(again?.topic?.value, "Edited topic");
  assert.equal(again?.topic?.status, "PENDING");
  assert.equal(again?.workingTitle?.originalValue, "Fire TV buffering UK");
  assert.equal(again?.workingTitle?.value, "Edited title");
  assert.equal(second.draft.workingTitle, draft.workingTitle);
  assert.equal(second.draft.topic, draft.topic);
});

test("Phase C edit: candidate only, APPLIED edit does not change the planning field, IGNORED edit rejected", () => {
  const draft = baseDraft();
  const applied = run(draft, { key: "workingTitle", operation: "APPLY" });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(suggestionsOf(applied.draft)?.workingTitle?.status, "APPLIED");
  assert.equal(applied.draft.workingTitle, "Fire TV buffering UK");

  const edited = run(applied.draft, {
    key: "workingTitle",
    operation: "EDIT",
    value: "A different candidate",
  }, LATER);
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(suggestionsOf(edited.draft)?.workingTitle?.status, "PENDING");
  assert.equal(suggestionsOf(edited.draft)?.workingTitle?.value, "A different candidate");
  assert.equal(suggestionsOf(edited.draft)?.workingTitle?.originalValue, "Fire TV buffering UK");
  assert.equal(edited.draft.workingTitle, "Fire TV buffering UK");

  const ignored = run(draft, { key: "topic", operation: "IGNORE" });
  assert.equal(ignored.ok, true);
  if (!ignored.ok) return;
  const rejected = run(ignored.draft, { key: "topic", operation: "EDIT", value: "Try again" });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error, "Ignored suggestions stay as they are.");
  assert.equal(suggestionsOf(ignored.draft)?.topic?.status, "IGNORED");
  assert.equal(ignored.draft.topic, draft.topic);
});

test("Phase C edit: blank, over-cap, and bad intent are rejected without seeding", () => {
  const draft = baseDraft();
  const before = structuredClone(draft);
  const blank = run(draft, { key: "workingTitle", operation: "EDIT", value: "   " });
  const long = run(draft, {
    key: "workingTitle",
    operation: "EDIT",
    value: "x".repeat(SEO_PLANNING_FIELD_CAPS.workingTitle + 1),
  });
  const intent = run(draft, { key: "searchIntent", operation: "EDIT", value: "NOT_A_REAL_INTENT" });
  const angle = run(draft, {
    key: "contentAngle",
    operation: "EDIT",
    value: "y".repeat(SEO_PLANNING_FIELD_CAPS.suggestedAngle + 1),
  });
  assert.equal(blank.ok, false);
  assert.equal(long.ok, false);
  assert.equal(intent.ok, false);
  assert.equal(angle.ok, false);
  if (!blank.ok) assert.match(blank.error, /required/i);
  if (!long.ok) assert.match(long.error, /too long/i);
  if (!intent.ok) assert.equal(intent.error, "Choose a valid search intent.");
  assertUnchanged(before, draft);
  assert.equal(readPersistedSeoPlanningSuggestions(draft.payload), null);
});

test("Phase C apply: mapped field only, equal apply needs no ack, mismatch needs explicit ack", () => {
  const draft = baseDraft({ workingTitle: "Manual planning title" });
  const before = structuredClone(draft);
  const blocked = run(draft, { key: "workingTitle", operation: "APPLY" });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.needsReplaceConfirmation, true);
    assert.equal(blocked.error, SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE);
  }
  assertUnchanged(before, draft);
  assert.equal(readPersistedSeoPlanningSuggestions(draft.payload), null);

  const replaced = run(draft, {
    key: "workingTitle",
    operation: "APPLY",
    value: "HACKED FROM THE REQUEST",
    acknowledgeReplace: true,
  });
  assert.equal(replaced.ok, true);
  if (!replaced.ok) return;
  assert.equal(replaced.draft.workingTitle, "Fire TV buffering UK");
  assert.notEqual(replaced.draft.workingTitle, "HACKED FROM THE REQUEST");
  assert.equal(replaced.draft.topic, draft.topic);
  assert.equal(replaced.draft.searchIntent, draft.searchIntent);
  assert.equal(suggestionsOf(replaced.draft)?.workingTitle?.status, "APPLIED");
  assert.equal(suggestionsOf(replaced.draft)?.topic?.status, "PENDING");
  assert.equal(workspaceOf(replaced.draft).humanNotes, "Keep me");
  assert.equal(workspaceOf(replaced.draft).contentAngle, undefined);

  const equal = run(baseDraft(), { key: "topic", operation: "APPLY" });
  assert.equal(equal.ok, true);
  if (!equal.ok) return;
  assert.equal(equal.draft.topic, "Fire TV buffering");
  assert.equal(suggestionsOf(equal.draft)?.topic?.status, "APPLIED");
  const duplicate = run(equal.draft, { key: "topic", operation: "APPLY" }, LATER);
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.draft.updatedAt, equal.draft.updatedAt);
  assert.equal(duplicate.draft.topic, equal.draft.topic);
});

test("Phase C apply: content angle and next step write only their workspace fields", () => {
  const draft = baseDraft();
  const angle = run(draft, { key: "contentAngle", operation: "APPLY", acknowledgeReplace: true });
  assert.equal(angle.ok, true);
  if (!angle.ok) return;
  assert.equal(workspaceOf(angle.draft).contentAngle, "Add a short checklist.");
  assert.equal(workspaceOf(angle.draft).nextStep, undefined);
  assert.equal(workspaceOf(angle.draft).humanNotes, "Keep me");
  assert.equal(angle.draft.topic, draft.topic);
  assert.equal(angle.draft.workingTitle, draft.workingTitle);
  assert.equal(suggestionsOf(angle.draft)?.contentAngle?.status, "APPLIED");
  assert.equal(suggestionsOf(angle.draft)?.nextStep?.status, "PENDING");

  const step = run(angle.draft, { key: "nextStep", operation: "APPLY", acknowledgeReplace: true }, LATER);
  assert.equal(step.ok, true);
  if (!step.ok) return;
  assert.equal(workspaceOf(step.draft).nextStep, "Review the existing guide.");
  assert.equal(workspaceOf(step.draft).contentAngle, "Add a short checklist.");
  assert.equal(suggestionsOf(step.draft)?.contentAngle?.status, "APPLIED");
  assert.equal(suggestionsOf(step.draft)?.contentAngle?.value, "Add a short checklist.");
  assert.equal(step.draft.searchIntent, draft.searchIntent);
});

test("Phase C apply: IGNORED is rejected and READY_TO_PUBLISH blocks apply without seeding", () => {
  const draft = baseDraft();
  const ignored = run(draft, { key: "searchIntent", operation: "IGNORE" });
  assert.equal(ignored.ok, true);
  if (!ignored.ok) return;
  assert.equal(ignored.draft.searchIntent, "TROUBLESHOOTING");
  const rejected = run(ignored.draft, {
    key: "searchIntent",
    operation: "APPLY",
    acknowledgeReplace: true,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error, "Ignored suggestions cannot be applied.");
  assert.equal(suggestionsOf(ignored.draft)?.searchIntent?.status, "IGNORED");

  const ready = baseDraft({ workflowStatus: "READY_TO_PUBLISH", workingTitle: "Manual title" });
  const before = structuredClone(ready);
  const applyReady = run(ready, { key: "workingTitle", operation: "APPLY", acknowledgeReplace: true });
  assert.equal(applyReady.ok, false);
  if (!applyReady.ok) assert.equal(applyReady.error, SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE);
  assertUnchanged(before, ready);
  assert.equal(readPersistedSeoPlanningSuggestions(ready.payload), null);

  const editReady = run(ready, { key: "topic", operation: "EDIT", value: "Ready topic candidate" });
  assert.equal(editReady.ok, true);
  if (!editReady.ok) return;
  assert.equal(editReady.draft.workflowStatus, "READY_TO_PUBLISH");
  assert.equal(editReady.draft.topic, ready.topic);
  assert.equal(suggestionsOf(editReady.draft)?.topic?.status, "PENDING");
  assert.equal(suggestionsOf(editReady.draft)?.topic?.value, "Ready topic candidate");

  const ignoreReady = run(editReady.draft, { key: "nextStep", operation: "IGNORE" }, LATER);
  assert.equal(ignoreReady.ok, true);
  if (!ignoreReady.ok) return;
  assert.equal(ignoreReady.draft.workflowStatus, "READY_TO_PUBLISH");
  assert.equal(suggestionsOf(ignoreReady.draft)?.nextStep?.status, "IGNORED");
  assert.equal(workspaceOf(ignoreReady.draft).nextStep, undefined);
});

test("Phase C ignore: planning field unchanged, repeated ignore is idempotent", () => {
  const draft = baseDraft({ topic: "Manual topic" });
  const ignored = run(draft, { key: "topic", operation: "IGNORE" });
  assert.equal(ignored.ok, true);
  if (!ignored.ok) return;
  assert.equal(ignored.changed, true);
  assert.equal(ignored.draft.topic, "Manual topic");
  assert.equal(suggestionsOf(ignored.draft)?.topic?.status, "IGNORED");
  assert.equal(suggestionsOf(ignored.draft)?.topic?.value, "Fire TV buffering");
  assert.equal(suggestionsOf(ignored.draft)?.topic?.originalValue, "Fire TV buffering");
  const again = run(ignored.draft, { key: "topic", operation: "IGNORE" }, LATER);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.changed, false);
  assert.equal(again.draft, ignored.draft);
  assert.equal(again.draft.topic, "Manual topic");
});

test("Phase C preservation: evidence, notes, unknown keys, immutable routing, and siblings survive", () => {
  const draft = baseDraft({
    recommendation: "RESTORE_HISTORICAL",
    fingerprint: "RESTORE_HISTORICAL:/old-path/",
    proposedSlug: "",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "/old-path/",
  });
  const beforePayload = structuredClone(draft.payload);
  const applied = run(draft, { key: "topic", operation: "APPLY", acknowledgeReplace: true });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.draft.recommendation, "RESTORE_HISTORICAL");
  assert.equal(applied.draft.fingerprint, "RESTORE_HISTORICAL:/old-path/");
  assert.equal(applied.draft.proposedSlug, "");
  assert.equal(applied.draft.targetPostId, null);
  assert.equal(applied.draft.matchedPublicUrl, "");
  assert.equal(applied.draft.restorePath, "/old-path/");
  assert.equal(applied.draft.linkedPostId, null);
  assert.equal(applied.draft.createdBy, "admin_1");
  assert.equal(applied.draft.createdAt, draft.createdAt);
  assert.equal(applied.draft.workflowStatus, "PLANNING");
  const payload = applied.draft.payload as {
    opportunity?: unknown;
    sources?: unknown;
    gsc?: unknown;
    futureBlock?: unknown;
  };
  assert.deepEqual(payload.opportunity, (beforePayload as { opportunity?: unknown }).opportunity);
  assert.deepEqual(payload.sources, (beforePayload as { sources?: unknown }).sources);
  assert.deepEqual(payload.gsc, (beforePayload as { gsc?: unknown }).gsc);
  assert.deepEqual(payload.futureBlock, { ok: true });
  assert.equal(workspaceOf(applied.draft).humanNotes, "Keep me");
  assert.equal(workspaceOf(applied.draft).keeper, "yes");
  assert.equal(suggestionsOf(applied.draft)?.workingTitle?.status, "PENDING");
  assert.equal(suggestionsOf(applied.draft)?.workingTitle?.value, "Fire TV buffering UK");
});

test("Phase C: Phase B workspace save preserves suggestions, angle, next step, and unknown keys", () => {
  const seeded = run(baseDraft(), { key: "workingTitle", operation: "APPLY" });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) return;
  const withAngle = run(seeded.draft, {
    key: "contentAngle",
    operation: "APPLY",
    acknowledgeReplace: true,
  }, LATER);
  assert.equal(withAngle.ok, true);
  if (!withAngle.ok) return;
  const parsed = parseSeoPlanningWorkspaceInput({
    id: withAngle.draft.id,
    topic: "Phase B topic",
    workingTitle: "Phase B title",
    searchIntent: "SETUP",
    humanNotes: "Phase B notes",
    workflowStatus: "CONTENT_NEEDED",
    payload: { wiped: true },
    suggestions: { wiped: true },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const saved = applySeoPlanningWorkspaceUpdate(withAngle.draft, parsed.value, "2026-10-06T14:00:00.000Z");
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.draft.topic, "Phase B topic");
  assert.equal(saved.draft.workingTitle, "Phase B title");
  assert.equal(saved.draft.searchIntent, "SETUP");
  assert.equal(saved.draft.workflowStatus, "CONTENT_NEEDED");
  assert.equal(workspaceOf(saved.draft).humanNotes, "Phase B notes");
  assert.equal(workspaceOf(saved.draft).contentAngle, "Add a short checklist.");
  assert.equal(workspaceOf(saved.draft).keeper, "yes");
  assert.equal(suggestionsOf(saved.draft)?.workingTitle?.status, "APPLIED");
  assert.equal(suggestionsOf(saved.draft)?.workingTitle?.value, "Fire TV buffering UK");
  assert.equal(suggestionsOf(saved.draft)?.contentAngle?.status, "APPLIED");
  assert.equal(seoPlanningSuggestionDrift(saved.draft, "workingTitle", suggestionsOf(saved.draft)!.workingTitle!), true);

  const needsAck = run(saved.draft, { key: "workingTitle", operation: "APPLY" });
  assert.equal(needsAck.ok, false);
  if (!needsAck.ok) assert.equal(needsAck.needsReplaceConfirmation, true);
  assert.equal(saved.draft.workingTitle, "Phase B title");

  const reapplied = run(saved.draft, {
    key: "workingTitle",
    operation: "APPLY",
    acknowledgeReplace: true,
  }, "2026-10-06T15:00:00.000Z");
  assert.equal(reapplied.ok, true);
  if (!reapplied.ok) return;
  assert.equal(reapplied.draft.workingTitle, "Fire TV buffering UK");
  assert.equal(suggestionsOf(reapplied.draft)?.workingTitle?.status, "APPLIED");
  assert.equal(reapplied.draft.topic, "Phase B topic");
  assert.equal(workspaceOf(reapplied.draft).humanNotes, "Phase B notes");
});

test("Phase C action boundary: parser ignores browser payload, unknown keys fail, permission and calm errors stay in source", () => {
  const parsed = parseSeoPlanningSuggestionInput({
    id: "seoplan_c1",
    key: "workingTitle",
    operation: "APPLY",
    value: "browser candidate",
    acknowledgeReplace: false,
    originalValue: "hacked original",
    status: "IGNORED",
    payload: { opportunity: { wiped: true } },
    workspace: { humanNotes: "hacked" },
    recommendation: "NEW_BLOG",
    fingerprint: "hacked",
    updatedAt: "2099-01-01T00:00:00.000Z",
    currentPlanningValue: "hacked",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, {
    id: "seoplan_c1",
    key: "workingTitle",
    operation: "APPLY",
    acknowledgeReplace: false,
  });

  const unknown = parseSeoPlanningSuggestionInput({
    id: "seoplan_c1",
    key: "restorePath",
    operation: "APPLY",
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error, "That suggestion is not available.");

  const missing = run(baseDraft({ id: "other" }), { id: "seoplan_c1", key: "topic", operation: "IGNORE" });
  assert.equal(missing.ok, false);

  const actions = read("lib/cms/seo-planning-actions.ts");
  const suggestions = read("lib/cms/seo-planning/suggestions.ts");
  assert.match(actions, /updateSeoPlanningSuggestionAction/);
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /SEO_PLANNING_MISSING_DRAFT_MESSAGE/);
  assert.match(read("lib/cms/seo-planning/lifecycle.ts"), /That planning draft could not be found/);
  assert.match(actions, /Could not save the planning draft/);
  assert.doesNotMatch(actions, /savePost\(|saveRedirect\(|requestOpenAi|buildUkGscEvidencePack|web_search|revalidatePath/);
  assert.doesNotMatch(suggestions, /savePost\(|saveRedirect\(|requestOpenAi|buildUkGscEvidencePack|web_search|from "@\/lib\/cms\/repository"/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 5);
});

test("Phase C UI: planning value is distinct, dirty state blocks actions, replace is explicit, no public actions", () => {
  const ui = read("components/sidhu/SeoPlanningSuggestions.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  assert.match(ui, /Suggested value/);
  assert.match(ui, /Current planning value/);
  assert.match(ui, /SEO_PLANNING_SUGGESTION_DIRTY_MESSAGE/);
  assert.match(ui, /unsavedWorkspace/);
  assert.match(detail, /blocked=\{dirty \|\| controlsLocked\}/);
  assert.match(detail, /unsavedWorkspace=\{dirty\}/);
  assert.equal(
    SEO_PLANNING_SUGGESTION_DIRTY_MESSAGE,
    "Save your planning changes before updating suggestions.",
  );
  assert.match(ui, /disabled=\{blocked \|\| busy \|\| ignored\}/);
  assert.match(ui, /disabled=\{blocked \|\| busy\}/);
  assert.match(ui, /acknowledgeReplace: false/);
  assert.match(ui, /acknowledgeReplace: true/);
  assert.match(ui, /Confirm replace/);
  assert.match(ui, /Save suggestion/);
  assert.match(ui, /kind: "confirm"/);
  assert.equal(
    SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE,
    "This will replace the current planning value.",
  );
  assert.equal(
    SEO_PLANNING_SUGGESTION_DRIFT_MESSAGE,
    "Current planning value changed after this suggestion was applied.",
  );
  assert.equal(
    SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE,
    "Move this plan back to SEO Review before applying a suggestion.",
  );
  assert.match(ui, /suggestion\.value/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML|Generate|Regenerate|Create Blog|Restore page|saveRedirect/);
  assert.doesNotMatch(ui, /\bPublish\b/);
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML|Generate|Regenerate|Create Blog|Restore page/);
  assert.match(detail, /<SeoPlanningSuggestions/);
});
