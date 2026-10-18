/**
 * L4B-6 — Production-facing transactional Proceed/link & protected delete entrypoints.
 *
 * Closed by default. Does not accept caller-provided test activation capabilities.
 * Live Proceed/delete server actions remain unwired.
 *
 * Intentionally does NOT import the ungated transactional execution module.
 * Disposable MySQL tests reach that module only via the tools test harness.
 */

import "server-only";

import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "@/lib/cms/seo-planning-lineage/proceed-integration";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "@/lib/cms/seo-planning-lineage/schema-ddl";
import { sanitizeText } from "@/lib/cms/validation";

export const L4B6_TRANSACTIONAL_INTEGRATION_VERSION = "l4b6-v1" as const;

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

/**
 * Production Proceed+link entrypoint — fail-closed.
 * Does not accept test activation objects. Live wiring remains OFF.
 */
export async function executeTransactionalTrustedProceedAndLink(
  _args: Record<string, unknown>,
): Promise<TransactionalProceedAndLinkResult> {
  void _args;
  void RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
  return failProceed("SELECTION_UNAVAILABLE", "ACTIVATION_DENIED", "Access denied.");
}

/**
 * Production protected-delete entrypoint — fail-closed.
 * Does not accept test activation objects. Live wiring remains OFF.
 */
export async function executeTransactionalProtectedPermanentDelete(
  _args: Record<string, unknown>,
): Promise<TransactionalProtectedDeleteResult> {
  void _args;
  void RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  return {
    ok: false,
    deleted: false,
    errorCode: "ACTIVATION_DENIED",
    errorMessage: "Access denied.",
    planningDraftId: null,
  };
}
