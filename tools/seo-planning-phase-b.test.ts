/**
 * Phase B — SEO planning workspace + private workflow transitions.
 * Mocks only. No Google / OpenAI / production CMS writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  SEO_PLANNING_HUMAN_NOTES_CAP,
  allowedSeoPlanningTransitions,
  applySeoPlanningWorkspaceUpdate,
  isAllowedSeoPlanningWorkflowTransition,
  parseSeoPlanningWorkspaceInput,
  readWorkspaceHumanNotes,
} from "../lib/cms/seo-planning";
import type { SeoPlanningDraft, SeoPlanningWorkflowStatus } from "../lib/cms/types";
import { SEO_PLANNING_WORKFLOW_STATUSES } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function baseDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_b1",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:fire-tv-buffering-uk",
    topic: "Fire TV buffering",
    workingTitle: "Fire TV buffering UK",
    proposedSlug: "fire-tv-buffering-uk",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    payload: {
      opportunity: {
        topic: "Fire TV buffering",
        workingTitle: "Fire TV buffering UK",
        confidence: "HIGH",
        whyNow: "Amazon help is current.",
      },
      sources: [{ title: "Amazon", url: "https://example.com/a", domain: "example.com" }],
      gsc: { status: "ok", statusLabel: "GSC evidence included", helperText: "UK window" },
    },
    ...overrides,
  };
}

function workspaceInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "seoplan_b1",
    topic: "Updated topic",
    workingTitle: "Updated working title",
    searchIntent: "INFORMATIONAL",
    humanNotes: "Private notes",
    workflowStatus: "PLANNING",
    ...overrides,
  };
}

test("Phase B: topic and workingTitle updates accepted", () => {
  const stored = baseDraft();
  const parsed = parseSeoPlanningWorkspaceInput(workspaceInput());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value, "2026-10-06T12:00:00.000Z");
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.draft.topic, "Updated topic");
  assert.equal(applied.draft.workingTitle, "Updated working title");
});

test("Phase B: valid searchIntent accepted; invalid rejected", () => {
  const ok = parseSeoPlanningWorkspaceInput(workspaceInput({ searchIntent: "SETUP" }));
  assert.equal(ok.ok, true);
  const bad = parseSeoPlanningWorkspaceInput(workspaceInput({ searchIntent: "NOT_A_REAL_INTENT" }));
  assert.equal(bad.ok, false);
});

test("Phase B: humanNotes stored under payload.workspace and capped", () => {
  const stored = baseDraft();
  const longNotes = "n".repeat(SEO_PLANNING_HUMAN_NOTES_CAP + 250);
  const parsed = parseSeoPlanningWorkspaceInput(workspaceInput({ humanNotes: longNotes }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.humanNotes.length, SEO_PLANNING_HUMAN_NOTES_CAP);

  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value, "2026-10-06T12:00:00.000Z");
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(readWorkspaceHumanNotes(applied.draft.payload), parsed.value.humanNotes);
  const workspace = (applied.draft.payload as { workspace?: { humanNotes?: string } }).workspace;
  assert.equal(workspace?.humanNotes, parsed.value.humanNotes);
});

test("Phase B: existing opportunity/sources/gsc payload preserved", () => {
  const stored = baseDraft();
  const parsed = parseSeoPlanningWorkspaceInput(
    workspaceInput({ humanNotes: "Keep evidence", workflowStatus: "CONTENT_NEEDED" }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value, "2026-10-06T12:00:00.000Z");
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const payload = applied.draft.payload as {
    opportunity?: { whyNow?: string; confidence?: string };
    sources?: unknown[];
    gsc?: { statusLabel?: string };
    workspace?: { humanNotes?: string };
  };
  assert.equal(payload.opportunity?.whyNow, "Amazon help is current.");
  assert.equal(payload.opportunity?.confidence, "HIGH");
  assert.equal(payload.sources?.length, 1);
  assert.equal(payload.gsc?.statusLabel, "GSC evidence included");
  assert.equal(payload.workspace?.humanNotes, "Keep evidence");
});

test("Phase B: immutable fields preserved from stored draft", () => {
  const stored = baseDraft({
    recommendation: "REFRESH_EXISTING",
    fingerprint: "REFRESH_EXISTING:post_abc",
    proposedSlug: "",
    targetPostId: "post_abc",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    restorePath: "",
    linkedPostId: null,
    createdBy: "admin_original",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const parsed = parseSeoPlanningWorkspaceInput(
    workspaceInput({
      id: stored.id,
      // Forged immutable-looking fields must be ignored by parser/apply.
      recommendation: "NEW_BLOG",
      fingerprint: "NEW_BLOG:hacked",
      proposedSlug: "hacked-slug",
      targetPostId: "post_hacked",
      matchedPublicUrl: "/blogs/hacked/",
      restorePath: "/hacked/",
      linkedPostId: "post_linked",
      createdBy: "attacker",
      createdAt: "2099-01-01T00:00:00.000Z",
      payload: { opportunity: { wiped: true } },
    } as Record<string, unknown>),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // Parser only keeps allowed keys.
  assert.equal("recommendation" in parsed.value, false);
  assert.equal("fingerprint" in parsed.value, false);
  assert.equal("payload" in parsed.value, false);

  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value, "2026-10-06T12:00:00.000Z");
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.draft.recommendation, "REFRESH_EXISTING");
  assert.equal(applied.draft.fingerprint, "REFRESH_EXISTING:post_abc");
  assert.equal(applied.draft.proposedSlug, "");
  assert.equal(applied.draft.targetPostId, "post_abc");
  assert.equal(applied.draft.matchedPublicUrl, "/blogs/how-to-watch-iptv-on-firestick/");
  assert.equal(applied.draft.restorePath, "");
  assert.equal(applied.draft.linkedPostId, null);
  assert.equal(applied.draft.createdBy, "admin_original");
  assert.equal(applied.draft.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(applied.draft.updatedAt, "2026-10-06T12:00:00.000Z");
  assert.notEqual(applied.draft.updatedAt, stored.updatedAt);
  const opportunity = (applied.draft.payload as { opportunity?: { wiped?: boolean; whyNow?: string } })
    .opportunity;
  assert.equal(opportunity?.wiped, undefined);
  assert.equal(opportunity?.whyNow, "Amazon help is current.");
});

test("Phase B: restorePath immutable on RESTORE drafts", () => {
  const stored = baseDraft({
    recommendation: "RESTORE_HISTORICAL",
    fingerprint: "RESTORE_HISTORICAL:/how-to-fix-buffering-issues-on-iptv/",
    proposedSlug: "",
    restorePath: "/how-to-fix-buffering-issues-on-iptv/",
  });
  const parsed = parseSeoPlanningWorkspaceInput(
    workspaceInput({
      id: stored.id,
      restorePath: "/welcome/",
      workflowStatus: "CONTENT_NEEDED",
    } as Record<string, unknown>),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.draft.restorePath, "/how-to-fix-buffering-issues-on-iptv/");
});

test("Phase B: valid workflow transitions accepted; invalid rejected", () => {
  const edges: Array<[SeoPlanningWorkflowStatus, SeoPlanningWorkflowStatus]> = [
    ["PLANNING", "CONTENT_NEEDED"],
    ["CONTENT_NEEDED", "PLANNING"],
    ["CONTENT_NEEDED", "IMAGE_NEEDED"],
    ["IMAGE_NEEDED", "CONTENT_NEEDED"],
    ["IMAGE_NEEDED", "SEO_REVIEW"],
    ["SEO_REVIEW", "IMAGE_NEEDED"],
    ["SEO_REVIEW", "CONTENT_NEEDED"],
    ["SEO_REVIEW", "READY_TO_PUBLISH"],
    ["READY_TO_PUBLISH", "SEO_REVIEW"],
  ];
  for (const [from, to] of edges) {
    assert.equal(isAllowedSeoPlanningWorkflowTransition(from, to), true, `${from}→${to}`);
    const stored = baseDraft({ workflowStatus: from });
    const parsed = parseSeoPlanningWorkspaceInput(workspaceInput({ workflowStatus: to }));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) continue;
    const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
    assert.equal(applied.ok, true, `apply ${from}→${to}`);
    if (!applied.ok) continue;
    assert.equal(applied.draft.workflowStatus, to);
  }

  assert.equal(isAllowedSeoPlanningWorkflowTransition("PLANNING", "READY_TO_PUBLISH"), false);
  const badParsed = parseSeoPlanningWorkspaceInput(
    workspaceInput({ workflowStatus: "READY_TO_PUBLISH" }),
  );
  assert.equal(badParsed.ok, true);
  if (!badParsed.ok) return;
  const bad = applySeoPlanningWorkspaceUpdate(
    baseDraft({ workflowStatus: "PLANNING" }),
    badParsed.value,
  );
  assert.equal(bad.ok, false);
});

test("Phase B: same-status field save accepted", () => {
  const stored = baseDraft({ workflowStatus: "SEO_REVIEW" });
  const parsed = parseSeoPlanningWorkspaceInput(
    workspaceInput({ workflowStatus: "SEO_REVIEW", topic: "Same status topic" }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.draft.workflowStatus, "SEO_REVIEW");
  assert.equal(applied.draft.topic, "Same status topic");
});

test("Phase B: READY_TO_PUBLISH remains private data only", () => {
  const stored = baseDraft({ workflowStatus: "SEO_REVIEW" });
  const parsed = parseSeoPlanningWorkspaceInput(
    workspaceInput({ workflowStatus: "READY_TO_PUBLISH" }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.draft.workflowStatus, "READY_TO_PUBLISH");
  assert.equal(applied.draft.linkedPostId, null);
  assert.equal(applied.draft.proposedSlug, stored.proposedSlug);
  // No public publish markers in draft shape.
  assert.equal("publishedAt" in applied.draft, false);
  assert.equal("publicUrl" in applied.draft, false);
});

test("Phase B: INTERNAL_LINK_ONLY stays PLANNING; forged transition rejected", () => {
  const stored = baseDraft({
    recommendation: "INTERNAL_LINK_ONLY",
    fingerprint: "INTERNAL_LINK_ONLY:/blogs/x/:topic",
    proposedSlug: "",
    matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
    workflowStatus: "PLANNING",
  });
  const stay = parseSeoPlanningWorkspaceInput(
    workspaceInput({ id: stored.id, workflowStatus: "PLANNING", topic: "Link notes topic" }),
  );
  assert.equal(stay.ok, true);
  if (!stay.ok) return;
  const ok = applySeoPlanningWorkspaceUpdate(stored, stay.value);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.draft.workflowStatus, "PLANNING");
  assert.equal(ok.draft.topic, "Link notes topic");

  const forged = parseSeoPlanningWorkspaceInput(
    workspaceInput({ id: stored.id, workflowStatus: "CONTENT_NEEDED" }),
  );
  assert.equal(forged.ok, true);
  if (!forged.ok) return;
  const rejected = applySeoPlanningWorkspaceUpdate(stored, forged.value);
  assert.equal(rejected.ok, false);
});

test("Phase B: allowed transitions graph matches content recommendations only", () => {
  assert.deepEqual([...allowedSeoPlanningTransitions("PLANNING")], ["CONTENT_NEEDED"]);
  assert.deepEqual([...allowedSeoPlanningTransitions("CONTENT_NEEDED")], [
    "PLANNING",
    "IMAGE_NEEDED",
  ]);
  assert.deepEqual([...allowedSeoPlanningTransitions("IMAGE_NEEDED")], [
    "CONTENT_NEEDED",
    "SEO_REVIEW",
  ]);
  assert.deepEqual([...allowedSeoPlanningTransitions("SEO_REVIEW")], [
    "IMAGE_NEEDED",
    "CONTENT_NEEDED",
    "READY_TO_PUBLISH",
  ]);
  assert.deepEqual([...allowedSeoPlanningTransitions("READY_TO_PUBLISH")], ["SEO_REVIEW"]);
  for (const status of SEO_PLANNING_WORKFLOW_STATUSES) {
    assert.equal(isAllowedSeoPlanningWorkflowTransition(status, status), true);
  }
});

test("Phase B action/source safety: permission, no public writes, no stale guard", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  const workspace = read("lib/cms/seo-planning/workspace.ts");
  assert.match(actions, /saveSeoPlanningWorkspaceAction/);
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /SEO_PLANNING_MISSING_DRAFT_MESSAGE/);
  assert.match(read("lib/cms/seo-planning/lifecycle.ts"), /That planning draft could not be found/);
  assert.doesNotMatch(actions, /expectedUpdatedAt/);
  assert.doesNotMatch(workspace, /expectedUpdatedAt/);
  assert.match(actions, /Last save wins/i);
  assert.match(actions, /DATETIME second precision/);
  assert.match(workspace, /last save wins/i);
  assert.doesNotMatch(actions, /savePost\(/);
  assert.doesNotMatch(actions, /saveRedirect\(/);
  assert.doesNotMatch(actions, /requestOpenAi|buildUkGscEvidencePack|web_search/);
  assert.doesNotMatch(workspace, /savePost\(|saveRedirect\(|requestOpenAi|buildUkGscEvidencePack/);
  assert.match(actions, /No OpenAI\. No GSC\. No BlogPost\. No redirects\. No publish/);
});

test("Phase B UI: editable workspace without publish/create/restore/free workflow dropdown", () => {
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const list = read("components/sidhu/SeoPlanningList.tsx");
  assert.match(detail, /Save planning draft/);
  assert.match(detail, /StickyEditorBar/);
  assert.match(detail, /humanNotes/);
  assert.match(detail, /allowedSeoPlanningTransitions/);
  assert.match(detail, /Still private — this does not publish anything/);
  assert.match(detail, /Internal-link planning task/);
  assert.match(detail, /Read-only opportunity evidence/);
  assert.doesNotMatch(detail, /Publish|Create Blog|Restore page|Apply\/Edit\/Ignore/);
  assert.doesNotMatch(detail, /<select[^>]*workflow/i);
  // List stays server-rendered so full planning payloads are not client-serialized for a filter.
  assert.doesNotMatch(list, /["']use client["']/);
  assert.doesNotMatch(list, /useState|useMemo|Workflow status|FILTER_OPTIONS/);
  assert.match(list, /Private planning drafts/);
});

test("Phase B: no schema version bump; humanNotes cap constant present", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 4);
  assert.equal(SEO_PLANNING_HUMAN_NOTES_CAP, 4000);
  const schema = read("lib/db/schema.ts");
  assert.doesNotMatch(schema, /human_notes/);
  assert.match(schema, /seo_planning_drafts/);
});

test("Phase B: empty topic/title rejected", () => {
  assert.equal(parseSeoPlanningWorkspaceInput(workspaceInput({ topic: "   " })).ok, false);
  assert.equal(parseSeoPlanningWorkspaceInput(workspaceInput({ workingTitle: "" })).ok, false);
});

test("Phase B: id mismatch rejected", () => {
  const stored = baseDraft({ id: "seoplan_other" });
  const parsed = parseSeoPlanningWorkspaceInput(workspaceInput({ id: "seoplan_b1" }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
  assert.equal(applied.ok, false);
});
