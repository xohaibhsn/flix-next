/**
 * Test-only Sidhu live-wiring simulation helpers.
 *
 * Never import from production CMS actions, barrels, or app routes.
 * Production dispatch (`live-wiring-dispatch.ts`) accepts no injection capabilities;
 * these wrappers exist solely so focused unit tests can simulate future ON behavior
 * without exposing a production-callable activation surface.
 */

import { evaluatePlanningPermanentDeletePolicy } from "../lib/cms/seo-planning-lineage/delete-policy";
import type { ResolvePlanningDecisionLineageResult } from "../lib/cms/seo-planning-lineage/types";
import {
  dispatchSidhuPermanentDelete,
  dispatchSidhuProceedToPlanning,
  type SidhuPermanentDeleteDispatchResult,
} from "../lib/cms/seo-planning-lineage/live-wiring-dispatch";
import type {
  ProceedSeoPlanningResult,
  SeoPlanningCatalog,
} from "../lib/cms/seo-planning/proceed";
import { SEO_PLANNING_MISSING_DRAFT_MESSAGE } from "../lib/cms/seo-planning/lifecycle";
import type { SeoPlanningDraft } from "../lib/cms/types";
import { sanitizeText } from "../lib/cms/validation";

export type TransactionalProceedInjectionResult =
  | {
      ok: true;
      planningDraftId: string;
      created: boolean;
      linkageStatus: string;
      linkId: string | null;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      linkageStatus?: string;
      created: false;
    };

export type TransactionalDeleteInjectionResult =
  | { ok: true; deleted: true; planningDraftId: string }
  | {
      ok: false;
      deleted: false;
      errorCode: string;
      errorMessage: string;
      planningDraftId: string | null;
    };

function trimError(message: string): string {
  return sanitizeText(message, 200).replace(/\s+/g, " ").trim();
}

/**
 * Simulate future transactional Proceed without falling back to manual Proceed.
 * Does not touch production dispatch injection (production has none).
 */
export async function simulateTransactionalProceedForTests(args: {
  transactionalProceed: () => Promise<TransactionalProceedInjectionResult>;
}): Promise<ProceedSeoPlanningResult> {
  const result = await args.transactionalProceed();
  if (result.ok) {
    return {
      ok: true,
      id: result.planningDraftId,
      created: result.created,
    };
  }
  return {
    ok: false,
    error: trimError(result.errorMessage || "Could not complete Planning Proceed."),
  };
}

/**
 * Simulate future protected permanent delete (injected executor).
 * Failed protected delete never falls back to legacy catalog delete.
 */
export async function simulateTransactionalProtectedDeleteForTests(args: {
  transactionalDelete: () => Promise<TransactionalDeleteInjectionResult>;
}): Promise<SidhuPermanentDeleteDispatchResult> {
  const result = await args.transactionalDelete();
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: trimError(
      result.errorMessage || "Could not permanently delete the planning draft.",
    ),
  };
}

/**
 * Simulate future L4B-5 protected-delete policy gate with injected lineage evidence.
 * DENY_* never calls deleteIfAllowed (no legacy fallback).
 */
export async function simulateProtectedDeletePolicyForTests(args: {
  draft: SeoPlanningDraft | null;
  confirmation: string;
  lineage: ResolvePlanningDecisionLineageResult | null;
  deleteIfAllowed: (
    planningDraftId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}): Promise<SidhuPermanentDeleteDispatchResult> {
  const policy = evaluatePlanningPermanentDeletePolicy({
    draft: args.draft,
    confirmation: args.confirmation,
    lineageProtectionActive: true,
    lineage: args.lineage,
  });
  if (!policy.ok) {
    return { ok: false, error: policy.errorMessage };
  }
  if (!args.draft) {
    return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
  }
  return args.deleteIfAllowed(args.draft.id);
}

/**
 * Optional convenience: run production OFF dispatch from tests without injection.
 * Re-exports production behavior for parity assertions.
 */
export async function dispatchProductionProceedForTests(args: {
  rawOpportunity: unknown;
  rawSources?: unknown;
  rawGscMeta?: unknown;
  adminId: string;
  catalog: SeoPlanningCatalog;
  now?: string;
  createIdFn?: (prefix?: string) => string;
}): Promise<ProceedSeoPlanningResult> {
  return dispatchSidhuProceedToPlanning(args);
}

export async function dispatchProductionPermanentDeleteForTests(args: {
  planningDraftId: string;
  confirmation: string;
  draft: SeoPlanningDraft | null;
  deletePermanently: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}): Promise<SidhuPermanentDeleteDispatchResult> {
  return dispatchSidhuPermanentDelete(args);
}
