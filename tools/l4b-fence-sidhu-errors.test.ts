/**
 * Sidhu fence-error mapping — no MySQL, no production writes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyPlanningFenceError,
  PLANNING_FENCE_SIDHU_CODES,
  PLANNING_FENCE_SIDHU_MESSAGES,
  planningFenceMessageLooksUnsafe,
} from "../lib/cms/seo-planning-lineage/planning-write-fence-errors";
import { dispatchSidhuPermanentDelete } from "../lib/cms/seo-planning-lineage/live-wiring-dispatch";
import type { SeoPlanningDraft } from "../lib/cms/types";

const archivedDraft: SeoPlanningDraft = {
  id: "seoplan_fence_del",
  recommendation: "NEW_BLOG",
  workflowStatus: "PLANNING",
  fingerprint: "NEW_BLOG:fence-del",
  topic: "Fence delete topic for UK IPTV planning test",
  workingTitle: "Fence Delete Title",
  proposedSlug: "fence-delete-title",
  targetPostId: null,
  matchedPublicUrl: "",
  restorePath: "",
  searchIntent: "informational",
  linkedPostId: null,
  createdBy: "admin_1",
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
  archivedAt: "2026-10-20T01:00:00.000Z",
  payload: { kind: "fixture" },
};

test("classifyPlanningFenceError maps SIGNAL text to sanitized Sidhu copy", () => {
  const write = classifyPlanningFenceError(
    new Error("ER_SIGNAL_EXCEPTION: PLANNING_WRITE_FENCED"),
  );
  assert.ok(write);
  assert.equal(write!.code, PLANNING_FENCE_SIDHU_CODES.WRITE_FENCED);
  assert.equal(write!.message, PLANNING_FENCE_SIDHU_MESSAGES.WRITE_FENCED);
  assert.equal(planningFenceMessageLooksUnsafe(write!.message), false);

  const del = classifyPlanningFenceError({
    sqlMessage: "PLANNING_DELETE_FENCED",
    message: "Query failed",
  });
  assert.ok(del);
  assert.equal(del!.code, PLANNING_FENCE_SIDHU_CODES.DELETE_FENCED);

  const meta = classifyPlanningFenceError("PLANNING_FENCE_METADATA_MISSING");
  assert.ok(meta);
  assert.equal(meta!.code, PLANNING_FENCE_SIDHU_CODES.METADATA_MISSING);

  assert.equal(classifyPlanningFenceError(new Error("ER_DUP_ENTRY")), null);
});

test("permanent-delete dispatch surfaces fence code without SQL internals", async () => {
  const result = await dispatchSidhuPermanentDelete({
    planningDraftId: archivedDraft.id,
    confirmation: archivedDraft.workingTitle,
    draft: archivedDraft,
    deletePermanently: async () => {
      throw Object.assign(new Error("SIGNAL"), {
        sqlMessage: "PLANNING_DELETE_FENCED",
      });
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, PLANNING_FENCE_SIDHU_CODES.DELETE_FENCED);
  assert.equal(result.error, PLANNING_FENCE_SIDHU_MESSAGES.DELETE_FENCED);
  assert.doesNotMatch(result.error, /sqlMessage|@flix_l4b|errno/i);
});

test("permanent-delete non-fence errors stay generic sanitized", async () => {
  const result = await dispatchSidhuPermanentDelete({
    planningDraftId: archivedDraft.id,
    confirmation: archivedDraft.workingTitle,
    draft: archivedDraft,
    deletePermanently: async () => {
      throw new Error("ER_ROW_IS_REFERENCED_2: Cannot delete parent row");
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, undefined);
  assert.match(result.error, /Could not permanently delete/i);
  assert.doesNotMatch(result.error, /ER_ROW_IS_REFERENCED|1451/i);
});
