/**
 * L4B-1 / L4B-2 — Trusted selection context for Planning ↔ decision lineage writes.
 *
 * A client-supplied decisionId is a locator only.
 * Writes require an opaque TrustedPlanningDecisionSelection minted from a
 * same-request PreparedResearchProceedSelection (L4B-2) plus a Planning draft id.
 *
 * WeakSet registry is process-local and NOT durable across HTTP requests/workers.
 * Only tryMintTrustedPlanningDecisionSelection may register membership.
 * There is no exported registrar or test issuer.
 * Never serialize minted objects to the browser.
 */

import { sanitizeText } from "@/lib/cms/validation";
import { SEO_PLANNING_LINEAGE_CAPS } from "@/lib/cms/seo-planning-lineage/types";
import {
  isPreparedResearchProceedSelection,
  type PreparedResearchProceedSelection,
} from "@/lib/cms/seo-planning-lineage/research-proceed-selection";

/** Opaque server-minted selection proof. Structurally plain; authority is mint registry. */
export type TrustedPlanningDecisionSelection = {
  readonly planningDraftId: string;
  readonly decisionId: string;
  readonly researchRunId: string;
  readonly actorAdminId: string;
  readonly boundAt: string;
};

/** Production-only registry — not shared with test fixtures. */
const mintedSelections = new WeakSet<object>();

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

export function isTrustedPlanningDecisionSelection(
  value: unknown,
): value is TrustedPlanningDecisionSelection {
  return typeof value === "object" && value !== null && mintedSelections.has(value);
}

/**
 * Mint a lineage write capability only from a same-request prepared Research
 * selection plus a Planning draft id. Client-shaped bindings never succeed.
 *
 * Cross-request / JSON-revived prepared objects fail isPreparedResearchProceedSelection.
 */
export function tryMintTrustedPlanningDecisionSelection(args: {
  planningDraftId: string;
  decisionId: string;
  researchRunId: string;
  actorAdminId: string;
  /**
   * Must be a WeakSet-registered PreparedResearchProceedSelection from
   * prepareTrustedResearchProceedSelection in this process.
   */
  serverResearchBinding: unknown;
}):
  | { ok: true; selection: TrustedPlanningDecisionSelection }
  | { ok: false; errorCode: "SELECTION_PROVENANCE_UNAVAILABLE"; errorMessage: string } {
  const planningDraftId = trimField(args.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id);
  const decisionId = trimField(args.decisionId, SEO_PLANNING_LINEAGE_CAPS.id);
  const researchRunId = trimField(args.researchRunId, SEO_PLANNING_LINEAGE_CAPS.id);
  const actorAdminId = trimField(args.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId);

  if (!planningDraftId || !decisionId || !researchRunId || !actorAdminId) {
    return {
      ok: false,
      errorCode: "SELECTION_PROVENANCE_UNAVAILABLE",
      errorMessage:
        "Trusted Research selection binding is not available. Lineage writes remain disconnected.",
    };
  }

  if (!isPreparedResearchProceedSelection(args.serverResearchBinding)) {
    return {
      ok: false,
      errorCode: "SELECTION_PROVENANCE_UNAVAILABLE",
      errorMessage:
        "Trusted Research selection binding is not available. Lineage writes remain disconnected.",
    };
  }

  const prepared: PreparedResearchProceedSelection = args.serverResearchBinding;
  if (
    prepared.decisionId !== decisionId ||
    prepared.researchRunId !== researchRunId ||
    prepared.actorAdminId !== actorAdminId
  ) {
    return {
      ok: false,
      errorCode: "SELECTION_PROVENANCE_UNAVAILABLE",
      errorMessage:
        "Trusted Research selection binding does not match lineage locators.",
    };
  }

  const selection: TrustedPlanningDecisionSelection = {
    planningDraftId,
    decisionId,
    researchRunId,
    actorAdminId,
    boundAt: new Date().toISOString(),
  };
  mintedSelections.add(selection);
  return { ok: true, selection };
}

export function trustedSelectionMatchesLocators(
  selection: TrustedPlanningDecisionSelection,
  locators: {
    planningDraftId: string;
    decisionId: string;
    actorAdminId: string;
    researchRunId: string;
  },
): boolean {
  return (
    selection.planningDraftId === trimField(locators.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id) &&
    selection.decisionId === trimField(locators.decisionId, SEO_PLANNING_LINEAGE_CAPS.id) &&
    selection.actorAdminId === trimField(locators.actorAdminId, SEO_PLANNING_LINEAGE_CAPS.adminId) &&
    selection.researchRunId === trimField(locators.researchRunId, SEO_PLANNING_LINEAGE_CAPS.id)
  );
}
