/**
 * Planning draft lifecycle: Archive / Restore / Permanent Delete.
 * Orthogonal to workflow status. Never touches BlogPost, Media, redirects, or providers.
 */

import type { SeoPlanningDraft } from "@/lib/cms/types";

export type SeoPlanningListLifecycle = "active" | "archived" | "all";

export const SEO_PLANNING_ARCHIVED_EDIT_MESSAGE =
  "This planning draft is archived. Restore it before editing.";
export const SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE =
  "Archived planning drafts cannot generate prompts. Restore the draft first.";
export const SEO_PLANNING_ARCHIVED_PROCEED_MESSAGE =
  "A planning draft for this opportunity is archived. Restore it from Planning → Archived, or permanently delete it before creating a new one.";
export const SEO_PLANNING_ALREADY_ARCHIVED_MESSAGE = "That planning draft is already archived.";
export const SEO_PLANNING_NOT_ARCHIVED_MESSAGE =
  "Only archived planning drafts can be restored or permanently deleted.";
export const SEO_PLANNING_MISSING_DRAFT_MESSAGE = "That planning draft could not be found.";
export const SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE =
  "Confirmation did not match this planning draft. Permanent delete was cancelled.";

/**
 * Thrown by ordinary Planning persistence when the authoritative row is archived.
 * Restore is the only path that may clear archivedAt — never generic save.
 */
export class SeoPlanningArchivedMutationError extends Error {
  readonly code = "planning_archived" as const;
  constructor(message = SEO_PLANNING_ARCHIVED_EDIT_MESSAGE) {
    super(message);
    this.name = "SeoPlanningArchivedMutationError";
  }
}

export function isSeoPlanningArchivedMutationError(
  error: unknown,
): error is SeoPlanningArchivedMutationError {
  return (
    error instanceof SeoPlanningArchivedMutationError ||
    (error instanceof Error && error.name === "SeoPlanningArchivedMutationError")
  );
}

/** Final write-boundary guard for ordinary Save / suggestion / workflow persistence. */
export function assertSeoPlanningDraftMutableForOrdinarySave(
  latest: Pick<SeoPlanningDraft, "archivedAt">,
): void {
  if (isSeoPlanningDraftArchived(latest)) {
    throw new SeoPlanningArchivedMutationError();
  }
}

export function isSeoPlanningDraftArchived(
  draft: Pick<SeoPlanningDraft, "archivedAt"> | null | undefined,
): boolean {
  if (!draft) return false;
  const value = draft.archivedAt;
  return typeof value === "string" && value.trim().length > 0;
}

export function filterSeoPlanningDraftsByLifecycle(
  drafts: readonly SeoPlanningDraft[],
  lifecycle: SeoPlanningListLifecycle = "active",
): SeoPlanningDraft[] {
  if (lifecycle === "all") return [...drafts];
  if (lifecycle === "archived") return drafts.filter((draft) => isSeoPlanningDraftArchived(draft));
  return drafts.filter((draft) => !isSeoPlanningDraftArchived(draft));
}

export type SeoPlanningLifecycleApplyResult =
  | { ok: true; draft: SeoPlanningDraft }
  | { ok: false; error: string };

export function archiveSeoPlanningDraftRecord(
  stored: SeoPlanningDraft,
  now = new Date().toISOString(),
): SeoPlanningLifecycleApplyResult {
  if (isSeoPlanningDraftArchived(stored)) {
    return { ok: false, error: SEO_PLANNING_ALREADY_ARCHIVED_MESSAGE };
  }
  return {
    ok: true,
    draft: {
      ...stored,
      archivedAt: now,
      updatedAt: now,
    },
  };
}

export function restoreSeoPlanningDraftRecord(
  stored: SeoPlanningDraft,
  now = new Date().toISOString(),
): SeoPlanningLifecycleApplyResult {
  if (!isSeoPlanningDraftArchived(stored)) {
    return { ok: false, error: SEO_PLANNING_NOT_ARCHIVED_MESSAGE };
  }
  return {
    ok: true,
    draft: {
      ...stored,
      archivedAt: null,
      updatedAt: now,
    },
  };
}

export function assertArchivedForPermanentDelete(
  stored: SeoPlanningDraft,
): { ok: true } | { ok: false; error: string } {
  if (!isSeoPlanningDraftArchived(stored)) {
    return { ok: false, error: SEO_PLANNING_NOT_ARCHIVED_MESSAGE };
  }
  return { ok: true };
}

/** Title/id token the UI asks the operator to type for permanent delete. */
export function seoPlanningPermanentDeleteConfirmToken(draft: SeoPlanningDraft): string {
  return (draft.workingTitle || draft.id).trim();
}

export function parseSeoPlanningLifecycleId(raw: unknown): { ok: true; id: string } | { ok: false; error: string } {
  const id =
    raw && typeof raw === "object" && !Array.isArray(raw) && "id" in raw
      ? String((raw as { id?: unknown }).id || "").trim()
      : typeof raw === "string"
        ? raw.trim()
        : "";
  if (!id) return { ok: false, error: "Planning draft id is required." };
  return { ok: true, id };
}

export function parseSeoPlanningPermanentDeleteInput(
  raw: unknown,
): { ok: true; id: string; confirmation: string } | { ok: false; error: string } {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!row) return { ok: false, error: "Planning draft id is required." };
  const id = String(row.id || "").trim();
  if (!id) return { ok: false, error: "Planning draft id is required." };
  const confirmation = String(row.confirmation || "").trim();
  if (!confirmation) {
    return { ok: false, error: SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE };
  }
  return { ok: true, id, confirmation };
}

export function confirmSeoPlanningPermanentDelete(
  draft: SeoPlanningDraft,
  confirmation: string,
): { ok: true } | { ok: false; error: string } {
  const expected = seoPlanningPermanentDeleteConfirmToken(draft);
  if (confirmation.trim() !== expected) {
    return { ok: false, error: SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE };
  }
  return { ok: true };
}
