/**
 * L4B activation-RC — Old/manual vs new/transactional worker overlap analysis.
 *
 * Hostinger Cloud Startup does not provide a guaranteed non-destructive
 * all-worker drain. Cross-worker fencing cannot be assumed.
 *
 * Pure documentation + assertable matrix. No I/O. No activation.
 */

import {
  RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED,
} from "@/lib/cms/seo-planning-lineage/proceed-integration";
import { SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED } from "@/lib/cms/seo-planning-lineage/live-wiring-dispatch";

export const L4B_WORKER_OVERLAP_ANALYSIS_VERSION = "l4b-worker-overlap-v1" as const;

export type WorkerProceedMode = "OLD_MANUAL" | "NEW_OFF_MANUAL" | "NEW_ON_TRANSACTIONAL";

export type WorkerOverlapVerdict = "PASS" | "CONDITIONAL" | "BLOCKED";

export type WorkerOverlapCell = {
  left: WorkerProceedMode;
  right: WorkerProceedMode;
  verdict: WorkerOverlapVerdict;
  reasons: string[];
  releaseGate?: string;
};

/**
 * Compatibility matrix for concurrent Hostinger workers.
 * An old worker cannot be forced to obey a new application feature flag.
 */
export const L4B_WORKER_OVERLAP_MATRIX: readonly WorkerOverlapCell[] = [
  {
    left: "OLD_MANUAL",
    right: "NEW_OFF_MANUAL",
    verdict: "PASS",
    reasons: [
      "Both paths use manual proceedSeoOpportunityToPlanningDraft semantics.",
      "Unused seo_planning_decision_links table is tolerated (no lineage writes).",
      "Fingerprint / idempotent open-existing behavior remains shared.",
      "Write-freeze (if enabled) applies process-locally; no cross-worker fencing claimed.",
    ],
  },
  {
    left: "NEW_OFF_MANUAL",
    right: "NEW_OFF_MANUAL",
    verdict: "PASS",
    reasons: [
      "Identical OFF dispatch → manual Proceed.",
      "No durable lineage INSERT; facade remains ACTIVATION_DENIED.",
    ],
  },
  {
    left: "OLD_MANUAL",
    right: "NEW_ON_TRANSACTIONAL",
    verdict: "BLOCKED",
    reasons: [
      "Same Research opportunity may be proceeded by both writers concurrently.",
      "Old worker creates/opens Planning without lineage; new worker may LINK or EXISTING_DRAFT_UNLINKED.",
      "Fingerprint collisions can yield unlinked drafts that falsely appear eligible for later link claims.",
      "Legacy permanent-delete on old workers ignores L4B-5 policy (FK RESTRICT may still block if linked).",
      "Unknown commit interleaving can leave audit lineage inconsistent with Planning history.",
      "Application-level freeze/flag on new workers does not stop old workers.",
    ],
    releaseGate:
      "Requires operational worker fencing / non-overlapping cutover before writer activation — not available via Hostinger startup drain alone.",
  },
  {
    left: "NEW_OFF_MANUAL",
    right: "NEW_ON_TRANSACTIONAL",
    verdict: "BLOCKED",
    reasons: [
      "Rolling activation can leave OFF and ON application workers concurrent.",
      "OFF workers still perform manual Proceed without lineage; ON workers write links.",
      "Same dual-writer races as OLD_MANUAL + NEW_ON_TRANSACTIONAL.",
    ],
    releaseGate:
      "Writer activation must not begin until all serving workers are the activation build AND overlap fencing is solved.",
  },
  {
    left: "NEW_ON_TRANSACTIONAL",
    right: "NEW_ON_TRANSACTIONAL",
    verdict: "CONDITIONAL",
    reasons: [
      "Same-build transactional writers share L4B-6 atomic Proceed+link semantics.",
      "Duplicate Decision protection / idempotent link still required under concurrency.",
      "Physical schema readiness must revalidate READY at activation boundary.",
      "Hostinger post-CREATE deployed SHA must be known and match the activation candidate.",
    ],
    releaseGate:
      "Separate explicit writer-activation approval after SHA preflight, readiness READY, and overlap fencing.",
  },
] as const;

export function classifyWorkerOverlap(
  left: WorkerProceedMode,
  right: WorkerProceedMode,
): WorkerOverlapCell {
  const ordered = [left, right].sort().join("|");
  for (const cell of L4B_WORKER_OVERLAP_MATRIX) {
    const key = [cell.left, cell.right].sort().join("|");
    if (key === ordered || (cell.left === left && cell.right === right)) {
      return cell;
    }
    // Also match reversed pair for symmetric PASS/BLOCKED rows.
    if (cell.left === right && cell.right === left) {
      return { ...cell, left, right };
    }
  }
  return {
    left,
    right,
    verdict: "BLOCKED",
    reasons: ["Unlisted worker combination — fail closed."],
    releaseGate: "Document and approve the combination explicitly before activation.",
  };
}

/** Current local candidate is Stage 1 only (deploy with writers OFF). */
export function describeCurrentRolloutStage(): {
  stage: "DEPLOY_WRITERS_OFF";
  liveWiringAuthorized: false;
  durableLinkAuthorized: false;
  writerActivationAuthorized: false;
  oldManualPlusNewOff: "PASS";
  fullWriterActivation: "NO-GO";
} {
  void RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED;
  void SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED;
  return {
    stage: "DEPLOY_WRITERS_OFF",
    liveWiringAuthorized: false,
    durableLinkAuthorized: false,
    writerActivationAuthorized: false,
    oldManualPlusNewOff: "PASS",
    fullWriterActivation: "NO-GO",
  };
}
