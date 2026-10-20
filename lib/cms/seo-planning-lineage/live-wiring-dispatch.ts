/**
 * FLIX-L4B-ACTIVATION-RC-01 — Fail-closed Sidhu Proceed / permanent-delete dispatch.
 *
 * Production application seam only. No caller-selectable execution functions.
 *
 * Production OFF defaults (compile-time; not env/request controllable):
 *   - SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED = false
 *   - RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED = false
 *   → existing manual Proceed / lifecycle permanent-delete only
 *   → zero durable lineage inserts
 *
 * Physical presence of seo_planning_decision_links must not change OFF dispatch.
 * Physical readiness probes are never invoked from this module.
 *
 * Intentionally does NOT import:
 *   - transactional-execution (ungated executor)
 *   - transactional-integration (facade stays separate until activation patch)
 *   - tools/seo-planning-lineage-test-harness
 *   - tools live-wiring test simulation helpers
 *
 * Test-only ON simulation lives exclusively under tools/
 * (`seo-planning-lineage-live-wiring-test-dispatch.ts`).
 *
 * Future production activation requires a separate explicit release patch that:
 *   1. Authorizes schema/DDL readiness + flips RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED
 *   2. Wires transactional-integration facade → transactional-execution
 *   3. Points this dispatch's production branch at the facade (no manual fallback)
 * Until then, executeTransactionalTrustedProceedAndLink remains ACTIVATION_DENIED.
 */

import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "@/lib/cms/seo-planning-lineage/proceed-integration";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "@/lib/cms/seo-planning-lineage/schema-ddl";
import {
  ignoreClientSuppliedLineageFlags,
  SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
} from "@/lib/cms/seo-planning-lineage/delete-policy";
import {
  proceedSeoOpportunityToPlanningDraft,
  type ProceedSeoPlanningResult,
  type SeoPlanningCatalog,
} from "@/lib/cms/seo-planning/proceed";
import {
  confirmSeoPlanningPermanentDelete,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import { classifyPlanningFenceError } from "@/lib/cms/seo-planning-lineage/planning-write-fence-errors";
import type { SeoPlanningDraft } from "@/lib/cms/types";

export const LIVE_WIRING_PREP_VERSION = "l4b-live-wiring-prep-v1" as const;

/**
 * Hard-off live wiring gate. Not overridable by environment or caller input.
 * A future supervised release must change this constant in an explicit activation patch.
 */
export const SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED = false as const;

export type SidhuProceedDispatchPath = "MANUAL_PROCEED";

export type SidhuPermanentDeleteDispatchPath = "LEGACY_PERMANENT_DELETE";

/**
 * Ignore client-supplied activation / lineage capability claims.
 * Never treat these fields as authority.
 */
export function ignoreClientSuppliedLiveWiringFlags(raw: unknown): void {
  ignoreClientSuppliedLineageFlags(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const row = raw as Record<string, unknown>;
  void row.activation;
  void row.activate;
  void row.forceTransactional;
  void row.durableLink;
  void row.durableLinkAuthorized;
  void row.liveWiring;
  void row.liveWiringAuthorized;
  void row.useTransactionalProceed;
  void row.useProtectedDelete;
  void row.__testOnly;
  void row.testInjection;
  void row.allowDurableLineageWrites;
  void row.mode;
  void row.transactionalProceed;
  void row.transactionalDelete;
}

/**
 * Resolve Proceed dispatch path. Production constants force MANUAL_PROCEED.
 * Env vars, request bags, and forged authorization args cannot flip this.
 */
export function resolveSidhuProceedDispatchPath(args?: {
  liveWiringAuthorized?: boolean;
  durableLinkAuthorized?: boolean;
}): SidhuProceedDispatchPath {
  // Document compile-time gates; never read process.env for authorization.
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
  void process.env.SIDHU_TRANSACTIONAL_LIVE_WIRING;
  void process.env.RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  void process.env.L4B_LIVE_WIRING;

  const live =
    args?.liveWiringAuthorized ?? SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED;
  const durable =
    args?.durableLinkAuthorized ?? RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;

  // Production prep seam stays MANUAL until a separately reviewed activation patch
  // wires the facade → execution and flips compile-time gates.
  void live;
  void durable;
  return "MANUAL_PROCEED";
}

/**
 * Resolve permanent-delete dispatch path. Production defaults to legacy delete.
 */
export function resolveSidhuPermanentDeleteDispatchPath(args?: {
  liveWiringAuthorized?: boolean;
}): SidhuPermanentDeleteDispatchPath {
  void process.env.SIDHU_TRANSACTIONAL_LIVE_WIRING;
  void SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED;
  void args?.liveWiringAuthorized;
  return "LEGACY_PERMANENT_DELETE";
}

/**
 * Production Proceed dispatch — always manual while live wiring is OFF.
 *
 * No testInjection / callable capability parameter. Future ON must be a
 * reviewed source patch routing through the production facade only.
 */
export async function dispatchSidhuProceedToPlanning(args: {
  rawOpportunity: unknown;
  rawSources?: unknown;
  rawGscMeta?: unknown;
  adminId: string;
  catalog: SeoPlanningCatalog;
  now?: string;
  createIdFn?: (prefix?: string) => string;
}): Promise<ProceedSeoPlanningResult> {
  void resolveSidhuProceedDispatchPath();

  return proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: args.rawOpportunity,
    rawSources: args.rawSources,
    rawGscMeta: args.rawGscMeta,
    adminId: args.adminId,
    catalog: args.catalog,
    now: args.now,
    createIdFn: args.createIdFn,
  });
}

export type SidhuPermanentDeleteDispatchResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

/**
 * Production permanent-delete dispatch — legacy archive/confirm/catalog delete.
 *
 * No testInjection / callable capability parameter.
 * FK ON DELETE RESTRICT remains the final DB integrity boundary if lineage rows exist;
 * catalog/MySQL errors are sanitized here (no unlink/cascade).
 */
export async function dispatchSidhuPermanentDelete(args: {
  planningDraftId: string;
  confirmation: string;
  draft: SeoPlanningDraft | null;
  deletePermanently: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}): Promise<SidhuPermanentDeleteDispatchResult> {
  void resolveSidhuPermanentDeleteDispatchPath();

  if (!args.draft) {
    return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
  }

  const confirmed = confirmSeoPlanningPermanentDelete(args.draft, args.confirmation);
  if (!confirmed.ok) return confirmed;

  try {
    return await args.deletePermanently(args.planningDraftId);
  } catch (error) {
    const fenced = classifyPlanningFenceError(error);
    if (fenced) {
      return { ok: false, error: fenced.message, code: fenced.code };
    }
    // Includes MySQL FK RESTRICT (ER_ROW_IS_REFERENCED_2 / errno 1451) when a
    // lineage row blocks parent delete — fail closed, sanitized, no unlink.
    return {
      ok: false,
      error: "Could not permanently delete the planning draft. Please try again.",
    };
  }
}

/**
 * Documents why live transactional writes cannot occur while OFF.
 * Pure metadata for audits/tests — performs no I/O.
 */
export function describeLiveWiringOffGuarantees(): {
  liveWiringAuthorized: false;
  durableLinkAuthorized: false;
  ddlRegisteredWithEnsure: false;
  productionProceedPath: "MANUAL_PROCEED";
  productionDeletePath: "LEGACY_PERMANENT_DELETE";
  lineageInsertReachableFromOffDispatch: false;
  facadeRemainsActivationDeniedUntilSeparatePatch: true;
  automaticManualFallbackOnTransactionalFailure: false;
  productionDispatchAcceptsTestInjection: false;
  linkedDeleteBlockedMessage: typeof SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE;
} {
  return {
    liveWiringAuthorized: SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED,
    durableLinkAuthorized: RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED,
    ddlRegisteredWithEnsure: L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
    productionProceedPath: "MANUAL_PROCEED",
    productionDeletePath: "LEGACY_PERMANENT_DELETE",
    lineageInsertReachableFromOffDispatch: false,
    facadeRemainsActivationDeniedUntilSeparatePatch: true,
    automaticManualFallbackOnTransactionalFailure: false,
    productionDispatchAcceptsTestInjection: false,
    linkedDeleteBlockedMessage: SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
  };
}
