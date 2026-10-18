/**
 * Test-only lineage helpers. Never import from production CMS actions or barrels.
 *
 * Minting requires a process-local WeakSet gate issued once in this module —
 * client-shaped objects and barrel imports cannot obtain the same authority.
 */

import {
  issueLineageSelectionTestGate,
  mintTrustedPlanningDecisionSelectionWithTestGate,
  type TrustedPlanningDecisionSelection,
} from "../lib/cms/seo-planning-lineage/selection";
import {
  issueL4B6TestHarnessActivation,
  type L4B6TestHarnessActivation,
} from "../lib/cms/seo-planning-lineage/transactional-integration";

const SELECTION_TEST_GATE = issueLineageSelectionTestGate();

/** Disposable-MySQL / unit-test helper — not a production trust API. */
export function createTrustedPlanningDecisionSelectionForTests(args: {
  planningDraftId: string;
  decisionId: string;
  researchRunId: string;
  actorAdminId: string;
  boundAt?: string;
}): TrustedPlanningDecisionSelection {
  return mintTrustedPlanningDecisionSelectionWithTestGate(SELECTION_TEST_GATE, args);
}

/** Issue a fresh WeakSet-registered L4B-6 activation for disposable MySQL tests. */
export function createL4B6TestHarnessActivationForTests(): L4B6TestHarnessActivation {
  return issueL4B6TestHarnessActivation();
}
