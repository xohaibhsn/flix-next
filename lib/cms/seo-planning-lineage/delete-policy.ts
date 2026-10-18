/**
 * L4B-5 — Future-facing Planning permanent-delete policy for lineage-linked drafts.
 *
 * Pure decisioning. No DB drivers, UI, or server actions.
 * Does NOT wire into deleteSeoPlanningDraftPermanentlyAction (activation blocked).
 *
 * Database FK ON DELETE RESTRICT remains the final integrity boundary.
 * A read-only policy check alone is not a safe delete gate under concurrency.
 */

import {
  confirmSeoPlanningPermanentDelete,
  isSeoPlanningDraftArchived,
  SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
  SEO_PLANNING_NOT_ARCHIVED_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import type { ResolvePlanningDecisionLineageResult } from "@/lib/cms/seo-planning-lineage/types";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";

export const SEO_PLANNING_LINEAGE_DELETE_POLICY_VERSION = "l4b5-v1" as const;

/**
 * Central operator message when an authoritative lineage link blocks permanent delete.
 * Do not duplicate this string in future actions/UI.
 */
export const SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE =
  "This Planning draft is linked to a Research decision and cannot be permanently deleted while its audit lineage is retained. You can archive it instead.";

export const SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE =
  "Planning lineage protection is unavailable. Permanent delete was blocked to preserve audit integrity.";

export const SEO_PLANNING_LINEAGE_CONFLICT_DELETE_MESSAGE =
  "Planning lineage is inconsistent. Permanent delete was blocked to preserve audit integrity.";

/** Explicit permanent-delete decisions for lineage-aware future activation. */
export const PLANNING_PERMANENT_DELETE_POLICY_DECISIONS = [
  "ALLOW_UNLINKED_ARCHIVED",
  "DENY_MISSING_DRAFT",
  "DENY_NOT_ARCHIVED",
  "DENY_CONFIRMATION_MISMATCH",
  "DENY_LINKED",
  "DENY_LINEAGE_UNAVAILABLE",
  "DENY_LINEAGE_CONFLICT",
  /** Lineage protection not engaged — legacy archive/confirm rules only. */
  "ALLOW_LEGACY_LIFECYCLE_ONLY",
] as const;

export type PlanningPermanentDeletePolicyDecision =
  (typeof PLANNING_PERMANENT_DELETE_POLICY_DECISIONS)[number];

export type PlanningPermanentDeletePolicyResult =
  | {
      ok: true;
      decision: "ALLOW_UNLINKED_ARCHIVED" | "ALLOW_LEGACY_LIFECYCLE_ONLY";
      /** Never authorizes unlink/cascade. */
      mayPermanentlyDelete: true;
      automaticUnlink: false;
      cascadeLedger: false;
    }
  | {
      ok: false;
      decision: Exclude<
        PlanningPermanentDeletePolicyDecision,
        "ALLOW_UNLINKED_ARCHIVED" | "ALLOW_LEGACY_LIFECYCLE_ONLY"
      >;
      mayPermanentlyDelete: false;
      automaticUnlink: false;
      cascadeLedger: false;
      errorMessage: string;
    };

export type PlanningLifecycleLineageAllowance =
  | { ok: true; action: "ARCHIVE" | "RESTORE" | "READ"; linked: boolean }
  | { ok: false; action: "ARCHIVE" | "RESTORE" | "READ"; errorMessage: string };

/**
 * Client-supplied linkage claims are never authority.
 * Strip/ignore any such fields if present on an untrusted bag.
 */
export function ignoreClientSuppliedLineageFlags(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const row = raw as Record<string, unknown>;
  void row.linked;
  void row.isLinked;
  void row.lineageLinked;
  void row.hasLineage;
  void row.decisionId;
}

function deny(
  decision: Extract<PlanningPermanentDeletePolicyResult, { ok: false }>["decision"],
  errorMessage: string,
): PlanningPermanentDeletePolicyResult {
  return {
    ok: false,
    decision,
    mayPermanentlyDelete: false,
    automaticUnlink: false,
    cascadeLedger: false,
    errorMessage: sanitizeText(errorMessage, 200).trim(),
  };
}

function allow(
  decision: "ALLOW_UNLINKED_ARCHIVED" | "ALLOW_LEGACY_LIFECYCLE_ONLY",
): PlanningPermanentDeletePolicyResult {
  return {
    ok: true,
    decision,
    mayPermanentlyDelete: true,
    automaticUnlink: false,
    cascadeLedger: false,
  };
}

function applyArchiveAndConfirmation(
  draft: SeoPlanningDraft,
  confirmation: string,
): PlanningPermanentDeletePolicyResult | null {
  if (!isSeoPlanningDraftArchived(draft)) {
    return deny("DENY_NOT_ARCHIVED", SEO_PLANNING_NOT_ARCHIVED_MESSAGE);
  }
  const confirmed = confirmSeoPlanningPermanentDelete(draft, confirmation);
  if (!confirmed.ok) {
    return deny("DENY_CONFIRMATION_MISMATCH", SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE);
  }
  return null;
}

/**
 * Pure permanent-delete policy.
 *
 * When `lineageProtectionActive` is false (current production), lineage state is
 * ignored and only existing archive/confirmation rules apply. Live actions must
 * not activate lineage protection until schema + transactional delete acceptance.
 *
 * When protection is active, `lineage` must be an authoritative
 * `resolvePlanningDecisionLineage` result — never a client boolean.
 */
export function evaluatePlanningPermanentDeletePolicy(args: {
  draft: SeoPlanningDraft | null;
  confirmation: unknown;
  lineageProtectionActive: boolean;
  /** Authoritative server resolve result — required when protection is active. */
  lineage?: ResolvePlanningDecisionLineageResult | null;
  /** Ignored — never authority. */
  clientClaimedLinked?: unknown;
}): PlanningPermanentDeletePolicyResult {
  ignoreClientSuppliedLineageFlags({
    linked: args.clientClaimedLinked,
  });

  if (!args.draft) {
    return deny("DENY_MISSING_DRAFT", SEO_PLANNING_MISSING_DRAFT_MESSAGE);
  }

  const confirmation =
    typeof args.confirmation === "string" ? args.confirmation : String(args.confirmation ?? "");

  // Lineage protection inactive: preserve legacy lifecycle-only semantics.
  if (!args.lineageProtectionActive) {
    const lifecycleDeny = applyArchiveAndConfirmation(args.draft, confirmation);
    if (lifecycleDeny) return lifecycleDeny;
    return allow("ALLOW_LEGACY_LIFECYCLE_ONLY");
  }

  const lineage = args.lineage;
  if (lineage == null) {
    return deny("DENY_LINEAGE_UNAVAILABLE", SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE);
  }

  if (!lineage.ok) {
    if (lineage.state === "CONFLICT") {
      return deny("DENY_LINEAGE_CONFLICT", SEO_PLANNING_LINEAGE_CONFLICT_DELETE_MESSAGE);
    }
    // UNAVAILABLE (including missing schema / read errors) — fail closed, never UNLINKED.
    return deny("DENY_LINEAGE_UNAVAILABLE", SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE);
  }

  if (lineage.state === "LINKED" || lineage.state === "INCOMPLETE") {
    // Authoritative link row exists (complete or incomplete snapshot) — block delete.
    return deny("DENY_LINKED", SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE);
  }

  if (lineage.state !== "UNLINKED") {
    return deny("DENY_LINEAGE_UNAVAILABLE", SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE);
  }

  const lifecycleDeny = applyArchiveAndConfirmation(args.draft, confirmation);
  if (lifecycleDeny) return lifecycleDeny;
  return allow("ALLOW_UNLINKED_ARCHIVED");
}

/**
 * Archive / restore / read remain allowed for linked drafts.
 * Permanent delete is handled solely by evaluatePlanningPermanentDeletePolicy.
 */
export function evaluatePlanningLifecycleWithLineage(args: {
  action: "ARCHIVE" | "RESTORE" | "READ";
  draft: SeoPlanningDraft | null;
  lineage?: ResolvePlanningDecisionLineageResult | null;
  lineageProtectionActive?: boolean;
}): PlanningLifecycleLineageAllowance {
  if (!args.draft) {
    return { ok: false, action: args.action, errorMessage: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
  }

  let linked = false;
  if (args.lineageProtectionActive && args.lineage) {
    if (!args.lineage.ok) {
      // Lifecycle mutations other than permanent delete are not blocked by unavailable lineage.
      linked = false;
    } else if (args.lineage.state === "LINKED" || args.lineage.state === "INCOMPLETE") {
      linked = true;
    }
  }

  return { ok: true, action: args.action, linked };
}

/**
 * Thin orchestration helper for tests / future activation.
 * Obtains authoritative lineage through an injected resolver only when protection is active.
 */
export async function evaluatePlanningPermanentDeletePolicyAsync(args: {
  draft: SeoPlanningDraft | null;
  confirmation: unknown;
  lineageProtectionActive: boolean;
  resolveLineage?: () => Promise<ResolvePlanningDecisionLineageResult>;
  clientClaimedLinked?: unknown;
}): Promise<PlanningPermanentDeletePolicyResult> {
  let lineage: ResolvePlanningDecisionLineageResult | null = null;
  if (args.lineageProtectionActive) {
    if (!args.resolveLineage) {
      return deny("DENY_LINEAGE_UNAVAILABLE", SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE);
    }
    try {
      lineage = await args.resolveLineage();
    } catch {
      return deny("DENY_LINEAGE_UNAVAILABLE", SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE);
    }
  }
  return evaluatePlanningPermanentDeletePolicy({
    draft: args.draft,
    confirmation: args.confirmation,
    lineageProtectionActive: args.lineageProtectionActive,
    lineage,
    clientClaimedLinked: args.clientClaimedLinked,
  });
}

/**
 * Documents that FK RESTRICT is the final DB guard for any future transactional delete.
 * Policy decisions alone must not be treated as a check-then-delete bypass.
 */
export const PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY = {
  planningFk: "ON DELETE RESTRICT",
  decisionFk: "ON DELETE RESTRICT",
  automaticUnlink: false,
  cascade: false,
  checkThenDeleteSafe: false,
  requiresLockedTransactionOrFkGuard: true,
} as const;
