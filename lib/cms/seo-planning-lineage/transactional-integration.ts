/**
 * L4B activation-RC — Production-facing transactional Proceed/link & protected delete.
 *
 * Closed by default. Meaningful deployable facade with an explicit future activation
 * boundary — not a mock-only stub — while remaining inactive for durable writes.
 *
 * Intentionally does NOT import transactional-execution while OFF.
 * Disposable MySQL / tools harness reaches execution only via tools/.
 *
 * Future ON requires a separately reviewed source patch (see
 * describeTransactionalActivationBoundary). Dynamic import alone is not a security gate.
 */

import "server-only";

import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "@/lib/cms/seo-planning-lineage/proceed-integration";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "@/lib/cms/seo-planning-lineage/schema-ddl";
import { SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED } from "@/lib/cms/seo-planning-lineage/live-wiring-dispatch";
import { sanitizeText } from "@/lib/cms/validation";

export const L4B6_TRANSACTIONAL_INTEGRATION_VERSION = "l4b6-v1" as const;
export const L4B_ACTIVATION_RC_FACADE_VERSION = "l4b-activation-rc-v1" as const;

/**
 * Compile-time production writer authorization.
 * Must remain false until an explicit supervised activation patch.
 * Not overridable by env, cookies, headers, query, or request body.
 */
export const L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED = false as const;

export type TransactionalProceedLinkageStatus =
  | "LINKED"
  | "IDEMPOTENT_LINKED"
  | "EXISTING_DRAFT_UNLINKED"
  | "DRAFT_CONFLICT"
  | "PROCEED_FAILED"
  | "SELECTION_UNAVAILABLE"
  | "ROLLED_BACK";

export type TransactionalProceedAndLinkResult =
  | {
      ok: true;
      planningDraftId: string;
      decisionId: string;
      researchRunId: string;
      created: boolean;
      linkageStatus: "LINKED" | "IDEMPOTENT_LINKED" | "EXISTING_DRAFT_UNLINKED";
      linkId: string | null;
      selectionSummary: {
        researchRunId: string;
        decisionId: string;
        opportunityIndex: number;
        actorAdminId: string;
        status: string;
      };
    }
  | {
      ok: false;
      linkageStatus: TransactionalProceedLinkageStatus;
      errorCode: string;
      errorMessage: string;
      planningDraftId: string | null;
      created: false;
    };

export type TransactionalProtectedDeleteResult =
  | { ok: true; deleted: true; planningDraftId: string }
  | {
      ok: false;
      deleted: false;
      errorCode: string;
      errorMessage: string;
      planningDraftId: string | null;
    };

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function failProceed(
  linkageStatus: TransactionalProceedLinkageStatus,
  errorCode: string,
  errorMessage: string,
): TransactionalProceedAndLinkResult {
  return {
    ok: false,
    linkageStatus,
    errorCode,
    errorMessage: trimField(errorMessage, 200),
    planningDraftId: null,
    created: false,
  };
}

/** Strip/ignore client or caller activation capability claims — never authority. */
function ignoreCallerActivationClaims(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const row = raw as Record<string, unknown>;
  void row.activation;
  void row.activate;
  void row.allowDurableLineageWrites;
  void row.allowProtectedDelete;
  void row.mode;
  void row.testInjection;
  void row.__testOnly;
  void row.forceTransactional;
  void row.transactionalProceed;
  void row.transactionalDelete;
}

/**
 * Explicit future activation checklist (source patch — not runtime toggles).
 * Performing these steps is outside this RC and requires separate approval.
 */
export function describeTransactionalActivationBoundary(): {
  writersAuthorized: false;
  durableLinkAuthorized: false;
  sidhuLiveWiringAuthorized: false;
  ddlRegisteredWithEnsure: false;
  importsUngatedExecutorWhileOff: false;
  acceptsTestInjection: false;
  runsSchemaProbeWhileOff: false;
  runsDmlWhileOff: false;
  automaticManualFallback: false;
  futureSourcePatchSteps: readonly string[];
} {
  return {
    writersAuthorized: L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED,
    durableLinkAuthorized: RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED,
    sidhuLiveWiringAuthorized: SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED,
    ddlRegisteredWithEnsure: L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
    importsUngatedExecutorWhileOff: false,
    acceptsTestInjection: false,
    runsSchemaProbeWhileOff: false,
    runsDmlWhileOff: false,
    automaticManualFallback: false,
    futureSourcePatchSteps: [
      "Confirm Hostinger post-CREATE deployed SHA matches the activation candidate.",
      "Revalidate lineage physical schema readiness → READY (injected/trusted DB metadata).",
      "Resolve old/new worker overlap fencing (Hostinger drain alone is insufficient).",
      "Flip L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED and RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED in source.",
      "Wire this facade to the ungated L4B-6 execution module via a static reviewed import.",
      "Point Sidhu live-wiring production branch at this facade (no manual fallback on failure).",
      "Flip SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED only after facade wiring is reviewed.",
      "Do not treat L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE or marker bump as substitutes for physical READY.",
    ],
  };
}

/**
 * Compile-time gate helper. Always false on this RC.
 * Env vars are explicitly ignored and cannot authorize writers.
 */
export function areTransactionalProductionWritersAuthorized(): false {
  void process.env.L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED;
  void process.env.RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  void L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED;
  void RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  return false;
}

/**
 * Production Proceed+link entrypoint — fail-closed while writers unauthorized.
 * No schema probe, no DML, no executor import while OFF.
 *
 * Future activation patch (separate approval): after readiness READY + overlap
 * fencing, flip compile-time gates and replace this body with a reviewed call
 * into the L4B-6 execution module — never fall back to manual Proceed.
 */
export async function executeTransactionalTrustedProceedAndLink(
  args: Record<string, unknown> = {},
): Promise<TransactionalProceedAndLinkResult> {
  ignoreCallerActivationClaims(args);
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
  void SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED;
  void areTransactionalProductionWritersAuthorized();
  return failProceed("SELECTION_UNAVAILABLE", "ACTIVATION_DENIED", "Access denied.");
}

/**
 * Production protected-delete entrypoint — fail-closed while writers unauthorized.
 * No schema probe, no DML, no executor import while OFF.
 *
 * Future activation patch: reviewed call into the L4B-6 protected-delete executor
 * after the same gates — never fall back to legacy delete on protected denial.
 */
export async function executeTransactionalProtectedPermanentDelete(
  args: Record<string, unknown> = {},
): Promise<TransactionalProtectedDeleteResult> {
  ignoreCallerActivationClaims(args);
  void RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  void areTransactionalProductionWritersAuthorized();
  return {
    ok: false,
    deleted: false,
    errorCode: "ACTIVATION_DENIED",
    errorMessage: "Access denied.",
    planningDraftId: null,
  };
}
